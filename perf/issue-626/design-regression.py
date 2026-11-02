"""Real Design edits, math, retention and each unchanged fallback program."""
import base64, hashlib, json, ssl, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'issue-611'))
from bench import Trace, usable, guest

out = Path('perf/issue-626/evidence')
out.mkdir(parents=True, exist_ok=True)
public_key = subprocess.check_output(['openssl', 'x509', '-pubkey', '-noout', '-in', '.codex-tmp/design-tls/cert.pem'])
der = subprocess.check_output(['openssl', 'pkey', '-pubin', '-outform', 'der'], input=public_key)
spki = base64.b64encode(hashlib.sha256(der).digest()).decode()
origin = 'https://app.loop.test:4300/'
runtime = json.loads(Path('server/assets/design-editor/manifest.json').read_text())['runtime']['file'].split('/')[-1]
def api(route, value=None, port=4300):
    request = urllib.request.Request(f'https://127.0.0.1:{port}/' + route, data=None if value is None else json.dumps(value).encode(), headers={'content-type': 'application/json'})
    return urllib.request.urlopen(request, context=ssl._create_unverified_context()).read()
fragment = Path('scripts/fixtures/visualize-math-fragment.html').read_text(encoding='utf-8').replace('<h1>', '<h2>').replace('</h1>', '</h2>')
board = '<!doctype html><html><head><script src="./support.js"></script></head><body><x-dc><h1>Fixed math board</h1>' + fragment + '</x-dc></body></html>'
canvas = {'v': 3, 'title': 'Formula integration', 'launch': {'view': 'canvas'}, 'boards': {'Main.dc.html': {'x': 0, 'y': 0, 'w': 760, 'h': 850}}, 'order': ['Main.dc.html'], 'pages': [], 'notes': {}, 'designSystems': {}}
reports = []
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-proxy-server', '--host-resolver-rules=MAP *.loop.test 127.0.0.1', '--ignore-certificate-errors-spki-list=' + spki])
    for mode in ['embedded', 'external-fallback', 'inline-fallback']:
        api('__fixture/reset', {})
        api('__fixture/content', {'board': board, 'canvas': canvas})
        context = browser.new_context(viewport={'width': 1440, 'height': 1000})
        if mode != 'embedded':
            # Revoke the prepared runtime blob, preserving the native blob probe.
            # The real browser failure exercises the pinned recovery state machine.
            context.add_init_script("""const makeBlob=URL.createObjectURL.bind(URL);URL.createObjectURL=(blob)=>{const url=makeBlob(blob);if(blob.type==='text/javascript'&&blob.size>800000){URL.revokeObjectURL(url);window.__revokedRuntimeBlob=true}return url}""")
        if mode == 'inline-fallback': context.route('**/' + runtime, lambda route: route.abort('failed'))
        page = context.new_page()
        page.set_default_timeout(20000)
        requests = []
        page.on('request', lambda request: requests.append(request.url))
        page.goto(origin + '?kind=design')
        page.locator('#open').click()
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            frame = guest(page, 'design')
            try:
                if frame and frame.locator('.katex').count() == 6:
                    frame.locator('h1').dblclick(timeout=1000)
                    frame.locator('h1[contenteditable="true"]').wait_for(timeout=1000)
                    break
            except Exception: pass
            page.wait_for_timeout(50)
        else:
            page.screenshot(path=str(out / f'design-{mode}-failed.png'))
            raise AssertionError(f'{mode} did not become editable with six formulas')
        runtime_requests = sum(runtime in url for url in requests)
        assert runtime_requests == (0 if mode == 'embedded' else 1), (mode, runtime_requests)
        page.keyboard.press('Escape')
        frame.evaluate('document.fonts.ready')
        assert frame.locator('.katex-display').count() == 3
        assert frame.locator('#ordinary').inner_text() == 'Budget $5 and $10; ordinary text stays readable.'
        assert 'unknowncommand' in frame.locator('#invalid').inner_text()
        frame.evaluate('(html)=>window.__dcUpdate(window.__dcRootName(),"html",html)', '<h1>Fixed math board</h1>' + fragment.replace('a_1=1', 'a_2=2'))
        frame.wait_for_function('document.querySelector("#dynamic annotation")?.textContent==="a_2=2"')
        page.screenshot(path=str(out / f'design-{mode}-1440.png'))
        page.set_viewport_size({'width': 768, 'height': 1000})
        page.screenshot(path=str(out / f'design-{mode}-768.png'))
        page.evaluate('window.__retained=document.querySelector("[data-artifact-editor] iframe")')
        page.locator('#close').click()
        page.locator('#open').click()
        assert page.evaluate('window.__retained===document.querySelector("[data-artifact-editor] iframe")')
        assert guest(page, 'design').locator('.katex').count() == 6
        reports.append({'case': mode + ' renders six formulas, edits, updates math and retains the same iframe', 'passed': True, 'externalRuntimeRequests': runtime_requests})
        print(json.dumps(reports[-1]), flush=True)
        context.close()

    api('__fixture/reset', {})
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.goto(origin + '?kind=design')
    trace = Trace(context, page)
    page.locator('#open').click()
    frame, _ = usable(page, 'design', time.monotonic(), trace)
    frame.locator('h1').fill('Fixed performance board edited')
    page.keyboard.press('Escape')
    url = page.locator('[data-artifact-editor] iframe').get_attribute('src')
    path = url.split('/artifact-editor/', 1)[1]
    for _ in range(100):
        if b'Fixed performance board edited' in api('artifact-editor/' + path + 'project/Main.dc.html'): break
        page.wait_for_timeout(50)
    else: raise AssertionError('edit did not persist through CAS publication')
    page.reload()
    page.locator('#open').click()
    frame, _ = usable(page, 'design', time.monotonic(), trace)
    assert frame.locator('h1').inner_text() == 'Fixed performance board edited'
    page.locator('#switch').click()
    page.locator('#open').click()
    frame, _ = usable(page, 'design', time.monotonic(), trace)
    assert frame.locator('h1').inner_text() == 'Fixed performance board'
    reports.append({'case': 'actual edit CAS publication, saved refresh and conversation isolation', 'passed': True})
    context.close()
    browser.close()
(out / 'design-regressions.json').write_text(json.dumps(reports, indent=2), encoding='utf-8')
print(json.dumps(reports, indent=2))
