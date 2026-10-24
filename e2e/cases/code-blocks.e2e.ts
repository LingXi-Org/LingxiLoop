import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { nativePaste } from '../content-editor/native'

const samples = [
  { language: 'python', code: 'def greet(name: str) -> str:\n    return f"你好，{name}"\n\nprint(greet("LingxiLoop"))' },
  { language: 'json', code: '{\n  "enabled": true,\n  "items": ["a", "b"]\n}' },
  { language: 'text', code: '<not-a-script> & "quotes"\n\tindented line  \n\nlast line' },
  { language: 'js', code: 'const literal = "<em>原样</em> &lt;";' },
  { language: 'unknown-language', code: '``literal``\n<script>window.caseCodeExecuted = true</script>' },
  { language: 'text', code: `长行 ${'0123456789'.repeat(60)}` },
]
const markdown = '# 代码案例\n\n行内代码：`print("hello")`\n\n' + samples.map(({ language, code }) => `\`\`\`${language}\n${code}\n\`\`\``).join('\n\n') + '\n\n[资料](https://example.com)\n\n- 保留列表\n\n> 保留引用\n\n| 列 | 值 |\n| --- | --- |\n| A | B |'

test('case code blocks survive native paste, preview, real API save, reload and second edit', async ({ app, browser, screen }) => {
  await browser.addInitScript(() => { localStorage.setItem('lingxiloop-theme', 'light') })
  await app.open('/')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/cases?project=cases-classroom&view=cases&caseView=manage')
  await screen.getByRole('button', '新建案例', { exact: true }).tap()
  await screen.getByLabel('标题', { exact: true }).fill('代码块往返验收')
  await nativePaste(browser, screen, '正文', markdown)
  await app.screenshot('code-paste')
  const readCodes = (selector: string) => browser.evaluate(selector => Array.from(document.querySelectorAll(`${selector} pre code`)).map(node => node.textContent), selector)
  await expect.poll(() => readCodes('[aria-label="正文"]')).toEqual(samples.map(sample => sample.code))
  await screen.getByRole('button', '预览', { exact: true }).tap()
  await expect.poll(() => readCodes('[aria-label="案例预览"] .content-document')).toEqual(samples.map(sample => sample.code))
  await app.screenshot('code-preview-light')
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await expect(screen.getByRole('status').first()).toContainText('案例已发布')
  const saved = await browser.evaluate(async () => {
    const list = await fetch('/api/cases?view=manage&q=代码块往返验收', { headers: { 'x-company-id': 'cases-school' } }).then(response => response.json())
    return fetch(`/api/cases/${list.items[0].id}?view=manage`, { headers: { 'x-company-id': 'cases-school' } }).then(response => response.json())
  })
  expect(saved.editorDocument.blocks.filter((block: { type: string }) => block.type === 'codeBlock').map((block: { props: { language: string } }) => block.props.language)).toEqual(['python', 'json', 'text', 'javascript', 'text', 'text'])
  expect(saved.body).toContain(samples[2].code)
  await browser.reload()
  await expect.poll(() => readCodes('.content-document'), { timeout: 120_000 }).toEqual(samples.map(sample => sample.code))
  await expect(screen.getByRole('link', '资料', { exact: true })).toBeVisible()
  await expect(browser.locator('.content-document table')).toBeVisible()
  expect(await browser.evaluate(() => 'caseCodeExecuted' in window)).toBe(false)
  await screen.getByRole('button', '编辑案例', { exact: true }).tap()
  const firstCode = browser.locator('[aria-label="正文"] pre code').first()
  await firstCode.tap()
  await browser.evaluate(() => {
    const code = document.querySelector('[aria-label="正文"] pre code')!
    const text = document.createTreeWalker(code, NodeFilter.SHOW_TEXT).nextNode()!
    window.getSelection()!.collapse(text, 0)
    return true
  })
  await browser.keyboard.press('End')
  await browser.keyboard.type(' # 更新')
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await expect(screen.getByRole('status').first()).toContainText('案例已发布')
  await browser.reload()
  await expect.poll(() => readCodes('.content-document')).toEqual(samples.map((sample, index) => index === 0 ? sample.code.replace('def greet(name: str) -> str:', 'def greet(name: str) -> str: # 更新') : sample.code))
  await expect(screen.getByRole('button', '复制代码', { exact: true }).first()).toBeVisible()
  await screen.getByRole('button', '复制代码', { exact: true }).first().tap()
  await expect(screen.getByRole('button', '已复制', { exact: true })).toBeVisible()
  await browser.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new Error('synthetic clipboard failure') } }); return true })
  await screen.getByRole('button', '复制代码', { exact: true }).nth(1).tap()
  await expect(screen.getByText('复制失败，请选择代码后复制。', { exact: true })).toBeVisible()
  // Capture the browser clipboard write without granting a persistent browser permission.
  await browser.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async (text: string) => { (window as unknown as { copiedCode: string }).copiedCode = text } }); return true })
  await browser.locator('.content-document [data-content-type="codeBlock"] .content-code-copy').nth(2).tap()
  await expect(browser.locator('.content-document [data-content-type="codeBlock"] .content-code-copy').nth(2)).toHaveAccessibleName('已复制')
  expect(await browser.evaluate(() => (window as unknown as { copiedCode: string }).copiedCode)).toBe(samples[2].code)
  await browser.setViewport({ width: 390, height: 900 })
  await browser.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.classList.remove('light'); return true })
  await expect(screen.getByText('复制失败，请选择代码后复制。', { exact: true })).toHaveCount(0)
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(await browser.evaluate(() => Array.from(document.querySelectorAll('.content-document pre code')).every(node => ['pre', 'pre-wrap', 'break-spaces'].includes(getComputedStyle(node).whiteSpace)))).toBe(true)
  expect(await browser.evaluate(() => Array.from(document.querySelectorAll('.content-document [data-content-type="codeBlock"]')).every(block => {
    const pre = block.querySelector('pre')!.getBoundingClientRect()
    const width = block.getBoundingClientRect().width
    return pre.width >= width - 2
  }))).toBe(true)
  await app.screenshot('code-detail-dark-mobile')
})

test('legacy Markdown reading and editing share code semantics, including an unclosed fence', async ({ app, browser, screen }) => {
  await app.open('/')
  const body = '## 旧文章\n\n行内 `code`\n\n```py\nprint("<hello> &lt;")\n```\n\n```unknown\n``ticks``\n\nlast line'
  const article = await browser.evaluate(async body => {
    await fetch('/api/fixture-role/teacher')
    const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-company-id': 'cases-school' }, body: JSON.stringify({ title: '旧文章代码验收', body }) })
    return { status: response.status, data: await response.json() }
  }, body)
  expect(article.status).toBe(201)
  await app.open(`/cases/${article.data.id}?project=cases-classroom&view=cases&caseView=manage`)
  const codes = () => browser.evaluate(() => Array.from(document.querySelectorAll('main pre code')).map(node => node.textContent))
  await app.screenshot('legacy-code-reading')
  await expect.poll(codes).toEqual(['print("<hello> &lt;")', '``ticks``\n\nlast line'])
  await expect(screen.getByRole('button', '复制代码', { exact: true })).toHaveCount(2)
  await screen.getByRole('button', '编辑案例', { exact: true }).tap()
  await expect.poll(codes).toEqual(['print("<hello> &lt;")', '``ticks``\n\nlast line'])
  await screen.getByRole('button', '保存草稿', { exact: true }).tap()
  await expect(screen.getByRole('status').first()).toContainText('草稿已保存')
  await browser.reload()
  await expect.poll(codes).toEqual(['print("<hello> &lt;")', '``ticks``\n\nlast line'])
  const native = await browser.evaluate(async () => {
    const projection = '```js\nconst value = 1\n```\n\n```old-custom\n<original>\n```'
    const response = await fetch('/api/cases', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-company-id': 'cases-school' }, body: JSON.stringify({ title: '旧原生代码', body: projection, editorDocument: {
      format: 'blocknote', version: 1, projection, sections: [], blocks: [
        { id: 'old-js', type: 'codeBlock', props: { language: 'js' }, content: 'const value = 1', children: [] },
        { id: 'old-custom', type: 'codeBlock', props: { language: 'old-custom' }, content: '<original>', children: [] },
      ],
    } }) })
    return { status: response.status, data: await response.json() }
  })
  expect(native.status).toBe(201)
  await app.open(`/cases/${native.data.id}?project=cases-classroom&view=cases&caseView=manage`)
  await expect.poll(codes).toEqual(['const value = 1', '<original>'])
  await expect(screen.getByRole('button', '复制代码', { exact: true })).toHaveCount(2)
})

test('VS Code clipboard preserves HTML-like source as literal code', async ({ app, browser, screen }) => {
  await app.open('/')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/cases?project=cases-classroom&view=cases&caseView=manage')
  await screen.getByRole('button', '新建案例', { exact: true }).tap()
  const source = '<em>literal</em> &lt; &amp;\n</code><script>window.caseCodeExecuted = true</script>\n\t  final  '
  await screen.getByLabel('正文', { exact: true }).fill('')
  await browser.evaluate(source => {
    const clipboardData = new DataTransfer()
    clipboardData.setData('text/plain', source)
    clipboardData.setData('vscode-editor-data', JSON.stringify({ mode: 'html' }))
    document.querySelector('[aria-label="正文"][contenteditable="true"]')!.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData }))
    return true
  }, source)
  await app.screenshot('vscode-literal-paste')
  await expect.poll(() => browser.evaluate(() => document.querySelector('[aria-label="正文"] pre code')?.textContent ?? null)).toBe(source)
  expect(await browser.evaluate(() => 'caseCodeExecuted' in window)).toBe(false)
})
