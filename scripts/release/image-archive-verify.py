#!/usr/bin/env python3
"""Validate a fixed Docker save archive without extracting any file."""
import gzip
import hashlib
import json
import re
import sys
import tarfile
import zlib

MAX_ARCHIVE = 8 * 1024**3
MAX_TAR = 16 * 1024**3
CHUNK = 1024 * 1024


def require(ok, code):
    if not ok:
        raise ValueError(code)


class Counted:
    def __init__(self, stream):
        self.stream, self.size = stream, 0

    def read(self, size=-1):
        data = self.stream.read(size)
        self.size += len(data)
        require(self.size <= MAX_TAR, "ARCHIVE_TAR_TOO_LARGE")
        return data


def safe_path(name):
    require(isinstance(name, str) and name and not name.startswith('/') and
            '\\' not in name and not any(ord(c) < 32 or ord(c) == 127 for c in name) and
            all(p not in ('', '.', '..') for p in name.rstrip('/').split('/')), "ARCHIVE_UNSAFE_PATH")
    return name.rstrip('/')


def validate(path, expected):
    sha = expected['configDigest']
    require(re.fullmatch(r'sha256:[a-f0-9]{64}', sha) is not None, "ARCHIVE_CONFIG_REQUIRED")
    tag = 'localhost/lingxi-release-cache:sha256-' + sha[7:]
    require(expected['tag'] == tag and expected['os'] == 'linux' and expected['architecture'] == 'amd64', "ARCHIVE_SOURCE_INVALID")
    whole, size = hashlib.sha256(), 0
    with open(path, 'rb') as source:
        for chunk in iter(lambda: source.read(CHUNK), b''):
            whole.update(chunk)
            size += len(chunk)
            require(size <= MAX_ARCHIVE, "ARCHIVE_TOO_LARGE")
    require(size > 0 and size == expected['size'] and 'sha256:' + whole.hexdigest() == expected['sha256'], "ARCHIVE_HASH_MISMATCH")
    files, metadata, paths, oci_manifests = {}, {}, set(), {}
    with gzip.open(path, 'rb') as source:
        counted = Counted(source)
        with tarfile.open(fileobj=counted, mode='r|') as archive:
            for member in archive:
                name = safe_path(member.name)
                require(name not in paths and len(paths) < 20000, "ARCHIVE_DUPLICATE_OR_EXCESS_MEMBERS")
                paths.add(name)
                require(member.isdir() or member.isfile(), "ARCHIVE_UNSAFE_MEMBER")
                require(not member.sparse and member.size <= MAX_TAR, "ARCHIVE_UNSAFE_MEMBER")
                if member.isdir():
                    continue
                capture = name in ('manifest.json', 'repositories', 'index.json', sha[7:] + '.json', 'blobs/sha256/' + sha[7:])
                sniff_json = name.startswith('blobs/sha256/') and member.size <= 4 * CHUNK
                require(not capture or member.size <= 4 * CHUNK, "ARCHIVE_METADATA_TOO_LARGE")
                raw, decoded, decoded_size = hashlib.sha256(), hashlib.sha256(), 0
                data, inflater, first = bytearray(), None, True
                stream = archive.extractfile(member)
                for chunk in iter(lambda: stream.read(CHUNK), b''):
                    raw.update(chunk)
                    if first:
                        sniff_json = sniff_json and chunk.startswith(b'{')
                        inflater = zlib.decompressobj(31) if chunk.startswith(b'\x1f\x8b') else None
                        first = False
                    if capture or sniff_json:
                        data.extend(chunk)
                    if inflater:
                        pending = chunk
                        while pending:
                            out = inflater.decompress(pending, CHUNK)
                            pending = inflater.unconsumed_tail
                            decoded_size += len(out)
                            require(decoded_size <= MAX_TAR, "ARCHIVE_LAYER_TOO_LARGE")
                            decoded.update(out)
                if inflater:
                    require(inflater.eof and not inflater.unused_data, "ARCHIVE_LAYER_GZIP_INVALID")
                files[name] = ('sha256:' + raw.hexdigest(), 'sha256:' + decoded.hexdigest() if inflater else None, member.size)
                if capture:
                    metadata[name] = bytes(data)
                if sniff_json:
                    try:
                        value = json.loads(data)
                    except (ValueError, UnicodeError):
                        value = None
                    if isinstance(value, dict) and value.get('schemaVersion') == 2 and value.get('config', {}).get('digest') == sha:
                        require(len(oci_manifests) < 32 and isinstance(value.get('layers'), list) and len(value['layers']) == len(expected['diffIds']), "ARCHIVE_OCI_MANIFEST_INVALID")
                        oci_manifests[name] = value
            require(not any(archive.fileobj.buf), "ARCHIVE_TRAILING_DATA")
        # Read the complete gzip member and validate its CRC, including tar padding.
        for chunk in iter(lambda: counted.read(CHUNK), b''):
            require(not any(chunk), "ARCHIVE_TRAILING_DATA")
        require(counted.size == expected['uncompressedSize'], "ARCHIVE_TAR_SIZE_MISMATCH")
    manifest = json.loads(metadata['manifest.json'])
    require(isinstance(manifest, list) and len(manifest) == 1, "ARCHIVE_IMAGE_NOT_UNIQUE")
    image = manifest[0]
    require(image.get('RepoTags') == [tag], "ARCHIVE_TAG_MISMATCH")
    config_name = safe_path(image['Config'])
    require(config_name in metadata and files[config_name][0] == sha, "ARCHIVE_CONFIG_MISMATCH")
    config = json.loads(metadata[config_name])
    require(config.get('os') == 'linux' and config.get('architecture') == 'amd64' and
            config.get('rootfs') == {'type': 'layers', 'diff_ids': expected['diffIds']}, "ARCHIVE_ROOTFS_MISMATCH")
    layers = image['Layers']
    require(isinstance(layers, list) and len(layers) == len(expected['diffIds']), "ARCHIVE_LAYER_INVENTORY_MISMATCH")
    for name, diff_id in zip(layers, expected['diffIds']):
        require(re.fullmatch(r'sha256:[a-f0-9]{64}', diff_id) is not None, "ARCHIVE_DIFF_ID_INVALID")
        require(diff_id in files.get(safe_path(name), ()), "ARCHIVE_LAYER_HASH_MISMATCH")
    if 'repositories' in metadata:
        repo, label = tag.rsplit(':', 1)
        repositories = json.loads(metadata['repositories'])
        require(list(repositories) == [repo] and list(repositories[repo]) == [label], "ARCHIVE_EXTRA_TAG")
    if 'index.json' in metadata:
        index = json.loads(metadata['index.json'])
        require(index.get('schemaVersion') == 2 and len(index.get('manifests', [])) == 1, "ARCHIVE_EXTRA_IMAGE")
        selected = index['manifests'][0]
        selected_sha = selected.get('digest', '')
        require(re.fullmatch(r'sha256:[a-f0-9]{64}', selected_sha) is not None, "ARCHIVE_OCI_MANIFEST_INVALID")
        selected_path = 'blobs/sha256/' + selected_sha[7:]
        require(selected_path in oci_manifests and files[selected_path][0] == selected_sha and files[selected_path][2] == selected.get('size'), "ARCHIVE_OCI_MANIFEST_INVALID")
        selected_manifest = oci_manifests[selected_path]
        require(selected_manifest['config'].get('size') == len(metadata[config_name]), "ARCHIVE_OCI_CONFIG_INVALID")
        for layer, diff_id in zip(selected_manifest['layers'], expected['diffIds']):
            layer_sha = layer.get('digest', '')
            require(re.fullmatch(r'sha256:[a-f0-9]{64}', layer_sha) is not None, "ARCHIVE_OCI_LAYER_INVALID")
            record = files.get('blobs/sha256/' + layer_sha[7:])
            require(record and record[0] == layer_sha and record[2] == layer.get('size') and diff_id in record[:2], "ARCHIVE_OCI_LAYER_INVALID")
        for key, value in selected.get('annotations', {}).items():
            if key in ('io.containerd.image.name', 'org.opencontainers.image.ref.name'):
                require(value in (tag, tag.rsplit(':', 1)[1]), "ARCHIVE_EXTRA_TAG")
    return {'sha256': 'sha256:' + whole.hexdigest(), 'size': size, 'uncompressedSize': counted.size,
            'tag': tag, 'configDigest': sha, 'diffIds': expected['diffIds']}


if __name__ == '__main__':
    try:
        print(json.dumps(validate(sys.argv[1], json.load(sys.stdin))))
    except Exception as error:
        # No filenames, archive contents or external exception strings in diagnostics.
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r'ARCHIVE_[A-Z_]+', str(error)) else 'ARCHIVE_INVALID'
        print(code, file=sys.stderr)
        sys.exit(1)
