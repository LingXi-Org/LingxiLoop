import gzip
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import unittest
from unittest.mock import patch
import contextlib
import tempfile
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)

class Response(io.BytesIO):
    def __init__(self, data):
        super().__init__(data)
        self.headers = {'Content-Length': str(len(data))}

def blob(items):
    out = io.BytesIO()
    with tarfile.open(fileobj=out, mode='w') as archive:
        for path, kind, value in items:
            member = tarfile.TarInfo(path)
            if kind == 'file':
                member.size = len(value)
                archive.addfile(member, io.BytesIO(value))
            else:
                member.type = {'dir': tarfile.DIRTYPE, 'sym': tarfile.SYMTYPE, 'hard': tarfile.LNKTYPE}[kind]
                if kind != 'dir':
                    member.linkname = value
                archive.addfile(member)
    expanded = out.getvalue()
    compressed = gzip.compress(expanded, mtime=0)
    return compressed, {'digest': audit.digest(compressed), 'size': len(compressed), 'mediaType': next(iter(audit.GZIP))}, audit.digest(expanded)

def layer(items, lower=None):
    raw, desc, diff = blob(items)
    return audit.scan_layer(Response(raw), desc, diff, lower or {})

class FakeRegistry:
    def __init__(self, objects):
        self.objects = objects
        self.calls = []
    def open(self, kind, sha):
        self.calls.append((kind, sha))
        return Response(self.objects[sha])

def image_fixture(commit='a' * 40):
    raw, desc, diff = blob([('app/a', 'file', b'content')])
    objects = {desc['digest']: raw}
    def add(value):
        data = json.dumps(value).encode()
        sha = audit.digest(data)
        objects[sha] = data
        return {'digest': sha, 'size': len(data)}
    config = add({'os': 'linux', 'architecture': 'amd64', 'config': {'Env': ['DO_NOT_PERSIST=synthetic-secret', 'LINGXILOOP_COMMIT_SHA=' + commit]}, 'rootfs': {'type': 'layers', 'diff_ids': [diff]}})
    manifest = add({'schemaVersion': 2, 'mediaType': next(iter(audit.MANIFEST)), 'config': config, 'layers': [desc]})
    index = add({'schemaVersion': 2, 'mediaType': next(iter(audit.INDEX)), 'manifests': [{**manifest, 'platform': {'os': 'linux', 'architecture': 'amd64'}}]})
    return FakeRegistry(objects), index['digest']

class AuditTests(unittest.TestCase):
    def test_full_layer_counts_and_hashes(self):
        raw, desc, diff = blob([('app/a', 'file', b'one'), ('app/link', 'sym', '/app/a')])
        files, stats = audit.scan_layer(Response(raw), desc, diff, {})
        self.assertEqual(files['app/a']['sha256'], hashlib.sha256(b'one').hexdigest())
        self.assertEqual(stats['compressedBytes'], len(raw))
        self.assertEqual(stats['uncompressedTarBytes'], len(gzip.decompress(raw)))
        self.assertEqual(files['app/link']['target'], '/app/a')

    def test_whiteout_removes_lower_only_and_opaque_preserves_upper(self):
        old, _ = layer([('d', 'dir', ''), ('d/old', 'file', b'old'), ('f', 'file', b'old')])
        for items in [[('d/new', 'file', b'new'), ('d/.wh..wh..opq', 'file', b''), ('f', 'file', b'new'), ('.wh.f', 'file', b'')],
                      [('d/.wh..wh..opq', 'file', b''), ('.wh.f', 'file', b''), ('d/new', 'file', b'new'), ('f', 'file', b'new')]]:
            files, _ = layer(items, old)
            self.assertNotIn('d/old', files)
            self.assertIn('d/new', files)
            self.assertEqual(files['f']['sha256'], hashlib.sha256(b'new').hexdigest())

    def test_directory_replaced_with_file_removes_descendants(self):
        old, _ = layer([('d', 'dir', ''), ('d/child', 'file', b'old')])
        new, _ = layer([('d', 'file', b'new')], old)
        self.assertEqual(set(new), {'d'})

    def test_hardlink_preserves_inode_before_target_replacement(self):
        old, _ = layer([('a', 'file', b'old')])
        new, _ = layer([('b', 'hard', 'a'), ('a', 'file', b'new'), ('c', 'hard', 'a')], old)
        self.assertEqual(new['b']['sha256'], hashlib.sha256(b'old').hexdigest())
        self.assertEqual(new['c']['sha256'], hashlib.sha256(b'new').hexdigest())
        forward, _ = layer([('b', 'hard', 'a'), ('a', 'file', b'new')])
        self.assertEqual(forward['b']['sha256'], forward['a']['sha256'])

    def test_unsafe_paths_links_duplicate_and_cycles_fail(self):
        cases = [[('../a', 'file', b'x')], [('/a', 'file', b'x')], [('a', 'file', b'x'), ('a', 'file', b'y')],
                 [('a', 'hard', '../b')], [('a', 'hard', 'b'), ('b', 'hard', 'a')], [('s', 'sym', 'elsewhere'), ('s/a', 'file', b'x')]]
        for items in cases:
            with self.subTest(items=items), self.assertRaises(audit.AuditError):
                layer(items)

    def test_digest_diff_length_and_gzip_truncation_fail(self):
        raw, desc, diff = blob([('a', 'file', b'abc')])
        for data, d, h in [(raw, {**desc, 'digest': 'sha256:' + '0' * 64}, diff), (raw, desc, 'sha256:' + '0' * 64),
                           (raw, {**desc, 'size': len(raw) + 1}, diff), (raw[:-5], {**desc, 'size': len(raw) - 5, 'digest': audit.digest(raw[:-5])}, diff)]:
            with self.subTest(), self.assertRaises((audit.AuditError, EOFError)):
                audit.scan_layer(Response(data), d, h, {})

    def test_nonzero_trailing_tar_rejected(self):
        raw, desc, _ = blob([('a', 'file', b'x')])
        expanded = gzip.decompress(raw) + b'x' * 512
        data = gzip.compress(expanded)
        with self.assertRaises(audit.AuditError):
            audit.scan_layer(Response(data), {**desc, 'size': len(data), 'digest': audit.digest(data)}, audit.digest(expanded), {})

    def test_metadata_and_commit_verified_before_layers(self):
        registry, index = image_fixture()
        report, files = audit.inspect_image(registry, index, 'a' * 40, {})
        self.assertEqual(report['layerCount'], 1)
        self.assertNotIn('synthetic-secret', json.dumps(report))
        self.assertNotIn('Env', json.dumps(report))
        self.assertEqual(set(files), {'app/a'})
        registry, index = image_fixture()
        with self.assertRaisesRegex(audit.AuditError, 'source_commit_mismatch'):
            audit.inspect_image(registry, index, 'b' * 40, {})
        self.assertEqual(len(registry.calls), 3)
        registry, index = image_fixture()
        registry.objects[index] += b' '
        with self.assertRaisesRegex(audit.AuditError, 'metadata_digest_mismatch'):
            audit.inspect_image(registry, index, 'a' * 40, {})
        self.assertEqual(len(registry.calls), 1)

    def test_extra_symlink_in_package_rejected(self):
        expected = [{'path': 'a', 'bytes': 1, 'sha256': 'x'}]
        entries = {'app/pkg/a': {'kind': 'file', 'bytes': 1, 'sha256': 'x'}, 'app/pkg/hidden': {'kind': 'symlink', 'target': '/tmp'}}
        self.assertFalse(audit.compare_expected(entries, 'app/pkg/', expected)['matches'])

    def test_complete_cli_fake_registry_outputs_only_metadata(self):
        registry, index = image_fixture()
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / 'audit'
            argv = ['audit.py', audit.REPOSITORY + '@' + index, 'a' * 40, str(output)]
            with patch('sys.argv', argv), patch.object(audit, 'Registry', return_value=registry), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(audit.main(), 0)
            receipt = json.loads((output / 'receipt.json').read_text())
            self.assertTrue(receipt['passed'])
            self.assertEqual(sorted(p.name for p in output.iterdir()), ['receipt.json', 'rootfs-inventory.json'])
            self.assertNotIn('synthetic-secret', ''.join(p.read_text() for p in output.iterdir()))
            self.assertEqual(receipt['rootfs']['regularFileBytes'], 7)

    def test_http_denial_no_retry_body_or_token_output(self):
        with tempfile.TemporaryDirectory() as parent:
            output = Path(parent) / 'audit'
            argv = ['audit.py', audit.REPOSITORY + '@sha256:' + 'a' * 64, 'a' * 40, str(output)]
            denied = urllib.error.HTTPError('https://example.invalid/?secret=sentinel', 401, 'SECRET_SENTINEL', {}, None)
            with patch('sys.argv', argv), patch.object(audit, 'Registry', side_effect=denied) as registry, contextlib.redirect_stdout(io.StringIO()) as stdout:
                self.assertEqual(audit.main(), 1)
            self.assertEqual(registry.call_count, 1)
            self.assertEqual([p.name for p in output.iterdir()], ['failure.json'])
            text = (output / 'failure.json').read_text() + stdout.getvalue()
            self.assertNotIn('SECRET_SENTINEL', text)
            self.assertNotIn('secret=sentinel', text)
            self.assertEqual(json.loads((output / 'failure.json').read_text())['httpStatus'], 401)

    def test_long_pax_path_preserved(self):
        name = 'app/' + 'x' * 200
        result, _ = layer([(name, 'file', b'x')])
        self.assertIn(name, result)

    def test_implicit_lower_directory_subtree_removed_by_parent_file(self):
        old, _ = layer([('implicit/deep/child', 'file', b'old')])
        new, _ = layer([('implicit', 'file', b'new')], old)
        self.assertEqual(set(new), {'implicit'})
        self.assertEqual(new['implicit']['sha256'], hashlib.sha256(b'new').hexdigest())

    def test_same_layer_implicit_subtree_removed_by_later_parent_file(self):
        new, _ = layer([('implicit/deep/child', 'file', b'old'), ('implicit', 'file', b'new')])
        self.assertEqual(set(new), {'implicit'})
        self.assertEqual(new['implicit']['sha256'], hashlib.sha256(b'new').hexdigest())

    def test_new_leaf_paths_need_no_full_map_deletion_scan(self):
        entry = {'kind': 'file', 'bytes': 1, 'sha256': 'x'}
        ordered = [(f'app/pkg-{i}/file.js', entry) for i in range(100)]
        with patch.object(audit, 'remove_path', wraps=audit.remove_path) as remove:
            result = audit.merge_layer({}, ordered, [], [])
        self.assertEqual(len(result), 100)
        self.assertEqual(remove.call_count, 0)

    def test_deleted_forward_hardlink_is_not_resurrected_after_parent_replacement(self):
        new, _ = layer([('d/x', 'hard', 'later'), ('d', 'file', b'new'), ('later', 'file', b'target')])
        self.assertEqual(set(new), {'d', 'later'})
        self.assertEqual(new['d']['kind'], 'file')

    def test_replaced_pending_item_identity_is_preserved(self):
        pending = {'kind': 'hardlink', 'target': 'later'}
        replacement = {'kind': 'file', 'bytes': 3, 'sha256': 'new'}
        target = {'kind': 'file', 'bytes': 6, 'sha256': 'target'}
        result = audit.merge_layer({}, [('d/x', pending), ('d/x', replacement), ('later', target)], [], [])
        self.assertIs(result['d/x'], replacement)

    def test_equal_valued_replacement_uses_object_identity(self):
        class Tracked(dict):
            target_reads = 0
            def __getitem__(self, key):
                if key == 'target':
                    self.target_reads += 1
                return super().__getitem__(key)
        old = Tracked(kind='hardlink', target='later')
        replacement = Tracked(kind='hardlink', target='later')
        target = {'kind': 'file', 'bytes': 6, 'sha256': 'target'}
        self.assertEqual(old, replacement)
        result = audit.merge_layer({}, [('d/x', old), ('d/x', replacement), ('later', target)], [], [])
        self.assertEqual(result['d/x']['sha256'], 'target')
        self.assertEqual(old.target_reads, 1)
        self.assertEqual(replacement.target_reads, 2)

    def test_path_depth_limit_before_ancestor_expansion(self):
        valid = '/'.join(['x'] * 128)
        result, _ = layer([(valid, 'file', b'x')])
        self.assertIn(valid, result)
        with self.assertRaises(audit.AuditError):
            layer([(valid + '/x', 'file', b'x')])

    def test_ancestor_byte_limit_covers_lower_and_new_paths(self):
        path = 'aaaaaaaaaa/bbbbbbbbbb/cccccccccc/file'
        lower, _ = layer([(path, 'file', b'x')])
        with patch.object(audit, 'MAX_ANCESTOR_BYTES', 60, create=True):
            with self.assertRaises(audit.AuditError):
                layer([(path, 'file', b'x')])
            with self.assertRaises(audit.AuditError):
                audit.merge_layer(lower, [], [], [])

    def test_ancestor_count_limit(self):
        with patch.object(audit, 'MAX_ANCESTORS', 2, create=True), self.assertRaises(audit.AuditError):
            layer([('a/b/c/file', 'file', b'x')])

    def test_cross_origin_redirect_strips_authorization(self):
        handler = audit.SafeRedirect()
        req = urllib.request.Request('https://ghcr.io/v2/image/blobs/sha256:abc', headers={'Authorization': 'Bearer synthetic-token'})
        redirect = handler.redirect_request(req, None, 302, 'found', {}, 'https://example.invalid/blob?signature=synthetic')
        self.assertIsNone(redirect.get_header('Authorization'))
        with self.assertRaises(audit.AuditError):
            handler.redirect_request(req, None, 302, 'found', {}, 'http://example.invalid/blob')

if __name__ == '__main__':
    unittest.main()
