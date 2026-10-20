"""Pure memory comparison; old 40k quadratic scan deliberately not executed."""
import hashlib
import importlib.util
import json
from pathlib import Path
import time

BASE = Path(__file__).parent

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, BASE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

old = load('before', 'audit-before-ancestor.py')
new = load('after', 'audit.py')

def checksum(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def run(module, lower, ordered):
    calls = visits = 0
    original = module.remove_path
    def counted(entries, *args):
        nonlocal calls, visits
        calls += 1
        visits += len(entries)
        return original(entries, *args)
    module.remove_path = counted
    try:
        start = time.perf_counter()
        result = module.merge_layer(lower, ordered, [], [])
        elapsed = time.perf_counter() - start
    finally:
        module.remove_path = original
    return result, {'seconds': round(elapsed, 6), 'removeCalls': calls, 'mapEntriesVisited': visits, 'entries': len(result), 'inventorySha256': checksum(result)}

entry = {'kind': 'file', 'mode': 420, 'uid': 0, 'gid': 0, 'bytes': 8, 'sha256': 'a' * 64}
rows = []
for count, added in [(0, 4000), (10000, 2000)]:
    lower = {f'usr/base/{i}': entry for i in range(count)}
    ordered = [(f'app/node_modules/pkg-{i}/file.js', entry) for i in range(added)]
    before, a = run(old, lower, ordered)
    after, b = run(new, lower, ordered)
    assert before == after
    rows.append({'lower': count, 'added': added, 'before': a, 'after': b, 'actualOutputsEqual': True})
# Exact append-only result and old iteration count follow from the unchanged old loop;
# do not label either as a measured old 40k run.
ordered = [(f'app/node_modules/pkg-{i}/file.js', entry) for i in range(40000)]
after, stats = run(new, {}, ordered)
expected = dict(ordered)
assert after == expected
large = {'lower': 0, 'added': 40000, 'after': stats, 'matchesExactAppendOnlyReference': True,
         'referenceInventorySha256': checksum(expected), 'old40kExecuted': False,
         'oldAnalyticalRemoveCalls': 40000, 'oldAnalyticalMapEntriesVisited': 40000 * 39999 // 2}
report = {'scope': 'synthetic metadata in memory only; no network, layers, production or provider',
          'measuredOldNew': rows, 'largeOptimizedOnly': large}
(BASE / 'ancestor-performance.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
