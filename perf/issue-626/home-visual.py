"""Settled startup views at desktop and narrow widths, against both production builds."""
import json
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

out = Path('perf/issue-626/evidence')
out.mkdir(parents=True, exist_ok=True)
results = []
with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True, args=['--no-proxy-server'])
    for width in [1440, 390]:
        for view in ['conversations', 'learning']:
            pictures = []
            for arm, port in [('baseline', 4202), ('candidate', 4201)]:
                context = browser.new_context(viewport={'width': width, 'height': 1000}, reduced_motion='reduce')
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{port}/?project=perf-project&view={view}')
                if view == 'learning':
                    page.locator('[data-testid=learner-overview-dashboard]').wait_for()
                else:
                    page.get_by_role('textbox', name='搜索会话和消息').wait_for()
                    if width == 1440:
                        page.locator('[data-empty-conversation] button').wait_for()
                page.evaluate('document.fonts.ready')
                page.wait_for_timeout(500)
                path = out / f'home-visual-{arm}-{view}-{width}.png'
                page.screenshot(path=str(path), animations='disabled')
                pictures.append(Image.open(path).convert('RGB'))
                assert not errors, errors
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'horizontal overflow'
                context.close()
            diff = ImageChops.difference(*pictures)
            changed = sum(any(channel > 16 for channel in pixel) for pixel in diff.getdata())
            ratio = changed / (width * 1000)
            results.append({'view': view, 'width': width, 'changedPixelRatio': ratio})
            assert ratio < 0.005, results[-1]
    browser.close()
(out / 'home-visual.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results))
