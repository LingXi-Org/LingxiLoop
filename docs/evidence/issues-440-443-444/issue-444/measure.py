"""Measure real ELF sections and gzip-compressed layers from docker-save archives.

Usage: python measure.py BASELINE_TAR RELEASE_TAR DEBUG_BINARY RELEASE_BINARY
Docker-save contains uncompressed layer tars. gzip level=6, mtime=0 matches a
reproducible OCI gzip encoding; it does not claim a registry transfer measurement.
Writes real OCI layouts next to each input tar, with suffix .oci.
"""
import gzip
import hashlib
import io
import json
import re
import subprocess
import sys
import tarfile
from pathlib import Path


def binary(path):
    sections = subprocess.check_output(['readelf', '-SW', path], text=True)
    parsed = {name: int(size, 16) for name, size in re.findall(
        r'\[\s*\d+\]\s+(\S+)\s+\S+\s+[0-9a-f]+\s+[0-9a-f]+\s+([0-9a-f]+)', sections)}
    return {'bytes': Path(path).stat().st_size,
            'sha256': hashlib.sha256(Path(path).read_bytes()).hexdigest(),
            'sections': parsed,
            'debugSectionBytes': sum(size for name, size in parsed.items() if name.startswith('.debug_')),
            'file': subprocess.check_output(['file', path], text=True).strip()}


def image(path):
    layout = Path(path).with_suffix('.oci')
    blobs = layout / 'blobs' / 'sha256'
    blobs.mkdir(parents=True, exist_ok=True)

    def blob(data, media_type):
        digest = hashlib.sha256(data).hexdigest()
        (blobs / digest).write_bytes(data)
        return {'mediaType': media_type, 'digest': 'sha256:' + digest, 'size': len(data)}

    with tarfile.open(path) as archive:
        manifest = json.load(archive.extractfile('manifest.json'))[0]
        config_bytes = archive.extractfile(manifest['Config']).read()
        config = json.loads(config_bytes)
        config_descriptor = blob(config_bytes, 'application/vnd.oci.image.config.v1+json')
        layers = []
        descriptors = []
        for name in manifest['Layers']:
            data = archive.extractfile(name).read()
            with tarfile.open(fileobj=io.BytesIO(data)) as layer:
                files = layer.getmembers()
                contents = sum(member.size for member in files if member.isfile())
                has_binary = any(member.name.lstrip('./') == 'usr/local/bin/wukongim' for member in files)
            compressed = gzip.compress(data, compresslevel=6, mtime=0)
            descriptors.append(blob(compressed, 'application/vnd.oci.image.layer.v1.tar+gzip'))
            layers.append({'diffId': 'sha256:' + hashlib.sha256(data).hexdigest(),
                           'uncompressedTarBytes': len(data), 'fileContentBytes': contents,
                           'gzipBytes': len(compressed),
                           'gzipDigest': 'sha256:' + hashlib.sha256(compressed).hexdigest(),
                           'containsWukongBinary': has_binary})
        assert [row['diffId'] for row in layers] == config['rootfs']['diff_ids']
        image_manifest = {'schemaVersion': 2, 'mediaType': 'application/vnd.oci.image.manifest.v1+json',
                          'config': config_descriptor, 'layers': descriptors}
        descriptor = blob(json.dumps(image_manifest, separators=(',', ':')).encode(),
                          image_manifest['mediaType'])
        descriptor['platform'] = {'architecture': config['architecture'], 'os': config['os']}
        (layout / 'index.json').write_text(json.dumps({'schemaVersion': 2, 'manifests': [descriptor]}))
        (layout / 'oci-layout').write_text('{"imageLayoutVersion":"1.0.0"}')
        return {'os': config['os'], 'architecture': config['architecture'], 'layers': layers,
                'ociManifest': descriptor,
                'gzipLayerBytes': sum(row['gzipBytes'] for row in layers),
                'uncompressedLayerTarBytes': sum(row['uncompressedTarBytes'] for row in layers),
                'layerFileContentBytes': sum(row['fileContentBytes'] for row in layers)}


baseline, release, debug_binary, release_binary = sys.argv[1:]
result = {'method': 'docker-save layer tar → gzip level 6, mtime 0; no registry push',
          'baselineImage': image(baseline), 'releaseImage': image(release),
          'debugBinary': binary(debug_binary), 'releaseBinary': binary(release_binary)}
assert result['baselineImage']['architecture'] == result['releaseImage']['architecture'] == 'amd64'
assert result['debugBinary']['debugSectionBytes'] > 0
assert result['releaseBinary']['debugSectionBytes'] == 0
assert '.symtab' in result['debugBinary']['sections']
assert '.symtab' not in result['releaseBinary']['sections']
for name in ('.gopclntab', '.gosymtab', '.text'):
    assert name in result['releaseBinary']['sections']
assert result['releaseBinary']['bytes'] < result['debugBinary']['bytes']
print(json.dumps(result, indent=2))
