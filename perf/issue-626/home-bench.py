"""Paired cold startup of actual web builds; local synthetic data, no production writes."""
import argparse, json, math, os
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('--urls', nargs='+', required=True)
parser.add_argument('--runs', type=int, default=10)
parser.add_argument('--out', required=True)
args = parser.parse_args()
out = Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
samples = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True, args=['--no-proxy-server'])
    version = browser.version
    for run in range(args.runs):
        for view in ['conversations', 'learning']:
            for arm in (list(range(len(args.urls))) if run % 2 == 0 else list(reversed(range(len(args.urls))))):
                context = browser.new_context(viewport={'width': 1440, 'height': 1000})
                page = context.new_page()
                errors = []; page.on('pageerror', lambda err: errors.append(str(err)))
                session = context.new_cdp_session(page)
                session.send('Network.enable')
                session.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 20, 'downloadThroughput': 500000, 'uploadThroughput': 375000, 'connectionType': 'cellular4g'})
                page.add_init_script("window.longTasks=[];new PerformanceObserver(l=>window.longTasks.push(...l.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true})")
                page.goto(args.urls[arm] + '/?project=perf-project&view=' + view, wait_until='domcontentloaded')
                if view == 'conversations':
                    page.locator('[data-empty-conversation] button').click(timeout=60000)
                    page.get_by_role('dialog').wait_for()
                else:
                    page.locator('[data-testid=learner-overview-dashboard]').wait_for(timeout=60000)
                    # Exercise a real dashboard action, not just the loading shell.
                    page.get_by_role('button', name='前往论坛', exact=True).focus()
                    assert page.get_by_role('button', name='前往论坛', exact=True).evaluate('(el)=>document.activeElement===el')
                result = page.evaluate("""() => ({usableMs:performance.now(), resources:performance.getEntriesByType('resource').filter(e=>e.name.startsWith(location.origin+'/')).map(e=>({name:e.name.replace(location.origin,''),start:e.startTime,end:e.responseEnd,bytes:e.encodedBodySize,decoded:e.decodedBodySize})),longTasks:window.longTasks})""")
                result.update({'run': run, 'arm': arm, 'view': view, 'errors': errors})
                assert not errors, errors
                samples.append(result)
                if run == 0: page.screenshot(path=str(out.parent / f'home-{arm}-{view}.png'))
                if view == 'learning':
                    page.get_by_role('button', name='前往论坛', exact=True).click()
                    page.locator('[data-ui-page=forum]').first.wait_for()
                print(json.dumps({k: result[k] for k in ['run', 'arm', 'view', 'usableMs']}), flush=True)
                context.close()
    browser.close()
summary = []
for arm in range(len(args.urls)):
    for view in ['conversations', 'learning']:
        group = [s for s in samples if s['arm'] == arm and s['view'] == view]
        values = sorted(s['usableMs'] for s in group)
        summary.append({'arm': arm, 'view': view, **{f'p{p}': values[math.ceil(len(values)*p/100)-1] for p in [50, 75, 95]},
          'jsBytes': sum(r['bytes'] for r in group[0]['resources'] if r['name'].split('?')[0].endswith('.js'))})
out.write_text(json.dumps({'browser': version, 'profile': '4Mbps down / 3Mbps up / 20ms RTT, CPU 1x, cold contexts; synthetic API delay 100ms', 'summary': summary, 'samples': samples}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary), flush=True)
if len(args.urls) == 2 and args.runs >= 10:
    for view in ['conversations', 'learning']:
        before = next(s for s in summary if s['arm'] == 0 and s['view'] == view)
        after = next(s for s in summary if s['arm'] == 1 and s['view'] == view)
        assert after['p75'] < before['p75'] * 0.85, (view, before, after)
        assert after['jsBytes'] < before['jsBytes'] * 0.7, (view, before, after)
