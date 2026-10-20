#!/usr/bin/env python3
"""Check a verified OCI rootfs inventory against exact local Git blobs; no network."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

REPO_ID = 'ghcr.io/lingxi-org/lingxiloop-server'
HEX40 = re.compile(r'[0-9a-f]{40}\Z')
HEX64 = re.compile(r'[0-9a-f]{64}\Z')
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')
CHUNK = 1024 * 1024
MAX_INPUT = 96 * CHUNK
MAX_BLOB = 64 * CHUNK
MAX_TOTAL_BLOBS = 256 * CHUNK
POLICY = {
    'server/docker/lingxiloop-server.Dockerfile': '7302f3d0556021129efb3ec9ed8cd1ca883d222b53aa0c095f1df71e64c27add',
    'server/docker/lingxiloop-server.Dockerfile.dockerignore': '078497d27276599c9b5a23ffde9684613fa1e17430459e489a03b76488dcc96b',
}
SUBTREES = ('server/', 'src/features/chat/visualize/zcode/shared/gen-ui/',
    'src/features/chat/visualize/zcode/gen-ui/domain/', 'third_party/zcode/skills/visualize/')
LIBS = ('agentToolCards', 'researchSources', 'agentCapabilities', 'canvasLayout', 'canvasEventKinds',
    'mentions', 'participantDisplayName', 'agentRunSnapshot', 'nativeMessage', 'userFacingError', 'runActivity', 'memoryActivity')
FILES = tuple('src/lib/' + name + '.ts' for name in LIBS) + (
    'src/features/chat/visualize/zcode/lib/assistantDirectiveParser.ts',
    'third_party/zcode/upstream/packages/desktop/src/renderer/src/plugin-sandbox/genUiTweakRuntime.js',
    'third_party/zcode/LICENSE', 'third_party/zcode/README.md', 'third_party/zcode/manifest.json',
    'third_party/zcode/upstream/LICENSE')
SCOPE_PREFIXES = ('app/server/', 'app/src/', 'app/third_party/zcode/')
GENERATED = 'app/server/assets/visualize-runtime/'
CRITICAL = ('server/src/bin/web.ts', 'server/src/bin/worker.ts', 'server/src/migrate-bin.ts', 'src/lib/participantDisplayName.ts')

class CheckError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

def require(value, code):
    if not value:
        raise CheckError(code)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def read_json(path):
    require(path.stat().st_size <= MAX_INPUT, 'input_size_limit')
    raw = path.read_bytes()
    def unique(items):
        result = {}
        for k, v in items:
            require(k not in result, 'duplicate_json_key')
            result[k] = v
        return result
    return json.loads(raw, object_pairs_hook=unique), sha(raw)

def path_ok(path):
    return isinstance(path, str) and 0 < len(path) <= 16384 and not path.startswith('/') and all(p not in ('', '.', '..') for p in path.split('/')) and not any(ord(c) < 32 or ord(c) == 127 for c in path)

class Git:
    def __init__(self, repository):
        self.command = ['git', '--no-pager', '--no-replace-objects', '-C', str(repository)]
        self.env = {'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'LANG': 'C',
            'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null', 'GIT_OPTIONAL_LOCKS': '0'}
    def read(self, *args):
        result = subprocess.run(self.command + list(args), stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, timeout=30, env=self.env, check=False)
        require(result.returncode == 0, 'local_git_read_failed')
        require(len(result.stdout) <= MAX_INPUT, 'git_output_size_limit')
        return result.stdout
    def tree(self, commit):
        require(self.read('rev-parse', '--verify', commit + '^{commit}').strip().decode() == commit, 'git_commit_mismatch')
        files = {}
        for record in self.read('ls-tree', '-r', '-z', commit).split(b'\0'):
            if not record:
                continue
            meta, raw_path = record.split(b'\t', 1)
            mode, kind, oid = meta.decode().split(' ')
            path = raw_path.decode('utf-8')
            require(path_ok(path) and path not in files, 'unsafe_or_duplicate_git_path')
            files[path] = {'mode': mode, 'type': kind, 'oid': oid}
        return files
    def hash_blobs(self, objects):
        hashes, total = {}, 0
        process = subprocess.Popen(self.command + ['cat-file', '--batch'], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, env=self.env)
        try:
            for oid in sorted(set(objects)):
                require(HEX40.fullmatch(oid), 'unsupported_git_object_id')
                process.stdin.write((oid + '\n').encode())
                process.stdin.flush()
                line = process.stdout.readline(256)
                parts = line.decode().strip().split(' ')
                require(len(parts) == 3 and parts[0] == oid and parts[1] == 'blob', 'git_blob_header_mismatch')
                size = int(parts[2])
                require(0 <= size <= MAX_BLOB, 'git_blob_size_limit')
                total += size
                require(total <= MAX_TOTAL_BLOBS, 'git_blob_total_limit')
                checksum, remaining = hashlib.sha256(), size
                while remaining:
                    data = process.stdout.read(min(CHUNK, remaining))
                    require(bool(data), 'truncated_git_blob')
                    checksum.update(data)
                    remaining -= len(data)
                require(process.stdout.read(1) == b'\n', 'git_blob_terminator_mismatch')
                hashes[oid] = {'bytes': size, 'sha256': checksum.hexdigest()}
            process.stdin.close()
            require(process.wait(timeout=5) == 0, 'git_batch_failed')
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)
            process.stdin.close()
            process.stdout.close()
        return hashes

def ignored(path):
    """Exact exclusions from the hash-pinned dockerignore, within COPY scope."""
    parts = path.split('/')
    if any(p in ('node_modules', '__pycache__', '.cache') for p in parts):
        return True
    if path.startswith('server/'):
        return (path.endswith('.log') or 'dist' in parts or path == 'server/agent-os'
            or path.startswith(('server/agent-os/', 'server/src/__tests__/', 'server/src/__integration__/'))
            or path.endswith('.test.ts') or any(p.startswith('.env') or p == '.venv' for p in parts[1:]))
    if path.startswith('src/'):
        return '.test.' in parts[-1] or '__tests__' in parts
    return False

def source_map(tree):
    expected = {('app/' + path): path for path in tree if (path.startswith(SUBTREES) or path in FILES) and not ignored(path)}
    for path in FILES:
        require(path in tree and 'app/' + path in expected, 'required_copy_source_missing')
    for subtree in SUBTREES:
        require(any(path.startswith(subtree) for path in expected.values()), 'required_copy_subtree_missing')
    expected['app/package.json'] = 'server/package.json'
    expected['app/package-lock.json'] = 'server/package-lock.json'
    for path in expected.values():
        require(path in tree and tree[path]['type'] == 'blob' and tree[path]['mode'] in ('100644', '100755', '120000'), 'unsupported_or_missing_git_source')
    return expected

def in_scope(path):
    return path in ('app/package.json', 'app/package-lock.json', 'app/server', 'app/src', 'app/third_party/zcode') or path.startswith(SCOPE_PREFIXES)

def compare(receipt, inventory, inventory_hash, git, commit):
    require(HEX40.fullmatch(commit), 'exact_commit_required')
    require(receipt.get('passed') is True, 'oci_receipt_not_passed')
    require(receipt.get('inventorySha256') == inventory_hash, 'inventory_hash_mismatch')
    require(receipt.get('sourceCommit') == commit and receipt.get('repository') == REPO_ID, 'oci_source_identity_mismatch')
    require(all(DIGEST.fullmatch(receipt.get(k, '')) for k in ('indexDigest', 'linuxAmd64ManifestDigest', 'configDigest')), 'invalid_oci_identity')
    require(isinstance(inventory, dict) and len(inventory) <= 300000 and all(path_ok(p) for p in inventory), 'invalid_inventory_paths')
    for item in inventory.values():
        require(isinstance(item, dict) and item.get('kind') in ('file', 'hardlink', 'symlink', 'directory'), 'invalid_inventory_entry')
        if item['kind'] in ('file', 'hardlink'):
            require(type(item.get('bytes')) is int and item['bytes'] >= 0 and HEX64.fullmatch(item.get('sha256', '')), 'invalid_file_metadata')
        elif item['kind'] == 'symlink':
            require(isinstance(item.get('target'), str), 'invalid_symlink_metadata')
    tree = git.tree(commit)
    expected = source_map(tree)
    policy_oids = [tree[p]['oid'] for p in POLICY if p in tree]
    require(len(policy_oids) == len(POLICY), 'missing_copy_policy')
    hashes = git.hash_blobs([tree[p]['oid'] for p in set(expected.values())] + policy_oids)
    for path, checksum in POLICY.items():
        require(hashes[tree[path]['oid']]['sha256'] == checksum, 'copy_policy_requires_review')
    migrations = sorted(p for p in tree if p.startswith('server/src/db/migrations/') and p.endswith('.sql'))
    require(len(migrations) == 48 and [p.split('/')[-1][:4] for p in migrations] == [f'{n:04}' for n in range(1, 49)], 'migration_inventory_not_48_sequential')
    require(all(p in tree and 'app/' + p in expected for p in CRITICAL + tuple(migrations)), 'critical_source_missing')
    allowed_dirs = set()
    for path in [*expected, GENERATED.rstrip('/')]:
        parts = path.split('/')
        allowed_dirs.update('/'.join(parts[:i]) for i in range(1, len(parts)))
    matched, issues, generated = [], [], []
    for image_path, source_path in sorted(expected.items()):
        item, source = inventory.get(image_path), tree[source_path]
        want = hashes[source['oid']]
        reason = None
        if item is None:
            reason = 'missing'
        elif source['mode'] == '120000':
            if item.get('kind') != 'symlink' or not isinstance(item.get('target'), str):
                reason = 'kind'
            elif len(item['target'].encode()) != want['bytes'] or sha(item['target'].encode()) != want['sha256']:
                reason = 'hash_or_size'
        elif item.get('kind') not in ('file', 'hardlink'):
            reason = 'kind'
        elif item.get('bytes') != want['bytes'] or item.get('sha256') != want['sha256']:
            reason = 'hash_or_size'
        record = {'imagePath': image_path, 'gitPath': source_path, 'gitBlob': source['oid'], **want}
        if reason:
            issues.append({'path': image_path, 'reason': reason, 'expectedSha256': want['sha256']})
        else:
            matched.append(record)
    outside_count = 0
    for path, item in sorted(inventory.items()):
        if not in_scope(path):
            outside_count += 1
            continue
        if path in expected:
            continue
        require(isinstance(item, dict), 'invalid_inventory_entry')
        if path.startswith(GENERATED) or path == GENERATED.rstrip('/'):
            if path == GENERATED.rstrip('/') and item.get('kind') != 'directory':
                issues.append({'path': path, 'reason': 'generated_root_not_directory'})
            elif item.get('kind') in ('file', 'hardlink'):
                generated.append({'path': path, 'kind': item['kind'], 'bytes': item.get('bytes'), 'sha256': item.get('sha256'), 'classification': 'generated_uncompared'})
            elif item.get('kind') != 'directory':
                issues.append({'path': path, 'reason': 'unsupported_generated_entry'})
        elif item.get('kind') != 'directory' or path not in allowed_dirs:
            issues.append({'path': path, 'reason': 'unknown_non_generated_path'})
    matched_paths = {x['gitPath'] for x in matched}
    return {'passed': not issues, 'expectedCommit': commit, 'indexDigest': receipt['indexDigest'],
        'linuxAmd64ManifestDigest': receipt['linuxAmd64ManifestDigest'], 'inventorySha256': inventory_hash,
        'copyPolicySha256': POLICY, 'expectedCopiedPaths': len(expected), 'matchedCopiedPaths': len(matched),
        'matched': matched, 'issues': issues, 'generatedUncompared': generated,
        'outsideSourceScopeEntries': outside_count,
        'critical': {'migrationFilesExpected': 48, 'migrationFilesMatched': sum(p in matched_paths for p in migrations),
            'entries': [{'gitPath': p, 'matched': p in matched_paths} for p in CRITICAL]},
        'scope': 'direct final-stage copies only; generated Visualize and SPA/dependencies/OS are not claimed Git-matched',
        'readiness': 'not-tested', 'isolation': 'not-tested', 'production': 'not-accessed'}

def save(path, data):
    with path.open('x') as output:
        json.dump(data, output, sort_keys=True, indent=2)
        output.write('\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('receipt', type=Path)
    parser.add_argument('inventory', type=Path)
    parser.add_argument('repository', type=Path)
    parser.add_argument('expected_commit')
    parser.add_argument('outputdir', type=Path)
    args = parser.parse_args()
    require(HEX40.fullmatch(args.expected_commit), 'exact_commit_required')
    args.outputdir.mkdir(mode=0o700, parents=False, exist_ok=False)
    start = time.monotonic()
    def timeout(*_):
        raise CheckError('local_check_deadline')
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(120)
    try:
        receipt, receipt_hash = read_json(args.receipt)
        inventory, inventory_hash = read_json(args.inventory)
        result = compare(receipt, inventory, inventory_hash, Git(args.repository), args.expected_commit)
        result.update(receiptSha256=receipt_hash, elapsedSeconds=round(time.monotonic() - start, 3))
        save(args.outputdir / 'source-check.json', result)
        print(json.dumps({'passed': result['passed'], 'matchedCopiedPaths': result['matchedCopiedPaths'], 'issues': len(result['issues'])}))
        return 0 if result['passed'] else 1
    except Exception as error:
        code = error.code if isinstance(error, CheckError) else 'invalid_local_input'
        save(args.outputdir / 'failure.json', {'passed': False, 'code': code, 'elapsedSeconds': round(time.monotonic() - start, 3)})
        print(json.dumps({'passed': False, 'code': code}))
        return 1
    finally:
        signal.alarm(0)

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except CheckError as error:
        print(json.dumps({'passed': False, 'code': error.code}))
        raise SystemExit(1)
    except Exception:
        print(json.dumps({'passed': False, 'code': 'local_preflight_failure'}))
        raise SystemExit(1)
