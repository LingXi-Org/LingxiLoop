"""Actual editor cold/warm-new-frame/switch baselines through editor-open/serve.ts.
python perf/issue-652/bench.py <runs> <out.json> baseline=4411 [candidate=4412]
Reuse issue-611's recursive CDP throttling; actual trusted double-click is required.
Retained-instance and authorization metrics are deliberately separate checks.
"""
import base64, gzip, hashlib, json, math, platform, re, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

runs, out, *arguments = sys.argv[1:]
runs, out = int(runs), Path(out)
options = dict(item.removeprefix('--').split('=', 1) for item in arguments if item.startswith('--'))
arms = [item.split('=', 1) for item in arguments if not item.startswith('--')]
width = int(options.get('width', 1440))
warm = options.get('warm') == 'true'
kinds = options.get('kinds', 'design,slides').split(',')
assert kinds and all(kind in ['design', 'slides'] for kind in kinds)
sys.argv = [sys.argv[0]]
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'issue-611'))
from bench import Trace, INIT
public_key = subprocess.check_output(['openssl', 'x509', '-pubkey', '-noout', '-in', '.codex-tmp/issue-652/tls/cert.pem'])
der = subprocess.check_output(['openssl', 'pkey', '-pubin', '-outform', 'der'], input=public_key)
spki = base64.b64encode(hashlib.sha256(der).digest()).decode()
report = {'platform': platform.platform(), 'profile': {'width': width, 'height': 1000, 'latencyMs': 20,
          'downloadMbps': 4, 'uploadMbps': 3, 'cpu': 1, 'recursiveOopifThrottle': True},
          'scope': 'Actual ArtifactEditorFrame/editor/gateway/CSP; synthetic documents/grants, no production auth, IM or model.', 'samples': []}


def usable(page, kind):
    until = time.monotonic() + 45
    while time.monotonic() < until:
        for frame in page.frames:
            try:
                selector = 'h1' if kind == 'design' else '[data-text-path]'
                text = 'Fixed performance board' if kind == 'design' else '幻灯片 1'
                target = frame.locator(selector).filter(has_text=text).first
                box = target.bounding_box(timeout=100)
                if not box or box['width'] <= 0 or box['height'] <= 0:
                    continue
                if kind == 'slides' and not frame.evaluate('Array.from(document.images).some(i=>i.complete&&i.naturalWidth>=640&&i.getBoundingClientRect().width>0)'):
                    continue
                target.dblclick(timeout=1500, position={'x': min(50, box['width'] / 2), 'y': min(20, box['height'] / 2)})
                frame.wait_for_function('Boolean(document.activeElement?.isContentEditable)', timeout=2000)
                return frame
            except Exception:
                pass
        page.wait_for_timeout(25)
    raise RuntimeError('Editor did not become editable: ' + repr([(f.url, f.locator('body').inner_text()[:160]) for f in page.frames]))


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--no-proxy-server',
          '--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1', '--ignore-certificate-errors-spki-list=' + spki])
    report['browser'] = browser.version
    for trial in range(runs):
        for arm, port in (arms if trial % 2 == 0 else arms[::-1]):
            for kind, prefix in [(kind, 'board' if kind == 'design' else 'deck') for kind in kinds]:
                context = browser.new_context(viewport={'width': width, 'height': 1000})
                context.add_init_script(INIT)
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                trace = Trace(context, page)
                page.goto(f'https://app.lingxi-perf.cn:{port}/' + (f'?warm={kind}' if warm else ''), wait_until='domcontentloaded')
                page.locator(f'#open-{prefix}-a').wait_for()
                if warm:
                    page.wait_for_timeout(4000)
                for scenario, suffix in ([('inflight-prewarm', 'a')] if warm else [('cold', 'a'), ('warm-new-frame', 'a'), ('switch', 'b')]):
                    # Include already-started warm-ups that finish during the open.
                    before = {key for key, value in trace.requests.items() if 'end' in value}
                    started = time.monotonic()
                    page.locator(f'#open-{prefix}-{suffix}').click()
                    frame = usable(page, kind)
                    elapsed = (time.monotonic() - started) * 1000
                    resources = [dict(row) for key, row in trace.requests.items() if key not in before]
                    for row in resources:
                        url = row['url']
                        for n in range(1, 301):
                            url = url.replace(hashlib.sha256(f'g{n}'.encode()).hexdigest()[:32] + '-artifact', '<grant-origin>-artifact')
                        row['url'] = re.sub(r'/(design|slides)/g\d+/', r'/\1/<grant>/', url)
                    metrics = frame.evaluate('({heap:performance.memory?.usedJSHeapSize,marks:performance.getEntriesByType("mark").filter(m=>m.name.startsWith("slides:")).map(m=>({name:m.name,at:m.startTime})),longTasks:window.__longTasks})')
                    sample = {'trial': trial, 'arm': arm, 'kind': kind, 'scenario': scenario, 'editableMs': round(elapsed, 1),
                              'bytes': sum(row.get('bytes', 0) for row in resources if row['url'].startswith('https://')), 'requests': resources, 'errors': list(errors), 'metrics': metrics}
                    report['samples'].append(sample)
                    print(json.dumps({key: value for key, value in sample.items() if key not in ['requests', 'metrics']}), flush=True)
                    if trial == 0:
                        out.parent.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(out.parent / f'{arm}-{kind}-{width}.png'))
                    page.keyboard.press('Escape')
                    page.locator('#close').click()
                    page.wait_for_timeout(100)
                context.close()
                out.parent.mkdir(parents=True, exist_ok=True)
                encoded = json.dumps(report, ensure_ascii=False, indent=2).encode()
                out.write_bytes(gzip.compress(encoded, mtime=0) if out.suffix == '.gz' else encoded)
    browser.close()
for kind in kinds:
    for scenario in (['inflight-prewarm'] if warm else ['cold', 'warm-new-frame', 'switch']):
        for arm, _ in arms:
            rows = [row for row in report['samples'] if row['kind'] == kind and row['scenario'] == scenario and row['arm'] == arm]
            values = sorted(row['editableMs'] for row in rows)
            print(kind, scenario, arm, {f'p{q}': values[math.ceil(len(values) * q / 100) - 1] for q in [50, 75, 95]})
