"""Derive compact tables and request timelines from the retained raw browser run."""
import csv
import gzip
import json
import math
import sys
from pathlib import Path


def percentile(values, percent):
    return sorted(values)[max(0, math.ceil(len(values) * percent / 100) - 1)]


source = Path(sys.argv[1])
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
raw = json.loads(gzip.decompress(source.read_bytes()) if source.suffix == '.gz' else source.read_text())
groups = {}
for row in raw['samples']:
    arm = 'baseline' if ':4195/' in row['url'] else 'candidate'
    groups.setdefault((row['kind'], row['scenario'], arm), []).append(row)

records = []
for (kind, scenario, arm), rows in groups.items():
    assert not any(row['errors'] for row in rows), (kind, scenario, arm)
    record = {'kind': kind, 'scenario': scenario, 'arm': arm, 'n': len(rows)}
    fields = {
        'visibleMs': [row['visibleMs'] for row in rows],
        'usableMs': [row['usableMs'] for row in rows],
        'bytes': [row['bytes'] for row in rows],
        'requestStarts': [len(row['requests']) for row in rows],
        'transferredResponses': [sum(request.get('bytes', 0) > 0 for request in row['requests']) for row in rows],
        'hostScriptMs': [row['metricsDelta']['ScriptDuration'] * 1000 for row in rows],
        'hostTaskMs': [row['metricsDelta']['TaskDuration'] * 1000 for row in rows],
        'hostHeapDeltaBytes': [row['metricsDelta']['JSHeapUsedSize'] for row in rows],
    }
    record.update({name: {f'p{p}': percentile(values, p) for p in (50, 75, 95)} for name, values in fields.items()})
    records.append(record)

(out / 'summary.json').write_text(json.dumps({
    'source': source.name, 'profile': raw['profile'], 'browser': raw['browser'],
    'baseline': 'a2ec76b2316f5f5afbea8453507c88881c3fc70b',
    'candidateImplementation': '9737ac34e19ee59b58461b27834383486528d438',
    'percentile': 'Nearest rank; n=10 p95 equals the maximum, not a production population estimate.',
    'records': records,
}, indent=2) + '\n')

lines = ['# Measured distributions', '', 'Times are milliseconds. Quantiles use nearest rank; each arm has ten samples.', '']
for kind in ('design', 'visualize'):
    lines.extend([f'## {kind}', '', '| Scenario | Arm | Visible p50 / p75 / p95 | Usable p50 / p75 / p95 | Wire bytes p50 | Requests / transferred p50 |', '|---|---|---:|---:|---:|---:|'])
    for scenario in ('cold', 'reopen', 'warm', 'refresh'):
        for arm in ('baseline', 'candidate'):
            row = next(x for x in records if (x['kind'], x['scenario'], x['arm']) == (kind, scenario, arm))
            quantiles = lambda field: ' / '.join(str(round(row[field][f'p{p}'])) for p in (50, 75, 95))
            lines.append(f"| {scenario} | {arm} | {quantiles('visibleMs')} | {quantiles('usableMs')} | {row['bytes']['p50']:,} | {row['requestStarts']['p50']} / {row['transferredResponses']['p50']} |")
    lines.append('')
lines.extend(['`requestStarts` includes cached requests and unfinished event streams. Wire bytes include response headers and only completed responses before usability. Host CPU/heap is diagnostic, not whole-browser CPU/retained memory; raw frame long-task lists are cumulative on reopen.', ''])
(out / 'distributions.md').write_text('\n'.join(lines))

with (out / 'request-timelines.csv').open('w') as handle:
    writer = csv.writer(handle, lineterminator='\n')
    writer.writerow(['kind', 'scenario', 'arm', 'run', 'url', 'type', 'startMsFromFirstRequest', 'endMsFromFirstRequest', 'ttfbMs', 'bytes', 'cache', 'encoding'])
    for row in raw['samples']:
        if row['run'] != 0 or not row['requests']:
            continue
        first = min(r['start'] for r in row['requests'])
        arm = 'baseline' if ':4195/' in row['url'] else 'candidate'
        for r in row['requests']:
            writer.writerow([row['kind'], row['scenario'], arm, row['run'], r['url'], r['type'], round((r['start']-first)*1000, 2), round((r['end']-first)*1000, 2) if 'end' in r else '', round(r.get('ttfb', 0)*1000, 2), r.get('bytes', 0), r.get('cache', False), r.get('encoding', '')])

print('\n'.join(lines))
