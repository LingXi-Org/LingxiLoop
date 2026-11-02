"""Plot every paired Design observation, preserving the observed spread."""
import json
import gzip
import os
import sys
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR', '/tmp/lingxi611-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

source = Path(sys.argv[1])
raw = json.loads(gzip.decompress(source.read_bytes()) if source.suffix == '.gz' else source.read_text())
fig, axes = plt.subplots(2, 2, figsize=(10, 7.5))
names = {'cold': 'Cold editor resources', 'warm': 'Warm cache, new grant', 'refresh': 'Refresh', 'reopen': 'Retained reopen'}
for axis, scenario in zip(axes.flat, names):
    arms = []
    for port in ('4195', '4194'):
        rows = sorted((r for r in raw['samples'] if r['kind'] == 'design' and r['scenario'] == scenario and f':{port}/' in r['url']), key=lambda r:r['run'])
        arms.append([r['usableMs'] / 1000 for r in rows])
    for before, after in zip(*arms):
        axis.plot([0, 1], [before, after], color='#cbd5e1', linewidth=.8, zorder=1)
    for x, (values, color) in enumerate(zip(arms, ('#1d4ed8', '#c2410c'))):
        # Nearest-rank p50, matching the report instead of interpolating n=10.
        median = sorted(values)[(len(values)-1)//2]
        axis.scatter([x]*len(values), values, s=24, color=color, alpha=.8, zorder=2)
        axis.plot([x-.1, x+.1], [median, median], color='#111827', linewidth=2.5, zorder=3)
        axis.annotate(f'p50 {median:.3f}s', (x, median), xytext=(0, 10), textcoords='offset points', ha='center', fontsize=9)
    axis.set_title(names[scenario], fontsize=11)
    axis.set_xticks([0, 1], ['#615 baseline', '#611 candidate'])
    axis.set_xlim(-.4, 1.4)
    axis.set_ylim(0, max(max(arm) for arm in arms)*1.2)
    axis.set_ylabel('Open to usable (seconds)')
    axis.grid(axis='y', color='#e5e7eb', linewidth=.7)
    axis.spines[['top', 'right']].set_visible(False)
fig.suptitle('Canvas resource loading: all ten paired observations', fontsize=14)
fig.text(.5, .94, '20 ms latency · 4 Mbps down · CPU 1× · actual edit interaction · synthetic local API', ha='center', fontsize=10)
fig.text(.5, .015, 'Cold timing starts after the host shell loads. Individual axes differ. Not a production population bound.', ha='center', fontsize=9)
fig.tight_layout(rect=(0, .035, 1, .91))
fig.savefig(sys.argv[2], dpi=170)
