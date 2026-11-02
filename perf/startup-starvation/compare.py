"""Paired cold-start probe: time to rendered conversation, boot repaint events, idle React commits/sec.

python perf/startup-starvation/compare.py <runs> <out.json> <label=url> ...
NET='{"offline": false, "latency": 150, ...}' selects the throttled profile (default 4 Mbps / 20 ms).
"""
import json, statistics, sys
from playwright.sync_api import sync_playwright

INIT = r"""
(() => {
  const ev = window.__probe = [];
  const now = () => Math.round(performance.now());
  const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height / (innerWidth * innerHeight) };
  const seen = new WeakSet();
  const scan = (root) => {
    if (!(root instanceof Element)) return;
    for (const el of [root, ...root.querySelectorAll('[data-skeleton-region],[data-resource-skeleton]')]) {
      if (!el.matches('[data-skeleton-region],[data-resource-skeleton]') || seen.has(el)) continue;
      seen.add(el); ev.push({ t: now(), type: 'skeleton-mount', label: el.getAttribute('aria-label'), area: +area(el).toFixed(2) });
    }
  };
  new MutationObserver((rs) => { for (const r of rs) { for (const n of r.addedNodes) scan(n); if (r.type === 'attributes' && r.target.id === 'boot-shell') ev.push({ t: now(), type: r.target.hidden ? 'shell-hide' : 'shell-show' }) } })
    .observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('animationstart', (e) => { if (e.target instanceof Element && e.animationName === 'ui-enter' && area(e.target) > 0.2) ev.push({ t: now(), type: 'fade-in', area: +area(e.target).toFixed(2) }) }, true);
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (...a) { try { if (area(this) > 0.2) ev.push({ t: now(), type: 'fade-in-js', area: +area(this).toFixed(2) }) } catch {} return animate.apply(this, a) };
  window.__commits = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { supportsFiber: true, renderers: new Map(), inject() { return 1 }, checkDCE() {}, onScheduleFiberRoot() {},
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onCommitFiberRoot() { window.__commits++ } };
})();
"""
import os
PROFILE = json.loads(os.environ.get('NET', '{"offline": false, "latency": 20, "downloadThroughput": 500000, "uploadThroughput": 375000}'))
READY = """() => document.querySelectorAll('[data-msg-id]').length > 0
  && ![...document.querySelectorAll('[data-skeleton-region],[data-resource-skeleton],#boot-shell')].some(e => e.checkVisibility())"""


def sample(browser, url, throttle):
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = ctx.new_page()
    if throttle:
        cdp = ctx.new_cdp_session(page)
        cdp.send('Network.enable')
        cdp.send('Network.emulateNetworkConditions', PROFILE)
    page.add_init_script(INIT)
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(url, wait_until='commit')
    try:
        page.wait_for_function(READY, timeout=30000, polling=16)
        ready = round(page.evaluate('performance.now()'))
    except Exception:
        ready = None
    page.wait_for_timeout(1500)
    page.evaluate('window.__commits = 0')
    page.wait_for_timeout(2000)
    commits = page.evaluate('window.__commits') / 2
    events = page.evaluate('window.__probe')
    first_paint = page.evaluate("performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null")
    ctx.close()
    return {'ready': ready, 'fcp': round(first_paint) if first_paint else None, 'commitsPerSec': commits, 'events': events, 'errors': errors}


def nearest(values, q):
    values = sorted(values)
    return values[max(0, min(len(values) - 1, int(round(q * len(values) + 0.5)) - 1))]


if __name__ == '__main__':
    runs = int(sys.argv[1])
    target = sys.argv[2]
    arms = [a.split('=', 1) for a in sys.argv[3:]]
    out = {label: {'fast': [], 'slow': []} for label, _ in arms}
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe')
        for i in range(runs):
            order = arms if i % 2 == 0 else list(reversed(arms))
            for label, url in order:
                for mode in ('fast', 'slow'):
                    out[label][mode].append(sample(browser, url, mode == 'slow'))
        browser.close()
    json.dump(out, open(target, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for label, modes in out.items():
        for mode, samples in modes.items():
            readies = [s['ready'] for s in samples]
            ok = [r for r in readies if r is not None]
            repaint = [sum(1 for e in s['events'] if e['type'] in ('fade-in', 'fade-in-js') or (e['type'] == 'skeleton-mount' and e['area'] > 0.2)) for s in samples]
            print(f"{label:5} {mode}: ready p50={statistics.median(ok) if ok else None} p75={nearest(ok, .75) if ok else None} stuck={readies.count(None)}/{len(readies)}"
                  f" fcp p50={statistics.median([s['fcp'] for s in samples if s['fcp']])} idleCommits/s={[s['commitsPerSec'] for s in samples]} bigRepaints={repaint} errors={sum(len(s['errors']) for s in samples)}")
