import json
from pathlib import Path
from playwright.sync_api import sync_playwright
out = Path(__file__).parent
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 1280, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5197/docs/evidence/issue-604-followup/fixture.html', wait_until='networkidle')
    memo = page.locator('#memo')
    memo.locator('.katex').first.wait_for()
    assert memo.locator('em').inner_text() == '保留斜体'
    assert memo.locator('pre code').inner_text().strip() == 'x = 2*3*4'
    assert memo.locator('.katex-error').count() == 0
    assert memo.locator('a').evaluate_all('(items) => items.every(a => a.getAttribute("href") === "https://example.invalid/2*3*4")')
    assert memo.locator('a').count() == 2
    assert '2*3*4 and x**2' in memo.inner_text()
    editor = page.get_by_role('textbox', name='保真作答')
    editor.locator('[data-content-type="paragraph"]').last.click()
    page.keyboard.press('Control+End')
    page.keyboard.type('!')
    page.get_by_role('button', name='保存并重新打开').click()
    page.locator('output[data-open-count="1"]').wait_for()
    saved = json.loads(page.locator('output').inner_text())
    assert saved['document'] and saved['document']['projection'] == saved['value']
    code, maths, styles, links = [], [], [], []
    def collect(value):
        if isinstance(value, list):
            for item in value: collect(item)
        if not isinstance(value, dict): return
        if value.get('type') == 'codeBlock': code.append(''.join(item.get('text', '') for item in value['content']))
        if value.get('type') == 'math': maths.append(value['content'])
        if value.get('type') == 'mathBlock': maths.append(''.join(item.get('text', '') for item in value['content']))
        if value.get('styles', {}).get('italic'): styles.append(value.get('text'))
        if value.get('type') == 'link': links.append(value.get('href'))
        for item in value.values():
            if isinstance(item, (dict, list)): collect(item)
    collect(saved['document']['blocks'])
    assert code == ['x = 2*3*4'], code
    assert '2*3*4' in maths and 'x**2 + 2*3*4' in maths, maths
    assert '保留斜体' in styles, styles
    assert links == ['https://example.invalid/2*3*4'] * 2, links
    assert saved['value'].rstrip().endswith('!')
    assert editor.inner_text().rstrip().endswith('!')
    assert page.locator('#plain pre code').inner_text().startswith('import x\n')
    assert page.locator('#styled pre').count() == 0
    assert page.locator('#styled em').all_text_contents() == ['if x:', '    print(y)']
    assert page.locator('#styled [data-content-type="paragraph"]').count() == 6
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.locator('#memo a').count() == 2
    assert not errors, errors
    (out / 'browser-result.json').write_text(json.dumps({'browser': browser.version, 'node': '22.23.4', 'desktop': [1280,1000], 'mobile': [390,844], 'operatorText': True, 'mathSourceRoundtrip': maths, 'linkRoundtrip': links, 'italicRoundtrip': styles, 'codeRoundtrip': code, 'sixParagraphStyledSourcePreserved': True, 'sixParagraphPlainSourceRecovers': True, 'errors': errors, 'scope': 'Actual MemoContent, ContentEditor, ContentDocumentView with synthetic local JSON save/reopen; no production data, server persistence, live model or historical-case acceptance.'}, ensure_ascii=False, indent=2) + '\n')
    browser.close()
