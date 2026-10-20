#!/usr/bin/env python3
"""Digest-verified public GHCR audit; metadata-only output, no layer persistence."""
import argparse
import collections
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import signal
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = 'ghcr.io/lingxi-org/lingxiloop-server'
NAME = REPOSITORY.split('/', 1)[1]
DIGEST = re.compile(r'sha256:[0-9a-f]{64}\Z')
CHUNK = 1024 * 1024
MAX_METADATA = 8 * CHUNK
MAX_EXPANDED = 4 * 1024**3
MAX_COMPRESSED = 2 * 1024**3
MAX_ENTRIES = 300000
MAX_INVENTORY_BYTES = 64 * CHUNK
MAX_PATH_DEPTH = 128
MAX_ANCESTORS = 300000
MAX_ANCESTOR_BYTES = 64 * CHUNK
INDEX = {'application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'}
MANIFEST = {'application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'}
GZIP = {'application/vnd.oci.image.layer.v1.tar+gzip', 'application/vnd.docker.image.rootfs.diff.tar.gzip'}

class AuditError(Exception):
    def __init__(self, code, status=None):
        self.code, self.status = code, status
        super().__init__(code)

def require(condition, code):
    if not condition:
        raise AuditError(code)

def file_hash(path):
    checksum = hashlib.sha256()
    with path.open('rb') as source:
        while chunk := source.read(CHUNK):
            checksum.update(chunk)
    return checksum.hexdigest()

def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()

def parse_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, 'duplicate_json_key')
            result[key] = value
        return result
    return json.loads(data, object_pairs_hook=unique)

class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        old, new = urllib.parse.urlsplit(req.full_url), urllib.parse.urlsplit(newurl)
        require(new.scheme == 'https' and not new.username and not new.password, 'unsafe_redirect')
        redirected = super().redirect_request(req, fp, code, msg, headers, newurl)
        if (old.scheme, old.netloc) != (new.scheme, new.netloc):
            redirected.remove_header('Authorization')
        return redirected

class Registry:
    def __init__(self):
        self.opener = urllib.request.build_opener(SafeRedirect())
        query = urllib.parse.urlencode({'service': 'ghcr.io', 'scope': f'repository:{NAME}:pull'})
        with self.opener.open('https://ghcr.io/token?' + query, timeout=30) as response:
            raw = response.read(MAX_METADATA + 1)
        require(len(raw) <= MAX_METADATA, 'token_response_too_large')
        token = parse_json(raw).get('token')
        require(isinstance(token, str) and 0 < len(token) <= 16384 and '\n' not in token, 'missing_anonymous_token')
        self.token = token

    def open(self, kind, sha):
        require(kind in ('manifests', 'blobs') and DIGEST.fullmatch(sha), 'invalid_object_request')
        req = urllib.request.Request(f'https://ghcr.io/v2/{NAME}/{kind}/{sha}', headers={
            'Authorization': 'Bearer ' + self.token, 'Accept-Encoding': 'identity',
            'Accept': ', '.join(sorted(INDEX | MANIFEST | {'application/octet-stream'}))})
        return self.opener.open(req, timeout=30)

class HashReader:
    def __init__(self, source, limit):
        self.source, self.limit = source, limit
        self.checksum, self.count = hashlib.sha256(), 0
    def read(self, size=-1):
        require(0 <= size <= MAX_METADATA, 'unbounded_read')
        data = self.source.read(size)
        self.count += len(data)
        require(self.count <= self.limit, 'stream_size_limit')
        self.checksum.update(data)
        return data
    def hexdigest(self):
        return 'sha256:' + self.checksum.hexdigest()

class BoundedTarInfo(tarfile.TarInfo):
    @classmethod
    def fromtarfile(cls, archive):
        # Explicit hook also covers Python builds with a C-accelerated TarInfo.
        obj = cls.frombuf(archive.fileobj.read(tarfile.BLOCKSIZE), archive.encoding, archive.errors)
        obj.offset = archive.fileobj.tell() - tarfile.BLOCKSIZE
        return obj._proc_member(archive)

    @classmethod
    def frombuf(cls, buf, encoding, errors):
        try:
            return super().frombuf(buf, encoding, errors)
        except (tarfile.InvalidHeaderError, tarfile.TruncatedHeaderError):
            raise AuditError('invalid_tar_header') from None

    def _proc_member(self, archive):
        require(not self.issparse(), 'unsupported_sparse_member')
        if self.type in (tarfile.XHDTYPE, tarfile.XGLTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK):
            require(self.size <= CHUNK, 'tar_metadata_limit')
        return super()._proc_member(archive)

def path_name(value, root_ok=False):
    require(isinstance(value, str) and len(value) <= 16384 and not value.startswith('/'), 'unsafe_tar_path')
    require(not any(ord(c) < 32 or ord(c) == 127 for c in value), 'unsafe_tar_path')
    parts = value.split('/')
    require('..' not in parts, 'unsafe_tar_path')
    normalized = [p for p in parts if p not in ('', '.')]
    require(len(normalized) <= MAX_PATH_DEPTH, 'path_depth_limit')
    result = '/'.join(normalized)
    require(bool(result) or root_ok, 'empty_tar_path')
    return result

def descend(path, parent):
    return not parent or path.startswith(parent + '/')

def remove_path(entries, path, include_self=True):
    for key in list(entries):
        if (include_self and key == path) or descend(key, path):
            del entries[key]

def merge_layer(lower, ordered, whiteouts, opaque):
    result = dict(lower)
    for path in whiteouts:
        remove_path(result, path)
    for path in opaque:
        remove_path(result, path, False)
    # Conservative hints include implicit directories. Never remove a hint:
    # stale ancestors only cause an extra original scan, never a missed subtree.
    ancestors = set()
    ancestor_bytes = 0
    def remember_ancestors(path):
        nonlocal ancestor_bytes
        parts = path.split('/')
        require(len(parts) <= MAX_PATH_DEPTH, 'path_depth_limit')
        for i in range(1, len(parts)):
            parent = '/'.join(parts[:i])
            if parent not in ancestors:
                size = len(parent.encode())
                require(len(ancestors) < MAX_ANCESTORS and ancestor_bytes + size <= MAX_ANCESTOR_BYTES, 'ancestor_index_limit')
                ancestors.add(parent)
                ancestor_bytes += size
    for path in result:
        remember_ancestors(path)
    pending = []
    for path, entry in ordered:
        remember_ancestors(path)
        parents = path.split('/')[:-1]
        for i in range(1, len(parents) + 1):
            parent = '/'.join(parents[:i])
            require(parent not in result or result[parent]['kind'] == 'directory', 'non_directory_parent')
        if entry['kind'] != 'directory':
            if path in result or path in ancestors:
                remove_path(result, path)
        elif path in result and result[path]['kind'] != 'directory':
            remove_path(result, path)
        if entry['kind'] == 'hardlink':
            target = result.get(entry['target'])
            if target is None:
                pending.append((path, entry))
                result[path] = entry
                continue
            require(target['kind'] in ('file', 'hardlink') and 'sha256' in target, 'unsupported_hardlink_target')
            entry = {**entry, 'bytes': target['bytes'], 'sha256': target['sha256']}
        result[path] = entry
    while pending:
        rest = []
        for path, entry in pending:
            if result.get(path) is not entry:
                continue
            parents = path.split('/')[:-1]
            for i in range(1, len(parents) + 1):
                parent = '/'.join(parents[:i])
                require(parent not in result or result[parent]['kind'] == 'directory', 'non_directory_parent')
            target = result.get(entry['target'])
            if target and target['kind'] in ('file', 'hardlink') and 'sha256' in target:
                result[path] = {**entry, 'bytes': target['bytes'], 'sha256': target['sha256']}
            else:
                rest.append((path, entry))
        require(len(rest) < len(pending), 'unresolved_hardlink')
        pending = rest
    require(len(result) <= MAX_ENTRIES, 'rootfs_entry_limit')
    require(sum(len(p.encode()) + len(json.dumps(e).encode()) for p, e in result.items()) <= MAX_INVENTORY_BYTES, 'rootfs_inventory_limit')
    return result

def scan_layer(response, descriptor, diff_id, lower):
    require(descriptor.get('mediaType') in GZIP, 'unsupported_layer_compression')
    require(DIGEST.fullmatch(descriptor['digest']) and DIGEST.fullmatch(diff_id), 'invalid_layer_digest')
    require(type(descriptor['size']) is int and 0 <= descriptor['size'] <= MAX_COMPRESSED, 'layer_size_limit')
    header_size = response.headers.get('Content-Length')
    if header_size is not None:
        require(int(header_size) == descriptor['size'], 'http_length_mismatch')
    compressed = HashReader(response, descriptor['size'])
    expanded = HashReader(gzip.GzipFile(fileobj=compressed, mode='rb'), MAX_EXPANDED)
    ordered, whiteouts, opaque, seen = [], [], [], set()
    metadata_bytes = 0
    # ignore_zeros processes the complete expanded tar, including record padding.
    with tarfile.open(fileobj=expanded, mode='r|', tarinfo=BoundedTarInfo, ignore_zeros=True) as archive:
        for member in archive:
            require(len(seen) < MAX_ENTRIES, 'layer_entry_limit')
            name = path_name(member.name, root_ok=member.isdir())
            if not name:
                continue
            require(name not in seen, 'duplicate_tar_path')
            seen.add(name)
            metadata_bytes += len(name.encode()) + len(member.linkname.encode()) + 256
            require(metadata_bytes <= MAX_INVENTORY_BYTES, 'layer_inventory_limit')
            parent, _, basename = name.rpartition('/')
            if basename.startswith('.wh.'):
                require(member.isfile() and member.size == 0, 'invalid_whiteout')
                if basename == '.wh..wh..opq':
                    opaque.append(parent)
                else:
                    target = basename[4:]
                    require(target not in ('', '.', '..'), 'invalid_whiteout')
                    whiteouts.append((parent + '/' if parent else '') + target)
                continue
            entry = {'kind': 'directory', 'mode': member.mode, 'uid': member.uid, 'gid': member.gid}
            if member.isfile():
                require(not member.issparse() and 0 <= member.size <= MAX_EXPANDED, 'unsupported_sparse_or_large_file')
                sha, count = hashlib.sha256(), 0
                with archive.extractfile(member) as source:
                    while chunk := source.read(CHUNK):
                        sha.update(chunk)
                        count += len(chunk)
                require(count == member.size, 'member_length_mismatch')
                entry.update(kind='file', bytes=count, sha256=sha.hexdigest())
            elif member.issym():
                require(len(member.linkname) <= 16384 and not any(ord(c) < 32 for c in member.linkname), 'unsafe_link_text')
                entry.update(kind='symlink', target=member.linkname)
            elif member.islnk():
                entry.update(kind='hardlink', target=path_name(member.linkname))
            elif not member.isdir():
                raise AuditError('unsupported_tar_entry_type')
            ordered.append((name, entry))
    # Drain gzip and compressed reader, checking trailers, complete size and diff_id.
    while chunk := expanded.read(CHUNK):
        require(not any(chunk), 'nonzero_trailing_tar')
    while compressed.read(CHUNK):
        pass
    require(compressed.count == descriptor['size'], 'compressed_length_mismatch')
    require(compressed.hexdigest() == descriptor['digest'], 'compressed_digest_mismatch')
    require(expanded.hexdigest() == diff_id, 'expanded_diff_id_mismatch')
    return merge_layer(lower, ordered, whiteouts, opaque), {
        'digest': descriptor['digest'], 'diffId': diff_id, 'compressedBytes': compressed.count,
        'uncompressedTarBytes': expanded.count, 'tarEntries': len(seen),
        'whiteouts': len(whiteouts), 'opaqueDirectories': len(opaque)}

def metadata(registry, kind, sha, expected_size=None):
    require(DIGEST.fullmatch(sha), 'invalid_metadata_digest')
    with registry.open(kind, sha) as response:
        raw = response.read(MAX_METADATA + 1)
        header_size = response.headers.get('Content-Length')
    require(len(raw) <= MAX_METADATA, 'metadata_size_limit')
    require(digest(raw) == sha, 'metadata_digest_mismatch')
    if expected_size is not None:
        require(len(raw) == expected_size, 'metadata_length_mismatch')
    if header_size is not None:
        require(len(raw) == int(header_size), 'http_length_mismatch')
    return parse_json(raw), len(raw)

def inspect_image(registry, index_digest, commit, progress):
    progress['stage'] = 'index'
    index, index_bytes = metadata(registry, 'manifests', index_digest)
    require(index.get('mediaType') in INDEX, 'expected_index')
    selected = [d for d in index['manifests'] if d.get('platform', {}).get('os') == 'linux' and d.get('platform', {}).get('architecture') == 'amd64' and d.get('platform', {}).get('variant') in (None, '')]
    require(len(selected) == 1, 'ambiguous_amd64_platform')
    desc = selected[0]
    progress['stage'] = 'manifest'
    manifest, manifest_bytes = metadata(registry, 'manifests', desc['digest'], desc['size'])
    require(manifest.get('mediaType') in MANIFEST, 'expected_manifest')
    require(0 < len(manifest['layers']) <= 128, 'layer_count_limit')
    require(all(type(x.get('size')) is int and 0 <= x['size'] <= MAX_COMPRESSED for x in manifest['layers']), 'layer_size_limit')
    require(sum(x['size'] for x in manifest['layers']) <= MAX_COMPRESSED, 'total_download_limit')
    progress['stage'] = 'config'
    config_desc = manifest['config']
    config, config_bytes = metadata(registry, 'blobs', config_desc['digest'], config_desc['size'])
    require(config.get('os') == 'linux' and config.get('architecture') == 'amd64', 'config_platform_mismatch')
    revisions = [v.split('=', 1)[1] for v in config.get('config', {}).get('Env', []) if isinstance(v, str) and v.startswith('LINGXILOOP_COMMIT_SHA=')]
    require(revisions == [commit], 'source_commit_mismatch')
    label = config.get('config', {}).get('Labels', {}).get('org.opencontainers.image.revision')
    require(label is None or label == commit, 'revision_label_mismatch')
    require(config.get('rootfs', {}).get('type') == 'layers', 'invalid_rootfs_type')
    diff_ids = config['rootfs']['diff_ids']
    require(len(diff_ids) == len(manifest['layers']), 'diff_id_count_mismatch')
    rootfs, layers = {}, []
    progress['stage'] = 'layers'
    for descriptor, diff_id in zip(manifest['layers'], diff_ids):
        with registry.open('blobs', descriptor['digest']) as response:
            rootfs, stats = scan_layer(response, descriptor, diff_id, rootfs)
        layers.append(stats)
        require(sum(x['uncompressedTarBytes'] for x in layers) <= MAX_EXPANDED, 'total_expansion_limit')
        progress['verifiedLayers'] = len(layers)
    report = {'repository': REPOSITORY, 'indexDigest': index_digest, 'linuxAmd64ManifestDigest': desc['digest'],
        'configDigest': config_desc['digest'], 'sourceCommit': commit, 'indexBytes': index_bytes,
        'manifestBytes': manifest_bytes, 'configBytes': config_bytes, 'layerCount': len(layers),
        'compressedLayerBytes': sum(x['compressedBytes'] for x in layers),
        'uncompressedTarLayerBytes': sum(x['uncompressedTarBytes'] for x in layers), 'layers': layers,
        'attestationDescriptorsNotDownloaded': len(index['manifests']) - 1}
    return report, rootfs

def inventory_stats(entries):
    regular = [(p, e) for p, e in entries.items() if e['kind'] == 'file']
    def group(prefix):
        files = [(p, e) for p, e in regular if p.startswith(prefix)]
        return {'files': len(files), 'regularBytes': sum(e['bytes'] for _, e in files)}
    packages = collections.Counter()
    for p, e in regular:
        if p.startswith('app/node_modules/'):
            parts = p[len('app/node_modules/'):].split('/')
            package = '/'.join(parts[:2]) if parts[0].startswith('@') else parts[0]
            packages[package] += e['bytes']
    return {'entries': len(entries), 'kinds': dict(collections.Counter(e['kind'] for e in entries.values())),
        'regularFileBytes': sum(e['bytes'] for _, e in regular),
        'hardlinkLogicalBytes': sum(e['bytes'] for e in entries.values() if e['kind'] == 'hardlink'),
        'largestFiles': [{'path': p, 'bytes': e['bytes']} for p, e in sorted(regular, key=lambda x: (-x[1]['bytes'], x[0]))[:30]],
        'deps': group('app/node_modules/'), 'dist': group('app/dist/'),
        'largestPackages': [{'path': 'app/node_modules/' + p, 'regularBytes': n} for p, n in packages.most_common(30)]}

def compare_expected(entries, prefix, expected):
    actual = {p[len(prefix):]: {'path': p[len(prefix):], 'bytes': e['bytes'], 'sha256': e['sha256']}
              for p, e in entries.items() if p.startswith(prefix) and e['kind'] in ('file', 'hardlink')}
    expected = {x['path']: x for x in expected}
    unexpected = {p[len(prefix):] for p, e in entries.items() if p.startswith(prefix) and e['kind'] not in ('directory', 'file', 'hardlink')}
    bad = sorted({p for p in actual.keys() | expected.keys() if actual.get(p) != expected.get(p)} | unexpected)
    return {'prefix': prefix, 'expectedFiles': len(expected), 'actualFiles': len(actual), 'matches': not bad, 'mismatchedPaths': bad}

def runtime_expected(path):
    require(file_hash(path) == 'ee308270402b220452f8eb4e92e9c1d25a68466525f21827203bd5078a9c1bcb', 'formal_runtime_tar_digest_mismatch')
    files = []
    with tarfile.open(path, 'r:gz') as archive:
        for m in archive:
            if m.isfile():
                name = path_name(m.name)
                require(name.startswith('package/'), 'invalid_runtime_tar_path')
                sha = hashlib.sha256()
                with archive.extractfile(m) as source:
                    while chunk := source.read(CHUNK):
                        sha.update(chunk)
                files.append({'path': name[len('package/'):], 'bytes': m.size, 'sha256': sha.hexdigest()})
    require(len(files) == 474 and len({x['path'] for x in files}) == 474, 'runtime_reference_count')
    return files

def save_json(path, value):
    with path.open('x') as f:
        json.dump(value, f, indent=2, sort_keys=True)
        f.write('\n')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference')
    parser.add_argument('expected_commit')
    parser.add_argument('outputdir', type=Path)
    parser.add_argument('--runtime-tar', type=Path)
    parser.add_argument('--pdf-inventory', type=Path)
    parser.add_argument('--baseline', type=Path)
    parser.add_argument('--deadline-seconds', type=int, default=1200)
    args = parser.parse_args()
    require(args.reference.startswith(REPOSITORY + '@'), 'repository_not_allowed')
    sha = args.reference[len(REPOSITORY) + 1:]
    require(DIGEST.fullmatch(sha) and re.fullmatch('[0-9a-f]{40}', args.expected_commit), 'immutable_identity_required')
    require(1 <= args.deadline_seconds <= 1800, 'deadline_limit')
    args.outputdir.mkdir(mode=0o700, parents=False, exist_ok=False)
    progress = {'stage': 'preflight', 'verifiedLayers': 0}
    start = time.monotonic()
    def timeout(_sig, _frame):
        raise AuditError('deadline_exceeded')
    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(args.deadline_seconds)
    try:
        # Read/validate known references before using any registry access.
        expected_runtime = runtime_expected(args.runtime_tar) if args.runtime_tar else None
        expected_pdf = parse_json(args.pdf_inventory.read_bytes()) if args.pdf_inventory else None
        if expected_pdf is not None:
            require(file_hash(args.pdf_inventory) == 'fc4a8c2a30a73b6d120adc46dd83964cdc443c91282c93ba25475aade11d4298', 'pdf_reference_digest_mismatch')
            require(len(expected_pdf) == 379 and len({x['path'] for x in expected_pdf}) == 379, 'pdf_reference_count')
        baseline = parse_json(args.baseline.read_bytes())['after'] if args.baseline else None
        if baseline is not None:
            require(baseline['indexDigest'] == 'sha256:6ac0d343039dbcb36607ff07e708134a9f5fbcbe6f1e51c04a8bca16801314ee', 'baseline_identity_mismatch')
        report, entries = inspect_image(Registry(), sha, args.expected_commit, progress)
        report.update(scope='full linux/amd64 layers, streaming digest/diff-ID verification and merged rootfs inventory; no layer or file bodies persisted',
            readiness='not-tested', isolation='not-tested', production='not-accessed', rootfs=inventory_stats(entries))
        comparisons = []
        if expected_runtime is not None:
            comparisons.append(compare_expected(entries, 'app/node_modules/@lyyzka/lingxios/', expected_runtime))
        if expected_pdf is not None:
            comparisons.append(compare_expected(entries, 'app/node_modules/pdfjs-dist/', expected_pdf))
        report['packageComparisons'] = comparisons
        report['referenceSha256'] = {label: file_hash(path) for label, path in [('formalRuntimeTar', args.runtime_tar), ('pdfInventory', args.pdf_inventory)] if path is not None}
        if baseline is not None:
            report['historicalBaselineComparison'] = {'baselineSourceSha256': hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
                'baselineIndexDigest': baseline['indexDigest'], 'baselineSourceCommit': baseline['sourceCommit'], 'baselineRemeasuredThisRun': False,
                'compressedLayerByteDelta': report['compressedLayerBytes'] - baseline['compressedLayerBytes'],
                'uncompressedTarLayerByteDelta': report['uncompressedTarLayerBytes'] - baseline['uncompressedTarLayerBytes'],
                'note': 'whole-image totals, not attribution to PDF pruning; historical baseline not fetched'}
        progress['stage'] = 'write_inventory'
        inventory_path = args.outputdir / 'rootfs-inventory.json'
        save_json(inventory_path, entries)
        report['inventorySha256'] = hashlib.sha256(inventory_path.read_bytes()).hexdigest()
        report['passed'] = all(c['matches'] for c in comparisons)
        report['elapsedSeconds'] = round(time.monotonic() - start, 3)
        save_json(args.outputdir / 'receipt.json', report)
        require(report['passed'], 'package_inventory_mismatch')
        print(json.dumps({'passed': True, 'verifiedLayers': len(report['layers'])}))
    except Exception as error:
        if isinstance(error, AuditError):
            code, status = error.code, error.status
        elif isinstance(error, urllib.error.HTTPError):
            code, status = 'http_error_no_retry', error.code
        else:
            code, status = 'invalid_or_incomplete_input', None
        save_json(args.outputdir / 'failure.json', {'passed': False, **progress, 'code': code, 'httpStatus': status,
            'elapsedSeconds': round(time.monotonic() - start, 3)})
        print(json.dumps({'passed': False, 'code': code, 'httpStatus': status}))
        return 1
    finally:
        signal.alarm(0)
    return 0

if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except AuditError as error:
        print(json.dumps({'passed': False, 'code': error.code}))
        raise SystemExit(1)
    except Exception:
        print(json.dumps({'passed': False, 'code': 'local_preflight_failure'}))
        raise SystemExit(1)
