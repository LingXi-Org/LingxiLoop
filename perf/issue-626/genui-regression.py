"""Actual GenUI guest checks for optional/dynamic math and unchanged screenshots."""
import json, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

out = Path('perf/issue-626/evidence')
out.mkdir(parents=True, exist_ok=True)
math_hash = '112da856cde909717da3c006c7bdc2e77d895988888c941e91db89c2eac173d3'
results = []
def post(port, route, value=None):
    return urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}/{route}', data=json.dumps(value or {}).encode(), headers={'content-type': 'application/json'})).read()
def find_guest(page):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        for frame in page.frames:
            if frame.locator('h1').count(): return frame
        page.wait_for_timeout(20)
    raise AssertionError('No GenUI content frame')

with sync_playwright() as p:
    browser = p.chromium.launch()
    for width in [1440, 390]:
        for arm, port in [('baseline', 4197), ('candidate', 4198)]:
            post(port, '__fixture/reset')
            context = browser.new_context(viewport={'width': width, 'height': 1000})
            page = context.new_page()
            page.goto(f'http://127.0.0.1:{port}/?kind=visualize')
            page.locator('#open').click()
            frame = find_guest(page)
            frame.locator('#increment').click()
            frame.locator('#count').filter(has_text='1').wait_for()
            page.wait_for_timeout(100)
            page.screenshot(path=str(out / f'genui-{arm}-{width}.png'))
            context.close()
        diff = ImageChops.difference(Image.open(out / f'genui-baseline-{width}.png').convert('RGB'), Image.open(out / f'genui-candidate-{width}.png').convert('RGB'))
        assert diff.getbbox() is None, f'visual change at width {width}: {diff.getbbox()}'
        results.append({'case': f'unchanged interactive output and exact screenshot at {width}px', 'passed': True})

    post(4198, '__fixture/reset')
    post(4198, '__fixture/stall-math', {'enabled': True})
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    requests = []
    page.on('request', lambda request: requests.append(request.url))
    page.goto('http://127.0.0.1:4198/?kind=visualize')
    started = time.monotonic()
    page.locator('#open').click()
    frame = find_guest(page)
    frame.locator('#increment').click()
    frame.locator('#count').filter(has_text='1').wait_for()
    usable_ms = (time.monotonic() - started) * 1000
    assert usable_ms < 5000, usable_ms
    assert not any(math_hash in url or 'name=math.js' in url for url in requests)
    results.append({'case': 'unavailable unused math cannot delay initial SDK state acknowledgement', 'passed': True, 'usableMs': usable_ms, 'mathRequests': 0})

    post(4198, '__fixture/stall-math', {'enabled': False})
    frame.evaluate("document.querySelector('#tab-two').hidden=false; document.querySelector('#tab-two').textContent='\\\\(x^2\\\\)' ")
    frame.locator('#tab-two .katex').wait_for()
    assert sum(math_hash in url for url in requests) == 1
    assert frame.evaluate("document.querySelector('#tab-two .katex').textContent.includes('x')")
    frame.evaluate("document.querySelector('#tab-two').replaceChildren(document.createTextNode('placeholder'))")
    frame.evaluate("document.querySelector('#tab-two').firstChild.data='\\\\[y^2\\\\]'")
    frame.locator('#tab-two .katex-display').wait_for()
    assert sum(math_hash in url for url in requests) == 1
    results.append({'case': 'dynamic inline and display math render from one hash-verified optional request', 'passed': True})
    context.close()

    post(4198, '__fixture/reset')
    post(4198, '__fixture/content', {'visualization': '<h1>Math before use</h1><p id="formula">\\(x^2\\)</p><p id="price">$5 and $10</p><code>\\(literal\\)</code>'})
    context = browser.new_context()
    page = context.new_page()
    page.goto('http://127.0.0.1:4198/?kind=visualize')
    page.locator('#open').click()
    frame = find_guest(page)
    frame.locator('#formula .katex').wait_for()
    assert frame.locator('#price').inner_text() == '$5 and $10'
    assert frame.locator('code').inner_text() == '\\(literal\\)'
    assert frame.locator('code .katex').count() == 0
    results.append({'case': 'initial formulas render; ordinary currency and code remain literal', 'passed': True})
    context.close()
    browser.close()
(out / 'genui-regressions.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
