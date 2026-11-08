"""Focused trusted-wheel regression for the benchmark's board navigation.

Uses a small DOM fixture, not the application or a performance measurement.
Keeps the production benchmark's complete image/formula/font readiness check.
"""
import argparse
import importlib.util
import json
from pathlib import Path
from urllib.parse import quote
from playwright.sync_api import sync_playwright

spec = importlib.util.spec_from_file_location('benchmark', Path(__file__).with_name('native-artifact-benchmark.py'))
benchmark = importlib.util.module_from_spec(spec)
spec.loader.exec_module(benchmark)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--browser', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    rows = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.browser, args=['--no-sandbox'])
        for width in (619, 1440):
            page = browser.new_page(viewport={'width': width, 'height': 926})
            image = 'data:image/svg+xml,' + quote('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="green"/></svg>')
            boards = []
            for number in range(1, 51):
                x, y = 48 + (number - 1) % 5 * 1040, 80 + (number - 1) // 5 * 620
                boards.append(f'''<div class="native-page-shell" data-artboard-id="page-{number}" data-page-id="page-{number}" style="left:{x}px;top:{y}px;width:960px;height:540px">
                  <button class="native-board-label">页面 {number}</button>
                  <h1 data-node-id="page-{number}-heading" style="left:32px;top:20px;width:576px;height:38px">验收页面 {number}</h1>
                  <img src="{image}" style="left:32px;top:100px;width:320px;height:180px">
                  <span data-formula-ready="true" style="left:372px;top:110px;width:230px;height:80px">公式</span></div>''')
            page.set_content('''<style>body{margin:0}.native-stage{position:relative;width:100vw;height:926px;overflow:auto}.world{position:relative;width:5300px;height:6400px}.native-page-shell{position:absolute}.native-page-shell>*{position:absolute;margin:0}.native-board-label{top:-24px;width:64px;height:22px}</style>
              <main data-native-artifact-editor="design"><div class="native-stage"><div class="world">''' + ''.join(boards) + '</div></div></main>')
            page.evaluate('''() => {
              document.addEventListener('wheel', event => window.lastWheelTrusted=event.isTrusted);
              document.addEventListener('click', event => {const label=event.target.closest('.native-board-label');if(label)window.lastBoardClick={id:label.parentElement.dataset.artboardId,trusted:event.isTrusted}});
            }''')
            observations = []
            for number in range(2, 51):
                navigation = benchmark.navigate(page, 'design', number)
                _, _, proof = benchmark.ready_heading(page, 'design', number, timeout=1)
                assert page.evaluate('window.lastWheelTrusted') is True
                assert page.evaluate('window.lastBoardClick') == {'id': f'page-{number}', 'trusted': True}
                observations.append({'pageNumber': number, **navigation, **proof})
            rows.append({'width': width, 'height': 926, 'visitedPages': 49, 'readiness': observations})
            page.close()
        browser.close()
    Path(args.out).write_text(json.dumps({'scope': '基准导航器的受控DOM回归；不是产品、授权API或性能验收', 'rows': rows}, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
