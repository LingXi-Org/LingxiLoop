"""Paired opens of the actual Design and Slides editors through perf/editor-open.

python perf/editor-open/bench.py <runs> <out.json> baseline=<public port> candidate=<public port>

Each sample is a fresh browser context (empty HTTP cache):
  cold     open board-a, board-b (a second board), deck-a, deck-b (a second deck)
  warmed   load the host as a conversation (Design) or the Slides library
           (Slides), wait until the network is quiet, then open board-a / deck-a
  early    the same, but open 4 s after load, while any warm-up is in flight
shownMs is the host's own readiness (its loading placeholder is removed);
contentMs is when the board heading / first slide's text is in a frame's document.
"""
import json, math, platform, statistics, sys, urllib.request
import hashlib
from playwright.sync_api import sync_playwright

# Production is HTTPS. These plain-HTTP fixture origins (the app and the
# fixture's deterministic grants g1..g150 on either port) stand in for it.
SECURE = [f'http://{host}.lingxi-perf.cn:{port}' for port in (4411, 4412)
          for host in ['app'] + [hashlib.sha256(f'g{n}'.encode()).hexdigest()[:32] + '-artifact' for n in range(1, 151)]]

runs, out = int(sys.argv[1]), sys.argv[2]
arms = [arg.split('=', 1) for arg in sys.argv[3:]]
MARKERS = {'board': 'Fixed performance board', 'deck': '固定样稿，用于测量打开时间。'}
# Every frame reports, once, when the board heading or a slide's text is in
# its document (textContent: no forced layout); the host times it.
INIT = r"""(() => {
  if (window === top) { window.__content = {}; addEventListener('message', e => { const m = e.data && e.data.__perfContent; if (m && !(m in window.__content)) window.__content[m] = performance.now() }); return }
  const markers = ['Fixed performance board', '固定样稿，用于测量打开时间。']
  let queued = false, done = false
  // Same-origin child documents count too: Design renders boards in frames it writes itself.
  const texts = () => [document, ...[...document.querySelectorAll('iframe')].map(frame => { try { return frame.contentDocument } catch { return null } })]
    .map(doc => doc && doc.body ? doc.body.textContent : '').join(' ')
  const check = () => { queued = false; if (done) return; const text = texts()
    for (const m of markers) if (text.includes(m)) { done = true; top.postMessage({ __perfContent: m }, '*'); observer.disconnect(); clearInterval(timer) } }
  const observer = new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(check) } })
  let timer
  const start = () => { check(); if (!done) { observer.observe(document, { subtree: true, childList: true, characterData: true }); timer = setInterval(check, 50) } }
  document.readyState === 'loading' ? addEventListener('DOMContentLoaded', start) : start()
})()"""
OPEN = """async ([id, marker]) => {
  window.__content = {}
  const start = performance.now()
  document.getElementById('open-' + id).click()
  const until = performance.now() + 60000
  await new Promise(done => { const poll = () => { const host = document.querySelector('[data-artifact-editor]');
    if ((host && host.querySelector('iframe') && !host.querySelector('[data-resource-skeleton]')) || performance.now() > until) done(); else requestAnimationFrame(poll) }; poll() })
  const shown = performance.now() < until ? performance.now() - start : null
  while (!(marker in window.__content) && performance.now() < until) await new Promise(done => setTimeout(done, 10))
  return [shown, marker in window.__content ? window.__content[marker] - start : null]
}"""


# DevTools throttling of the page target: one shared 4 Mbps / 20 ms link. All
# frames run in the page's process (flags below), so every editor frame,
# including the baseline's sandboxed Slides frame, uses the same link.
LINK = {'offline': False, 'latency': 20, 'downloadThroughput': 4_000_000 / 8, 'uploadThroughput': 3_000_000 / 8}
received = {'bytes': 0}


def transferred(_port):
    return received['bytes']


def open_editor(page, port, artifact):
    before = transferred(port)
    shown, content = page.evaluate(OPEN, [artifact, MARKERS[artifact.split('-')[0]]])
    page.wait_for_timeout(1500)
    if shown is None or content is None:
        page.screenshot(path=f'{out}.{artifact}.{transferred(port)}.png')
    row = {'artifact': artifact, 'shownMs': round(shown, 1) if shown is not None else None, 'contentMs': round(content, 1) if content is not None else None, 'bytes': transferred(port) - before}
    page.click('#close')
    page.wait_for_timeout(300)
    return row


samples = []
with sync_playwright() as playwright:
    # Playwright's full Chromium build: the installed Chrome on the measuring
    # machine gets third-party antivirus injection into every page and frame,
    # and the headless shell ignores the secure-origin flag.
    browser = playwright.chromium.launch(channel='chromium',
                                         args=['--no-proxy-server', '--host-resolver-rules=MAP *.lingxi-perf.cn 127.0.0.1',
                                               '--disable-site-isolation-trials', '--disable-features=IsolateSandboxedIframes,IsolateOrigins,site-per-process',
                                         '--unsafely-treat-insecure-origin-as-secure=' + ','.join(SECURE)])
    for trial in range(runs):
        for arm, port in (arms if trial % 2 == 0 else list(reversed(arms))):
            port = int(port)
            for scenario, warm, artifacts in (('cold', '', ['board-a', 'board-b', 'deck-a', 'deck-b']), ('warmed', 'design', ['board-a']),
                                              ('warmed', 'slides', ['deck-a']), ('early', 'design', ['board-a']), ('early', 'slides', ['deck-a'])):
                context = browser.new_context(viewport={'width': 1440, 'height': 1000})
                context.add_init_script(INIT)
                page = context.new_page()
                cdp = context.new_cdp_session(page)
                cdp.send('Network.enable')
                cdp.send('Network.emulateNetworkConditions', LINK)
                cdp.on('Network.loadingFinished', lambda event: received.__setitem__('bytes', received['bytes'] + event['encodedDataLength']))
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://app.lingxi-perf.cn:{port}/' + (f'?warm={warm}' if warm else ''), wait_until='commit', timeout=60000)
                page.wait_for_selector('#open-board-a', timeout=60000)
                if scenario == 'warmed':
                    # Quiet: no bytes for 1.5 s, at least 4 s after load, at most 40 s.
                    last, quiet = transferred(port), 0
                    for tick in range(160):
                        page.wait_for_timeout(250)
                        now = transferred(port)
                        quiet = quiet + 250 if now == last else 0
                        last = now
                        if tick >= 16 and quiet >= 1500:
                            break
                else:
                    page.wait_for_timeout(4000 if scenario == 'early' else 500)
                for artifact in artifacts:
                    row = {'trial': trial, 'arm': arm, 'scenario': scenario, **open_editor(page, port, artifact), 'errors': len(errors)}
                    samples.append(row)
                    print(json.dumps(row), flush=True)
                context.close()
        json.dump({'browser': browser.version, 'platform': platform.platform(), 'link': LINK, 'samples': samples},
                  open(out, 'w', encoding='utf-8'), indent=1)
    browser.close()


def nearest(values, q):
    values = sorted(values)
    return values[max(0, math.ceil(len(values) * q) - 1)]


for scenario, artifacts in (('cold', ['board-a', 'board-b', 'deck-a', 'deck-b']), ('warmed', ['board-a', 'deck-a']), ('early', ['board-a', 'deck-a'])):
    for artifact in artifacts:
        for arm, _ in arms:
            rows = [s for s in samples if s['scenario'] == scenario and s['artifact'] == artifact and s['arm'] == arm]
            shown = [r['shownMs'] for r in rows if r['shownMs'] is not None]
            content = [r['contentMs'] for r in rows if r['contentMs'] is not None]
            print(f"{scenario:6} {artifact:7} {arm:9} shown p50/p75={nearest(shown, .5):.0f}/{nearest(shown, .75):.0f}"
                  f" content p50/p75={nearest(content, .5) if content else float('nan'):.0f}/{nearest(content, .75) if content else float('nan'):.0f}"
                  f" missing={len(rows) - len(content)} bytes p50={statistics.median(r['bytes'] for r in rows):.0f}")
