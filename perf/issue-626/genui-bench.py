"""Paired real GenUI cold/reopen benchmark. Start genui-serve.ts on 4197/4198 first."""
import json, math, platform, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'issue-611'))
from bench import Trace, INIT, usable

out = Path('perf/issue-626/evidence')
out.mkdir(parents=True, exist_ok=True)
samples = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for trial in range(10):
        for arm, port in ([('baseline', 4197), ('candidate', 4198)] if trial % 2 == 0 else [('candidate', 4198), ('baseline', 4197)]):
            url = f'http://127.0.0.1:{port}/'
            urllib.request.urlopen(urllib.request.Request(url + '__fixture/reset', data=b'{}', headers={'content-type': 'application/json'})).read()
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            context.add_init_script(INIT)
            page = context.new_page()
            trace = Trace(context, page)
            page.goto(url + '?kind=visualize')
            page.locator('#open').wait_for()
            for scenario in ['cold', 'reopen']:
                start = time.monotonic()
                page.locator('#open').click()
                _, timing = usable(page, 'visualize', start, trace)
                resources = page.evaluate("performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/visualize-')).map(x=>({name:new URL(x.name).pathname,start:x.startTime,duration:x.duration,encodedBytes:x.encodedBodySize,decodedBytes:x.decodedBodySize,transferBytes:x.transferSize}))")
                samples.append({'trial': trial, 'arm': arm, 'scenario': scenario, **timing, 'resources': resources})
                print(json.dumps({k: v for k, v in samples[-1].items() if k != 'resources'}), flush=True)
                page.locator('#close').click()
            context.close()
    report = {'browser': browser.version, 'platform': platform.platform(), 'profile': {'latencyMs': 20, 'downloadMbps': 4, 'uploadMbps': 3, 'cpu': 1, 'width': 1440, 'height': 1000, 'oopifThrottled': True}, 'samples': samples}
    browser.close()
    (out / 'genui-paired.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
for scenario in ['cold', 'reopen']:
    for arm in ['baseline', 'candidate']:
        values = sorted(x['usableMs'] for x in samples if x['scenario'] == scenario and x['arm'] == arm)
        print(scenario, arm, {f'p{q}': round(values[math.ceil(len(values) * q / 100) - 1], 1) for q in [50, 75, 95]})
