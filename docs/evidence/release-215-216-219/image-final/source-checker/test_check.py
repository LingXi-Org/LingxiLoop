import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import sys
import unittest

BASE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('source_check', BASE / 'check.py')
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)

class SourceCheckTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='source-check-synthetic-')
        cls.repo = Path(cls.temp.name)
        cls.files = {p: (p + '\n').encode() for p in c.FILES + c.CRITICAL}
        for subtree in c.SUBTREES:
            if subtree != 'server/':
                cls.files[subtree + 'synthetic.txt'] = b'synthetic body never emitted\n'
        for n in range(1, 49):
            cls.files[f'server/src/db/migrations/{n:04}_fixture.sql'] = f'SELECT {n};\n'.encode()
        cls.files['server/package.json'] = b'{"name":"synthetic"}\n'
        cls.files['server/package-lock.json'] = b'{"lockfileVersion":3}\n'
        cls.files['server/keep.test.mjs'] = b'export const synthetic = true\n'
        cls.excluded = {'server/src/__integration__/excluded.test.ts': b'not shipped', 'src/not-in-runtime.ts': b'not shipped', 'server/local.log': b'not shipped'}
        for path in c.POLICY:
            cls.files[path] = subprocess.check_output(['git', '-C', '/workspace/LingxiLoop-integration-215-216-219', 'show', 'd1075e35e16721979b484c2d9e33eeb56468ce9d:' + path])
        for path, data in {**cls.files, **cls.excluded}.items():
            target = cls.repo / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        cls.link_path = 'third_party/zcode/skills/visualize/synthetic-link'
        os.symlink('synthetic.txt', cls.repo / cls.link_path)
        def git(*args):
            return subprocess.check_output(['git', '-C', str(cls.repo), *args], stderr=subprocess.DEVNULL)
        git('init', '-q')
        git('add', '.')
        git('-c', 'user.name=Synthetic Review', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'synthetic source correspondence fixture')
        cls.commit = git('rev-parse', 'HEAD').decode().strip()
        cls.git = c.Git(cls.repo)
        cls.inventory = {'app/' + p: {'kind': 'file', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for p, data in cls.files.items()}
        cls.inventory['app/' + cls.link_path] = {'kind': 'symlink', 'target': 'synthetic.txt'}
        for name in ['package.json', 'package-lock.json']:
            cls.inventory['app/' + name] = dict(cls.inventory['app/server/' + name])
        cls.inventory['app/server/assets'] = {'kind': 'directory'}
        cls.inventory['app/server/assets/visualize-runtime'] = {'kind': 'directory'}
        cls.inventory['app/server/assets/visualize-runtime/generated.js'] = {'kind': 'file', 'bytes': 5, 'sha256': 'c' * 64}
        cls.inventory['app/dist/generated.js'] = {'kind': 'file', 'bytes': 4, 'sha256': 'd' * 64}
        cls.receipt = {'passed': True, 'repository': c.REPO_ID, 'sourceCommit': cls.commit, 'inventorySha256': '1' * 64,
            'indexDigest': 'sha256:' + '2' * 64, 'linuxAmd64ManifestDigest': 'sha256:' + '3' * 64, 'configDigest': 'sha256:' + '4' * 64}

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def check(self, inventory=None):
        return c.compare(self.receipt, inventory if inventory is not None else self.inventory, '1' * 64, self.git, self.commit)

    def test_success_all_copies_48_migrations_and_generated_uncompared(self):
        result = self.check()
        self.assertTrue(result['passed'], result['issues'])
        self.assertEqual(result['critical']['migrationFilesMatched'], 48)
        self.assertTrue(all(x['matched'] for x in result['critical']['entries']))
        self.assertEqual(len(result['generatedUncompared']), 1)
        self.assertEqual(result['outsideSourceScopeEntries'], 1)
        mapping = {x['imagePath']: x['gitPath'] for x in result['matched']}
        self.assertEqual(mapping['app/package.json'], 'server/package.json')
        self.assertNotIn('synthetic body never emitted', json.dumps(result))

    def test_wrong_commit_and_failed_receipt_rejected(self):
        with self.assertRaisesRegex(c.CheckError, 'oci_source_identity_mismatch'):
            c.compare(self.receipt, self.inventory, '1' * 64, self.git, 'f' * 40)
        with self.assertRaisesRegex(c.CheckError, 'oci_receipt_not_passed'):
            c.compare({**self.receipt, 'passed': False}, self.inventory, '1' * 64, self.git, self.commit)

    def test_bad_inventory_hash_rejected(self):
        with self.assertRaisesRegex(c.CheckError, 'inventory_hash_mismatch'):
            c.compare(self.receipt, self.inventory, '0' * 64, self.git, self.commit)

    def test_missing_migration_fails_with_47_matched(self):
        inv = copy.deepcopy(self.inventory)
        del inv['app/server/src/db/migrations/0048_fixture.sql']
        result = self.check(inv)
        self.assertFalse(result['passed'])
        self.assertEqual(result['critical']['migrationFilesMatched'], 47)
        self.assertEqual(result['issues'][0]['reason'], 'missing')

    def test_changed_file_hash_rejected(self):
        inv = copy.deepcopy(self.inventory)
        inv['app/src/lib/participantDisplayName.ts']['sha256'] = 'e' * 64
        result = self.check(inv)
        self.assertFalse(result['passed'])
        self.assertEqual(result['issues'][0]['reason'], 'hash_or_size')

    def test_unknown_non_generated_file_and_empty_directory_rejected(self):
        for path, entry in [('app/server/unknown.js', {'kind': 'file', 'bytes': 1, 'sha256': '5' * 64}), ('app/src/unknown-directory', {'kind': 'directory'})]:
            inv = copy.deepcopy(self.inventory)
            inv[path] = entry
            result = self.check(inv)
            self.assertFalse(result['passed'])
            self.assertIn({'path': path, 'reason': 'unknown_non_generated_path'}, result['issues'])

    def test_wrong_symlink_target_fails_without_printing_target(self):
        inv = copy.deepcopy(self.inventory)
        inv['app/' + self.link_path]['target'] = 'private-sentinel-target'
        result = self.check(inv)
        self.assertFalse(result['passed'])
        self.assertNotIn('private-sentinel-target', json.dumps(result))

    def test_cli_verifies_raw_inventory_hash_and_writes_metadata_only(self):
        with tempfile.TemporaryDirectory(prefix='source-check-cli-') as name:
            parent = Path(name)
            inventory = parent / 'inventory.json'
            receipt = parent / 'receipt.json'
            inventory.write_text(json.dumps(self.inventory))
            receipt.write_text(json.dumps({**self.receipt, 'inventorySha256': hashlib.sha256(inventory.read_bytes()).hexdigest()}))
            result = subprocess.run([sys.executable, str(BASE / 'check.py'), str(receipt), str(inventory), str(self.repo), self.commit, str(parent / 'out')], capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            data = json.loads((parent / 'out/source-check.json').read_text())
            self.assertTrue(data['passed'])
            self.assertNotIn('synthetic body never emitted', json.dumps(data))
            inventory.write_text(inventory.read_text() + ' ')
            failed = subprocess.run([sys.executable, str(BASE / 'check.py'), str(receipt), str(inventory), str(self.repo), self.commit, str(parent / 'failed')], capture_output=True, text=True, check=False)
            self.assertEqual(failed.returncode, 1)
            self.assertEqual(json.loads((parent / 'failed/failure.json').read_text())['code'], 'inventory_hash_mismatch')

    def test_copy_policy_change_requires_review(self):
        original = c.POLICY
        try:
            c.POLICY = {**original, 'server/docker/lingxiloop-server.Dockerfile': '0' * 64}
            with self.assertRaisesRegex(c.CheckError, 'copy_policy_requires_review'):
                self.check()
        finally:
            c.POLICY = original

if __name__ == '__main__':
    unittest.main()
