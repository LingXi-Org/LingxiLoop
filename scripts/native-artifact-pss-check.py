#!/usr/bin/env python3
"""Real /proc regression for the benchmark collector; no product PSS qualification."""
import json
import os
from pathlib import Path
import runpy
from unittest.mock import patch

benchmark = runpy.run_path(str(Path(__file__).with_name('native-artifact-benchmark.py')))
collect, failure = benchmark['process_pss'], benchmark['MeasurementFailure']
assert collect(os.getpid())['bytes'] > 0

child = os.fork()
if child == 0:
    os._exit(0)
try:
    os.waitid(os.P_PID, child, os.WEXITED | os.WNOWAIT)
    assert Path(f'/proc/{child}/stat').read_text().rsplit(')', 1)[1].split()[0] == 'Z'
    result = collect(os.getpid(), classify_roles=True)
    assert result['bytes'] > 0
    assert result['exitedChildren'] >= 1
    assert sum(role['bytes'] for role in result['processRoles'].values()) == result['bytes']
    assert sum(role['processes'] for role in result['processRoles'].values()) == result['processes']
finally:
    os.waitpid(child, 0)
assert collect(os.getpid())['bytes'] > 0

reader, writer = os.pipe()
child = os.fork()
if child == 0:
    os.close(writer)
    os.read(reader, 1)
    os._exit(0)
os.close(reader)
original = Path.read_text
try:
    for pid in [child, os.getpid()]:
        def denied(path, *args, **kwargs):
            if str(path) == f'/proc/{pid}/smaps_rollup':
                raise PermissionError('controlled unreadable process')
            return original(path, *args, **kwargs)
        with patch.object(Path, 'read_text', denied):
            try:
                collect(os.getpid())
            except failure as error:
                assert error.code == 'pss_incomplete'
                assert error.observations['pssReadFailures']['root' if pid == os.getpid() else 'liveChild'] == 1
            else:
                raise AssertionError('unreadable live child or root must reject the sample')
finally:
    os.close(writer)
    os.waitpid(child, 0)
print(json.dumps({'passed': True, 'realZombieExcluded': True, 'reapedChildAccepted': True,
                  'unreadableLiveChildRejected': True, 'unreadableRootRejected': True,
                  'scope': '真实OS进程计量回归，不代替产品性能验收'}, ensure_ascii=False))
