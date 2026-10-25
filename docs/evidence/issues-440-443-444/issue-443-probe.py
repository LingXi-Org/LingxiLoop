#!/usr/bin/env python3
"""Compare actual Docker COPY inventories; this is not a production-image build."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile

BASELINE = '9e3bfd892fa53f22dddbc00e98f466c21ce01b7d'
ROOT = Path(__file__).resolve().parents[3]


def git_file(ref, path):
    return subprocess.check_output(['git', 'show', f'{ref}:{path}'], cwd=ROOT)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inventory(archive):
    files = {}
    with tarfile.open(archive) as saved:
        docker_manifest = json.load(saved.extractfile('manifest.json'))[0]
        index = json.load(saved.extractfile('index.json'))
        manifest_descriptor = index['manifests'][0]
        manifest = json.load(saved.extractfile('blobs/' + manifest_descriptor['digest'].replace(':', '/')))
        for layer in docker_manifest['Layers']:
            with tarfile.open(fileobj=io.BytesIO(saved.extractfile(layer).read())) as contents:
                for entry in contents:
                    if entry.isfile():
                        data = contents.extractfile(entry).read()
                        files[entry.name] = {'bytes': len(data), 'sha256': digest(data)}
    return files, {
        'manifest': manifest_descriptor,
        'config': manifest['config'],
        'layers': manifest['layers'],
        'layerBytes': sum(layer['size'] for layer in manifest['layers']),
        'fileCount': len(files),
        'fileBytes': sum(row['bytes'] for row in files.values()),
        'inventorySha256': digest(json.dumps(files, sort_keys=True).encode()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output_directory', type=Path)
    parser.add_argument('--reuse', action='store_true', help='Read existing Docker save archives')
    args = parser.parse_args()
    output = args.output_directory.resolve()
    output.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ)
    env.setdefault('DOCKER_CONFIG', str(output / 'docker-config'))
    notebook = git_file(BASELINE, 'third_party/open-notebook/Dockerfile').decode()
    final = notebook[notebook.index(' AS lingxiloop-rag'):]
    # Exact baseline final-stage source COPYs, without dependency/base-image layers.
    notebook_probe = 'FROM scratch\n' + '\n'.join(
        line for line in final.splitlines()
        if line.startswith('COPY ') and not line.startswith('COPY --from=')
    ) + '\n'
    # Scope is exactly the server source COPY and the final-stage package identity.
    server_probe = ('FROM scratch\nCOPY server/package.json /app/package.json\n'
                    'COPY server/package-lock.json /app/package-lock.json\n'
                    'COPY server /app/server\n')
    specs = {
        'server': (ROOT, 'server/docker/lingxiloop-server.Dockerfile.dockerignore', server_probe),
        'notebook': (ROOT / 'third_party/open-notebook', 'third_party/open-notebook/.dockerignore', notebook_probe),
    }
    report = {'baseline': BASELINE, 'candidate': subprocess.check_output(
        ['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
        'scope': 'scratch COPY probes; OCI archive layer descriptors, not production compressed transfer savings',
        'images': {}, 'diffs': {}}
    all_files = {}
    for kind, (context, ignore, probe) in specs.items():
        for version in ['before', 'after']:
            name = f'{kind}-{version}'
            dockerfile = output / f'{name}.Dockerfile'
            rules = git_file(BASELINE, ignore) if version == 'before' else (ROOT / ignore).read_bytes()
            dockerfile.write_text(probe)
            Path(str(dockerfile) + '.dockerignore').write_bytes(rules)
            archive = output / f'{name}.tar'
            if not args.reuse:
                tag = f'issue443-{kind}:{version}'
                with (output / f'{name}.build.log').open('wb') as log:
                    subprocess.run(['docker', 'build', '--progress=plain', '-f', str(dockerfile),
                                    '-t', tag, str(context)], stdout=log, stderr=subprocess.STDOUT,
                                   env=env, check=True)
                subprocess.run(['docker', 'save', '-o', str(archive), tag], env=env, check=True)
            files, metadata = inventory(archive)
            metadata['dockerfileSha256'] = digest(probe.encode())
            metadata['dockerignoreSha256'] = digest(rules)
            report['images'][name] = metadata
            all_files[name] = files
            (output / f'{name}.inventory.json').write_text(json.dumps(files, indent=2, sort_keys=True) + '\n')
        before, after = (all_files[f'{kind}-{v}'] for v in ['before', 'after'])
        removed = {p: before[p] for p in sorted(before.keys() - after.keys())}
        added = sorted(after.keys() - before.keys())
        changed = sorted(p for p in before.keys() & after.keys() if before[p] != after[p])
        report['diffs'][kind] = {'removed': removed, 'removedFiles': len(removed),
                                'removedSourceBytes': sum(row['bytes'] for row in removed.values()),
                                'added': added, 'changed': changed}
        assert not added and not changed, f'{kind}: unexpected source changes'
        expected = ({'app/server/' + p for p in [
            'fixtures/historical-projection-3.8.2/server/src/agent-runtime/message-projection.ts',
            'fixtures/historical-projection-3.8.2/src/lib/nativeMessage.ts',
            'fixtures/historical-runtime-3.8.2.json', 'run-historical-migration-tests.mjs',
            'run-integration-tests.mjs', 'integration-suite.mjs']}
            if kind == 'server' else {'app/open_notebook/database/' + p for p in [
                'async_migrate.py', 'migrate.py',
                *[f'migrations/{i}{suffix}.surrealql' for i in range(1, 26) for suffix in ['', '_down']]]})
        assert set(removed) == expected, f'{kind}: unexpected removal boundary'
    retained = {'server': ['package.json', 'package-lock.json', 'server/package.json', 'server/package-lock.json',
                           'server/src/bin/web.ts', 'server/src/bin/worker.ts', 'server/src/migrate-bin.ts',
                           'server/src/db/runtime-profile.ts', 'server/src/db/development-runtime-qualification.ts',
                           'server/scripts/knowledge-rag-smoke.ts', 'server/src/db/migrations/0001_v1_baseline.sql'],
                'notebook': ['open_notebook/database/repository.py', 'open_notebook/rag/schema.surrealql',
                             'open_notebook/rag/runtime.py', 'open_notebook/rag/generation.py',
                             'open_notebook/rag/shadow.py', 'api/rag_main.py', 'rag_commands.py']}
    for kind, paths in retained.items():
        for path in paths:
            assert 'app/' + path in all_files[kind + '-after'], f'Missing retained {kind} file: {path}'
    report['retained'] = retained
    (output / 'issue-443-inventory.json').write_text(json.dumps(report, indent=2, sort_keys=True) + '\n')
    print(json.dumps({kind: {k: v for k, v in row.items() if k != 'removed'}
                      for kind, row in report['diffs'].items()}, indent=2))


if __name__ == '__main__':
    main()
