import importlib.util
import json
import pathlib
import stat
import tempfile
import unittest

HERE = pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location('backend_route', HERE / 'backend-route.py')
route = importlib.util.module_from_spec(spec)
spec.loader.exec_module(route)
SOURCE = (HERE.parent.parent.parent / 'deploy/komodo/server-b-ingress/dynamic.yml').read_bytes()

class Crash(SystemExit):
    pass

class RouteTests(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = pathlib.Path(temporary.name)
        path, state = root / 'dynamic.yml', root / 'state'
        path.write_bytes(SOURCE)
        bound_inode = path.stat().st_ino
        container = 'a' * 64
        calls = []
        mode = {'health': 204}
        def run(args):
            calls.append(args)
            if args[1:3] == ['ps', '--quiet']:
                return (container + '\n').encode()
            if args[1:3] == ['container', 'inspect']:
                return json.dumps([{'Name': '/lingxiloop-traefik', 'State': {'Running': True}, 'Config': {'Labels': {
                    'com.docker.compose.project': 'server-b-ingress', 'com.docker.compose.service': 'traefik',
                    'com.docker.compose.project.working_dir': str(path.parent), 'com.docker.compose.project.config_files': str(path.parent / 'compose.yml')},
                    'Cmd': ['--providers.file.directory=/etc/traefik/dynamic', '--providers.file.watch=true']},
                    'Mounts': [{'Type': 'bind', 'Source': str(path), 'Destination': route.MOUNT, 'RW': False}]}]).encode()
            if args[1] == 'exec':
                if args[3:] == ['stat', '-c', '%i', route.MOUNT]:
                    return str(bound_inode).encode()
                self.assertEqual(args[3:], ['cat', route.MOUNT])
                return path.read_bytes()
            if args[0] == '/usr/bin/curl':
                self.assertIn('--noproxy', args)
                self.assertNotIn('--insecure', args)
                self.assertEqual(args[-1], 'https://' + route.LOOP + '/healthz')
                if ('Host: ' + route.LOOP) in args:
                    return b'204'
                self.assertIn('Host: ' + route.BACKEND, args)
                if mode['health'] == 'unknown':
                    raise route.RouteError('LOCAL_TRANSPORT_UNCERTAIN', True)
                return str(mode['health']).encode()
            raise AssertionError(args)
        return path, state, run, calls, mode

    def test_plan_preserves_every_existing_router_service_byte(self):
        for source in [SOURCE, SOURCE.replace(b'\n', b'\r\n')]:
            planned = route.plan(source)
            self.assertTrue(planned['changed'])
            self.assertEqual(planned['after'].replace(planned['addition'], b'', 1), source)
            self.assertEqual(planned['addition'].count(b'Host(`backend.lingxilearn.cn`)'), 1)
            self.assertIn(b'service: gateway', planned['addition'])
            self.assertIn(b'certResolver: letsencrypt', planned['addition'])
            self.assertFalse(route.plan(planned['after'])['changed'])

    def test_query_confirms_live_fixed_mount_hash_and_writes_nothing(self):
        path, state, run, _, _ = self.fixture()
        result = route.query(path, state, run)
        self.assertEqual(result['currentHash'], route.digest(SOURCE))
        self.assertEqual(result['mount']['Source'], str(path))
        self.assertIsNone(result['existingBackendRouter'])
        self.assertFalse(state.exists())
        def wrong_mount(args):
            value = run(args)
            if args[1:3] == ['container', 'inspect']:
                data = json.loads(value); data[0]['Mounts'][0]['Source'] = '/unrelated/dynamic.yml'
                return json.dumps(data).encode()
            return value
        with self.assertRaisesRegex(route.RouteError, 'B_INGRESS_MOUNT_MISMATCH'):
            route.query(path, state, wrong_mount)

    def test_atomic_rename_with_identical_bytes_is_rejected_as_a_stale_single_file_bind(self):
        path, state, run, _, _ = self.fixture()
        replacement = path.parent / 'replacement.yml'
        replacement.write_bytes(SOURCE)
        replacement.replace(path)
        with self.assertRaisesRegex(route.RouteError, 'BIND_FILE_INODE_MISMATCH'):
            route.query(path, state, run)
        self.assertFalse(state.exists())

    def test_apply_durable_backup_same_inode_and_no_shared_service_restart(self):
        path, state, run, calls, _ = self.fixture()
        inode = path.stat().st_ino
        result = route.apply(route.digest(SOURCE), path, state, run, wait=lambda _: None, root=lambda: True)
        self.assertEqual(result['status'], 'accepted')
        self.assertEqual(path.stat().st_ino, inode)
        backup = pathlib.Path(result['backup'])
        self.assertEqual(backup.read_bytes(), SOURCE)
        self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
        self.assertEqual(json.loads((state / 'intent.json').read_text())['status'], 'accepted')
        self.assertTrue(route.apply(route.digest(SOURCE), path, state, run, root=lambda: True)['reused'])
        self.assertTrue(all('restart' not in args and 'systemctl' not in args and 'compose' not in args for args in calls))

    def test_expected_hash_conflicts_never_touch_file(self):
        path, state, run, _, _ = self.fixture()
        with self.assertRaisesRegex(route.RouteError, 'INGRESS_SOURCE_HASH_CHANGED'):
            route.apply('sha256:' + 'f' * 64, path, state, run, root=lambda: True)
        self.assertEqual(path.read_bytes(), SOURCE)
        self.assertFalse((state / 'intent.json').exists())

    def test_known_probe_failure_restores_exact_original_inode_and_records_rollback(self):
        path, state, run, _, mode = self.fixture()
        inode = path.stat().st_ino
        mode['health'] = 404
        with self.assertRaisesRegex(route.RouteError, 'BACKEND_ROUTE_NOT_OBSERVED'):
            route.apply(route.digest(SOURCE), path, state, run, wait=lambda _: None, root=lambda: True)
        self.assertEqual(path.read_bytes(), SOURCE)
        self.assertEqual(path.stat().st_ino, inode)
        self.assertEqual(json.loads((state / 'intent.json').read_text())['status'], 'rolled-back')

    def test_unknown_probe_keeps_intent_and_never_replays_or_blindly_rolls_back(self):
        path, state, run, _, mode = self.fixture()
        mode['health'] = 'unknown'
        with self.assertRaisesRegex(route.RouteError, 'LOCAL_TRANSPORT_UNCERTAIN'):
            route.apply(route.digest(SOURCE), path, state, run, wait=lambda _: None, root=lambda: True)
        after = path.read_bytes()
        self.assertNotEqual(after, SOURCE)
        self.assertEqual(json.loads((state / 'intent.json').read_text())['status'], 'unknown')
        self.assertTrue(route.query(path, state, run)['needsAgent'])
        with self.assertRaisesRegex(route.RouteError, 'BACKEND_ROUTE_RECONCILIATION_REQUIRED'):
            route.apply(route.digest(SOURCE), path, state, run, root=lambda: True)
        self.assertEqual(path.read_bytes(), after)

    def test_no_http_status_is_unknown_and_never_treated_as_a_known_route_failure(self):
        path, state, run, _, mode = self.fixture()
        mode['health'] = '000'
        with self.assertRaisesRegex(route.RouteError, 'LOCAL_PROBE_UNQUALIFIED'):
            route.apply(route.digest(SOURCE), path, state, run, wait=lambda _: None, root=lambda: True)
        self.assertNotEqual(path.read_bytes(), SOURCE)
        self.assertEqual(json.loads((state / 'intent.json').read_text())['status'], 'unknown')

    def test_crash_after_intent_or_write_is_readable_and_never_replayed(self):
        for crash_phase in ['intent', 'written']:
            path, state, run, _, _ = self.fixture()
            def hook(phase):
                if phase == crash_phase:
                    raise Crash()
            with self.assertRaises(Crash):
                route.apply(route.digest(SOURCE), path, state, run, root=lambda: True, hook=hook)
            actual = path.read_bytes()
            self.assertTrue(route.query(path, state, run)['needsAgent'])
            with self.assertRaisesRegex(route.RouteError, 'BACKEND_ROUTE_RECONCILIATION_REQUIRED'):
                route.apply(route.digest(SOURCE), path, state, run, root=lambda: True)
            self.assertEqual(path.read_bytes(), actual)

    def test_conflicting_backend_router_and_unqualified_existing_loop_are_rejected(self):
        with self.assertRaisesRegex(route.RouteError, 'BACKEND_ROUTER_CONFLICT'):
            route.plan(SOURCE.replace(b'  services:', b'    backend:\n      rule: Host(`unrelated.example`)\n  services:'))
        with self.assertRaisesRegex(route.RouteError, 'EXISTING_LOOP_ROUTER_UNQUALIFIED'):
            route.plan(SOURCE.replace(b'      service: gateway', b'      service: unrelated', 1))

if __name__ == '__main__':
    unittest.main()
