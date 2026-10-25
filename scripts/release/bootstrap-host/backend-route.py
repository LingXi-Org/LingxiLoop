"""Fixed B ingress preparation. JSON stdin selects query/apply and an expected hash only."""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile
import time

PATH = pathlib.Path('/etc/komodo/stacks/server-b-ingress/deploy/komodo/server-b-ingress/dynamic.yml')
STATE = pathlib.Path('/var/lib/lingxi-release/backend-route')
MOUNT = '/etc/traefik/dynamic/routes.yml'
BACKEND = 'backend.lingxilearn.cn'
LOOP = 'loop.lingxilearn.cn'

class RouteError(RuntimeError):
    def __init__(self, code, uncertain=False):
        super().__init__(code)
        self.code, self.uncertain = code, uncertain

def check(value, code):
    if not value:
        raise RouteError(code)

def digest(data):
    return 'sha256:' + hashlib.sha256(data).hexdigest()

def command(args):
    try:
        result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise RouteError('INGRESS_COMMAND_UNCERTAIN', True) from None
    if result.returncode != 0:
        raise RouteError('INGRESS_COMMAND_UNCERTAIN', True)
    return result.stdout

def syncdir(path):
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def durable_json(path, value):
    fd, temporary = tempfile.mkstemp(prefix='.backend-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as file:
            json.dump(value, file, sort_keys=True)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
        syncdir(path.parent)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def plan(data):
    check(len(data) <= 262144 and b'\x00' not in data, 'INGRESS_FILE_UNSUPPORTED')
    try:
        data.decode('utf8')
    except UnicodeError:
        raise RouteError('INGRESS_FILE_UNSUPPORTED') from None
    newline = b'\r\n' if b'\r\n' in data else b'\n'
    check(data.replace(newline, b'').find(b'\r') == -1, 'INGRESS_FILE_UNSUPPORTED')
    lines = data.splitlines(keepends=True)
    plain = [line.rstrip(b'\r\n') for line in lines]
    check(plain.count(b'http:') == 1 and plain.count(b'  routers:') == 1 and plain.count(b'  services:') == 1, 'INGRESS_STRUCTURE_UNSUPPORTED')
    begin, end = plain.index(b'  routers:') + 1, plain.index(b'  services:')
    check(begin < end and plain.count(b'    loop:') == 1, 'INGRESS_STRUCTURE_UNSUPPORTED')
    starts = [(index, re.fullmatch(rb'    ([A-Za-z][A-Za-z0-9_-]*):', plain[index])) for index in range(begin, end)]
    starts = [(index, match.group(1)) for index, match in starts if match]
    check(len({name for _, name in starts}) == len(starts), 'INGRESS_DUPLICATE_ROUTER')
    def block(name):
        found = [index for index, key in starts if key == name]
        if not found:
            return None
        start = found[0]
        stop = next((index for index, _ in starts if index > start), end)
        return b''.join(lines[start:stop])
    loop = block(b'loop')
    check(loop and re.search(rb'^      rule: Host\(`loop\.lingxilearn\.cn`\)\r?$', loop, re.M) and
          re.search(rb'^      service: gateway\r?$', loop, re.M) and
          re.search(rb'^      entryPoints: \[websecure\]\r?$', loop, re.M), 'EXISTING_LOOP_ROUTER_UNQUALIFIED')
    resolver = re.findall(rb'certResolver:\s*([A-Za-z0-9_-]+)', loop)
    check(len(resolver) == 1 and b'    gateway:' in data[data.index(b'  services:'):], 'EXISTING_GATEWAY_TLS_UNQUALIFIED')
    # Clone all original middleware/TLS options; change only the router name and
    # exact hostname. No existing router/service byte is rewritten.
    addition = loop.replace(b'    loop:' + newline, b'    backend:' + newline, 1).replace(b'Host(`loop.lingxilearn.cn`)', b'Host(`backend.lingxilearn.cn`)', 1)
    check(addition.startswith(b'    backend:' + newline) and addition.endswith(newline), 'INGRESS_FILE_UNSUPPORTED')
    existing = block(b'backend')
    if existing is not None:
        check(existing == addition and data.count(BACKEND.encode()) == 1, 'BACKEND_ROUTER_CONFLICT')
        return {'after': data, 'addition': addition, 'changed': False, 'tlsResolver': resolver[0].decode()}
    check(BACKEND.encode() not in data, 'BACKEND_ROUTER_CONFLICT')
    offset = sum(len(line) for line in lines[:end])
    return {'after': data[:offset] + addition + data[offset:], 'addition': addition, 'changed': True, 'tlsResolver': resolver[0].decode()}

def inspect_ingress(path=PATH, run=command):
    ids = run(['/usr/bin/docker', 'ps', '--quiet', '--no-trunc', '--filter', 'label=com.docker.compose.project=server-b-ingress', '--filter', 'label=com.docker.compose.service=traefik']).decode().split()
    check(len(ids) == 1 and re.fullmatch('[a-f0-9]{64}', ids[0]), 'B_INGRESS_NOT_UNIQUE')
    details = json.loads(run(['/usr/bin/docker', 'container', 'inspect', ids[0]]))[0]
    labels = details.get('Config', {}).get('Labels') or {}
    check(details.get('Name') == '/lingxiloop-traefik' and details.get('State', {}).get('Running') is True and
          labels.get('com.docker.compose.project') == 'server-b-ingress' and labels.get('com.docker.compose.service') == 'traefik' and
          labels.get('com.docker.compose.project.working_dir') == str(path.parent) and
          labels.get('com.docker.compose.project.config_files') == str(path.parent / 'compose.yml'), 'B_INGRESS_IDENTITY_MISMATCH')
    mounts = [item for item in details.get('Mounts', []) if item.get('Destination') == MOUNT]
    check(len(mounts) == 1 and mounts[0].get('Type') == 'bind' and mounts[0].get('Source') == str(path) and mounts[0].get('RW') is False, 'B_INGRESS_MOUNT_MISMATCH')
    args = details.get('Config', {}).get('Cmd') or []
    check('--providers.file.directory=/etc/traefik/dynamic' in args and '--providers.file.watch=true' in args, 'TRAEFIK_FILE_WATCH_UNCONFIRMED')
    mounted = run(['/usr/bin/docker', 'exec', ids[0], 'cat', MOUNT])
    mounted_inode = run(['/usr/bin/docker', 'exec', ids[0], 'stat', '-c', '%i', MOUNT]).decode().strip()
    if not mounted_inode.isdigit() or int(mounted_inode) != path.stat().st_ino:
        raise RouteError('BIND_FILE_INODE_MISMATCH', True)
    return {'containerId': ids[0], 'mount': mounts[0], 'mounted': mounted, 'mountedInode': int(mounted_inode), 'fileWatch': True}

def probe(host, run=command):
    check(host in (LOOP, BACKEND), 'INVALID_LOCAL_PROBE')
    # Existing loop SNI/certificate is verified normally; the fixed HTTP Host
    # selects the backend router without changing TLS settings or disabling CA.
    output = run(['/usr/bin/curl', '--silent', '--show-error', '--output', '/dev/null', '--write-out', '%{http_code}', '--connect-timeout', '2', '--max-time', '5', '--noproxy', '*', '--resolve', LOOP + ':443:127.0.0.1', '--header', 'Host: ' + host, 'https://' + LOOP + '/healthz']).decode().strip()
    if not re.fullmatch('[1-5][0-9]{2}', output):
        raise RouteError('LOCAL_PROBE_UNQUALIFIED', True)
    return int(output)

def query(path=PATH, state=STATE, run=command):
    check(path.is_file() and not path.is_symlink(), 'FIXED_INGRESS_FILE_REQUIRED')
    original = path.read_bytes()
    current = inspect_ingress(path, run)
    check(current['mounted'] == original, 'BIND_FILE_CONTENT_MISMATCH')
    planned = plan(original)
    intent = json.loads((state / 'intent.json').read_text()) if (state / 'intent.json').is_file() else None
    return {'version': 1, 'path': str(path), 'currentHash': digest(original), 'plannedHash': digest(planned['after']),
            'existingBackendRouter': None if planned['changed'] else planned['addition'].decode(),
            'router': {'name': 'backend', 'host': BACKEND, 'service': 'gateway', 'entryPoints': ['websecure'], 'tlsResolver': planned['tlsResolver']},
            'inode': path.stat().st_ino, 'mountedInode': current['mountedInode'], 'mountedHash': digest(current['mounted']), 'mount': current['mount'], 'containerId': current['containerId'], 'fileWatch': current['fileWatch'],
            'requiresChange': planned['changed'], 'intent': intent, 'needsAgent': bool(intent and intent.get('status') not in ('accepted', 'rolled-back'))}

def write_same_inode(fd, data):
    offset = 0
    while offset < len(data):
        count = os.pwrite(fd, data[offset:], offset)
        if count < 1:
            raise OSError('short write')
        offset += count
    os.ftruncate(fd, len(data))
    os.fsync(fd)

def apply(expected_hash, path=PATH, state=STATE, run=command, wait=time.sleep, root=lambda: os.geteuid() == 0, hook=lambda phase: None):
    check(root() and re.fullmatch('sha256:[a-f0-9]{64}', expected_hash or ''), 'ROOT_AND_EXPECTED_HASH_REQUIRED')
    state.mkdir(mode=0o700, parents=True, exist_ok=True)
    check(not state.is_symlink(), 'BACKEND_STATE_UNQUALIFIED')
    lock = os.open(state / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    fd = None
    try:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RouteError('BACKEND_ROUTE_BUSY') from None
        before = query(path, state, run)
        intent_path = state / 'intent.json'
        if intent_path.exists():
            intent = json.loads(intent_path.read_text())
            if intent.get('status') == 'accepted' and intent.get('beforeHash') == expected_hash and path.stat().st_ino == intent.get('inode') and path.stat().st_dev == intent.get('device') and before['currentHash'] == intent.get('afterHash') and probe(BACKEND, run) == 204:
                return {**intent, 'reused': True}
            raise RouteError('BACKEND_ROUTE_RECONCILIATION_REQUIRED', True)
        check(before['currentHash'] == expected_hash, 'INGRESS_SOURCE_HASH_CHANGED')
        check(probe(LOOP, run) == 204, 'EXISTING_GATEWAY_NOT_READY')
        if not before['requiresChange']:
            check(probe(BACKEND, run) == 204, 'EXISTING_BACKEND_NOT_OBSERVED')
            return {'status': 'already-configured', 'afterHash': before['currentHash'], 'reused': True}
        original = path.read_bytes()
        check(digest(original) == expected_hash, 'INGRESS_SOURCE_HASH_CHANGED')
        target = plan(original)['after']
        fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
        identity = os.fstat(fd)
        check(stat.S_ISREG(identity.st_mode) and digest(os.pread(fd, 262145, 0)) == expected_hash, 'INGRESS_SOURCE_HASH_CHANGED')
        backup = state / ('before-' + expected_hash[7:] + '.yml')
        if backup.exists():
            check(not backup.is_symlink() and backup.read_bytes() == original and stat.S_IMODE(backup.stat().st_mode) == 0o600, 'INGRESS_BACKUP_CONFLICT')
        else:
            saved = os.open(backup, os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW, 0o600)
            try:
                os.fchmod(saved, 0o600)
                with os.fdopen(saved, 'wb') as file:
                    file.write(original); file.flush(); os.fsync(file.fileno())
            finally:
                syncdir(state)
        intent = {'version': 1, 'status': 'prepared', 'path': str(path), 'beforeHash': expected_hash, 'afterHash': digest(target), 'backup': str(backup), 'device': identity.st_dev, 'inode': identity.st_ino}
        durable_json(intent_path, intent)
        hook('intent')
        try:
            write_same_inode(fd, target)
            intent['status'] = 'written'; durable_json(intent_path, intent)
            hook('written')
            for attempt in range(3):
                current = inspect_ingress(path, run)
                if current['containerId'] != before['containerId'] or current['mounted'] != target or path.stat().st_ino != identity.st_ino or path.read_bytes() != target:
                    raise RouteError('BACKEND_READBACK_UNCERTAIN', True)
                if probe(BACKEND, run) == 204:
                    intent.update(status='accepted', observedHost=BACKEND, observedHttpStatus=204, inodePreserved=True)
                    durable_json(intent_path, intent)
                    return intent
                if attempt < 2:
                    wait(1)
            raise RouteError('BACKEND_ROUTE_NOT_OBSERVED')
        except RouteError as error:
            if error.uncertain:
                intent.update(status='unknown', error=error.code); durable_json(intent_path, intent)
                raise
            # Restore only a definitely failed probe of our exact bytes/inode.
            if path.stat().st_ino != identity.st_ino or path.read_bytes() != target:
                intent.update(status='unknown', error='BACKEND_ROLLBACK_SOURCE_MOVED'); durable_json(intent_path, intent)
                raise RouteError('BACKEND_ROLLBACK_SOURCE_MOVED', True)
            intent.update(status='rollback-intent', error=error.code); durable_json(intent_path, intent)
            try:
                write_same_inode(fd, original)
                restored = inspect_ingress(path, run)
                check(path.read_bytes() == original and restored['mounted'] == original and probe(LOOP, run) == 204, 'BACKEND_ROLLBACK_UNCONFIRMED')
            except Exception:
                intent.update(status='unknown', error='BACKEND_ROLLBACK_UNCONFIRMED'); durable_json(intent_path, intent)
                raise RouteError('BACKEND_ROLLBACK_UNCONFIRMED', True) from None
            intent['status'] = 'rolled-back'; durable_json(intent_path, intent)
            raise error
        except Exception:
            intent.update(status='unknown', error='BACKEND_WRITE_UNCERTAIN'); durable_json(intent_path, intent)
            raise RouteError('BACKEND_WRITE_UNCERTAIN', True) from None
    finally:
        if fd is not None:
            os.close(fd)
        os.close(lock)

def main():
    try:
        raw = sys.stdin.buffer.read(4097)
        check(len(raw) <= 4096, 'INPUT_TOO_LARGE')
        data = json.loads(raw or b'{"action":"query"}')
        check(isinstance(data, dict) and set(data) <= {'action', 'expectedHash'} and data.get('action', 'query') in ('query', 'apply'), 'INVALID_BACKEND_OPERATION')
        result = query() if data.get('action', 'query') == 'query' else apply(data.get('expectedHash'))
        print(json.dumps(result))
    except Exception as error:
        print(json.dumps({'error': error.code if isinstance(error, RouteError) else 'BACKEND_ROUTE_ERROR', 'uncertain': getattr(error, 'uncertain', True), 'needsAgent': True}))
        sys.exit(1)

if __name__ == '__main__':
    main()
