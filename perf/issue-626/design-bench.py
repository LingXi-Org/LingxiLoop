"""Ten paired actual Design cold/reopen/warm runs through the existing #611 HTTPS server."""
import base64, hashlib, json, math, platform, re, ssl, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'issue-611'))
from bench import Trace, INIT, usable

out = Path('perf/issue-626/evidence')
out.mkdir(parents=True, exist_ok=True)
public_key = subprocess.check_output(['openssl', 'x509', '-pubkey', '-noout', '-in', '.codex-tmp/design-tls/cert.pem'])
der = subprocess.check_output(['openssl', 'pkey', '-pubin', '-outform', 'der'], input=public_key)
spki = base64.b64encode(hashlib.sha256(der).digest()).decode()
samples = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-proxy-server', '--host-resolver-rules=MAP *.loop.test 127.0.0.1', '--ignore-certificate-errors-spki-list=' + spki])
    for trial in range(10):
        for arm, port in ([('baseline', 4299), ('candidate', 4300)] if trial % 2 == 0 else [('candidate', 4300), ('baseline', 4299)]):
            urllib.request.urlopen(urllib.request.Request(f'https://127.0.0.1:{port}/__fixture/reset', data=b'{}', headers={'content-type': 'application/json'}), context=ssl._create_unverified_context()).read()
            context = browser.new_context(viewport={'width': 1440, 'height': 1000})
            context.add_init_script(INIT)
            page = context.new_page()
            trace = Trace(context, page)
            page.goto(f'https://app.loop.test:{port}/?kind=design')
            page.locator('#open').wait_for()
            for scenario in ['cold', 'reopen', 'warm']:
                if scenario == 'warm': page.locator('#switch').click()
                before = set(trace.requests)
                start = time.monotonic()
                page.locator('#open').click()
                _, timing = usable(page, 'design', start, trace)
                requests = [dict(v) for k, v in trace.requests.items() if k not in before and v['url'].startswith('http')]
                for request in requests:
                    request['url'] = re.sub(r'/design/[^/]+/', '/design/<grant>/', request['url'])
                    request['url'] = re.sub(r'(?<=://)[a-f0-9]{32}-artifact', '<grant-origin>-artifact', request['url'])
                row = {'trial': trial, 'arm': arm, 'scenario': scenario, **timing, 'bytes': sum(x.get('bytes', 0) for x in requests), 'requests': requests}
                samples.append(row)
                print(json.dumps({k: v for k, v in row.items() if k != 'requests'}), flush=True)
                page.keyboard.press('Escape')
                page.locator('#close').click()
            context.close()
            report = {'browser': browser.version, 'platform': platform.platform(), 'profile': {'latencyMs': 20, 'downloadMbps': 4, 'uploadMbps': 3, 'cpu': 1, 'width': 1440, 'height': 1000, 'oopifThrottled': True}, 'samples': samples}
            (out / 'design-paired.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    browser.close()
for scenario in ['cold', 'reopen', 'warm']:
    for arm in ['baseline', 'candidate']:
        values = sorted(x['usableMs'] for x in samples if x['scenario'] == scenario and x['arm'] == arm)
        print(scenario, arm, {f'p{q}': round(values[math.ceil(len(values) * q / 100) - 1], 1) for q in [50, 75, 95]})
