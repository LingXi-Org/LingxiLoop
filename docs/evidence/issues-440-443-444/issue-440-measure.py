"""Export actual local images to OCI layout (gzip level 6), measure bytes/packages.
Registry encoders can produce different compressed sizes. No registry push.
"""
import gzip
import hashlib
import io
import json
import os
import subprocess
import tarfile
from pathlib import Path


def run(*args):
    return subprocess.check_output(args)


result = {'platform': 'linux/amd64', 'compression': 'OCI layer gzip level 6, mtime=0', 'images': {}}
for variant in ['before', 'after']:
    image = 'issue440-' + variant + os.environ.get('RAG_PROBE_IMAGE_SUFFIX', '')
    saved = Path('/tmp/' + image + '.tar')
    subprocess.run(['docker', 'save', '-o', str(saved), image], check=True)
    output = Path('/tmp/' + image + '-oci'); blobs = output / 'blobs/sha256'
    blobs.mkdir(parents=True, exist_ok=True)
    def blob(data, media_type):
        sha = hashlib.sha256(data).hexdigest()
        (blobs / sha).write_bytes(data)
        return {'mediaType': media_type, 'digest': 'sha256:' + sha, 'size': len(data)}
    with tarfile.open(saved) as archive:
        manifest = json.load(archive.extractfile('manifest.json'))[0]
        config = blob(archive.extractfile(manifest['Config']).read(), 'application/vnd.oci.image.config.v1+json')
        layers = []
        for layer in manifest['Layers']:
            data = archive.extractfile(layer).read()
            packed = gzip.compress(data, compresslevel=6, mtime=0)
            layers.append(blob(packed, 'application/vnd.oci.image.layer.v1.tar+gzip'))
        oci_manifest = blob(json.dumps({'schemaVersion': 2, 'mediaType': 'application/vnd.oci.image.manifest.v1+json',
            'config': config, 'layers': layers}, separators=(',', ':')).encode(), 'application/vnd.oci.image.manifest.v1+json')
    (output / 'oci-layout').write_text('{"imageLayoutVersion":"1.0.0"}')
    (output / 'index.json').write_text(json.dumps({'schemaVersion': 2, 'manifests': [oci_manifest]}))
    inspect = json.loads(run('docker', 'image', 'inspect', image))[0]
    packages = run('docker', 'run', '--rm', '--entrypoint', 'dpkg-query', image,
                   '-W', '-f=${Package}\t${Version}\t${Installed-Size}\n').decode()
    Path('/tmp/' + image + '-packages.tsv').write_text(packages)
    container = run('docker', 'create', image).decode().strip()
    try:
        exported = Path('/tmp/' + image + '-rootfs.tar')
        subprocess.run(['docker', 'export', '-o', str(exported), container], check=True)
        with tarfile.open(exported) as rootfs:
            regular_bytes = sum(member.size for member in rootfs if member.isfile())
    finally:
        run('docker', 'rm', container)
    interpreter = run('docker', 'run', '--rm', '--entrypoint', '/app/.venv/bin/python', image,
        '-c', 'import sys; print(sys.version.split()[0])').decode().strip()
    result['images'][variant] = {'id': inspect['Id'], 'python': interpreter,
        'dpkg_count': len(packages.splitlines()), 'rootfs_regular_file_bytes': regular_bytes,
        'docker_image_size_bytes': inspect['Size'], 'oci_compressed_layer_bytes': sum(x['size'] for x in layers),
        'oci_manifest_digest': oci_manifest['digest'], 'layers': layers,
        'debian_python313': [line for line in packages.splitlines() if 'python3.13' in line]}
a, b = result['images']['before'], result['images']['after']
result['savings_bytes'] = {key: a[key] - b[key] for key in ['rootfs_regular_file_bytes', 'docker_image_size_bytes', 'oci_compressed_layer_bytes']}
Path('/tmp/issue440-measurements.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
