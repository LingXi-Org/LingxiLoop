// Focused local replay. Uses real product components, synthetic data, no live API.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const out = process.env.LAYOUT_OUTPUT || '/tmp/575-evidence'
const base = process.env.LAYOUT_BASE_URL || 'http://127.0.0.1:5180'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const results = []
async function measure(page, stage, screenshot = false) {
  const data = await page.evaluate(() => {
    const viewport = document.querySelector('[data-chat-viewport]')
    const column = document.querySelector('[data-chat-message-column]')
    const last = [...document.querySelectorAll('[data-msg-id]')].at(-1)
    const card = document.querySelector('[data-homework-id]')
    const size = element => ({ client: element.clientWidth, scroll: element.scrollWidth })
    viewport.scrollTop = viewport.scrollHeight
    return { page: size(document.documentElement), viewport: size(viewport), card: card && size(card),
      gap: +(viewport.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom).toFixed(1),
      padding: getComputedStyle(column).paddingBottom,
      localScrollers: [...document.querySelectorAll('[data-agent-body] *')].filter(element => /auto|scroll/.test(getComputedStyle(element).overflowX) && element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, ...size(element) })) }
  })
  assert.ok(data.page.scroll <= data.page.client + 1, `${stage}: page overflow`)
  assert.ok(data.viewport.scroll <= data.viewport.client + 1, `${stage}: transcript overflow`)
  assert.ok(!data.card || data.card.scroll <= data.card.client + 1, `${stage}: card overflow`)
  assert.ok(data.gap >= 16 && data.gap <= 48, `${stage}: bottom gap ${data.gap}`)
  results.push({ width: page.viewportSize().width, stage, ...data })
  if (screenshot) await page.screenshot({ path: `${out}/checked-${page.viewportSize().width}-${stage}.png`, timeout: 10000 })
  return data
}
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    // Anchor to the API root so Vite's /src/api modules remain real JavaScript.
    await page.route(`${base}/api/**`, route => route.fulfill({ json: { latestSeq: 1, entries: [], hasMore: false } }))
    const open = async (draft = true) => {
      await page.goto(`${base}/docs/evidence/issue-575/fixture.html${draft ? '?draft=1' : ''}`)
      await page.locator('[data-msg-id]').waitFor({ timeout: 20000 })
      if (draft) await page.locator('[data-homework-id]').waitFor({ timeout: 20000 })
    }
    await open(false)
    await measure(page, 'ordinary')
    // Exercise reading intent separately from focused draft form controls.
    await page.mouse.move(width / 2, 400)
    await page.evaluate(() => { window.start(); window.append() })
    await page.waitForTimeout(400)
    const distance = () => page.locator('[data-chat-viewport]').evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)
    assert.ok(await distance() <= 2, 'appended stream follows latest')
    // Read an existing prose paragraph above the growing final part/card.
    await page.locator('[data-chat-viewport]').evaluate(element => { element.scrollTop = 300 })
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(200)
    const held = await page.locator('[data-chat-viewport]').evaluate(element => {
      const bounds = element.getBoundingClientRect()
      const anchor = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
      window.__readerAnchor = anchor
      return anchor.getBoundingClientRect().top
    })
    await page.evaluate(() => { window.append(); window.finish() })
    await page.waitForTimeout(400)
    assert.ok(Math.abs(await page.evaluate(() => window.__readerAnchor.getBoundingClientRect().top) - held) <= 1, 'history position survives append and completion')
    await page.locator('[data-chat-scroll-bottom]').click()
    await page.waitForTimeout(200)
    assert.ok(await distance() <= 2, 'jump to latest restores bottom')
    await page.evaluate(() => window.rich())
    await page.locator('[data-agent-body] table').waitFor({ timeout: 20000 })
    await page.waitForTimeout(300)
    const rich = await measure(page, 'code-table-completed')
    assert.ok(rich.localScrollers.length >= 1, 'wide content retains local horizontal scrolling')
    await open()
    await measure(page, 'loading')
    await page.evaluate(() => window.releaseDraft())
    await page.locator('input[type="datetime-local"]').waitFor({ timeout: 20000 })
    await page.waitForTimeout(400)
    assert.ok(await distance() <= 2, 'asynchronously loaded draft follows latest before editing')
    await measure(page, 'loaded', true)
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: '添加附件', exact: true }).click()
    assert.equal((await chooser).isMultiple(), true, 'existing attach button opens the hidden picker')
    await page.locator('input[data-slot="input"]').first().fill('编辑后的合成长标题'.repeat(10))
    await page.getByRole('button', { name: '保存修改', exact: true }).click()
    await page.getByRole('alert').filter({ hasText: '修改未能保存' }).waitFor()
    await measure(page, 'edited-save-error')
    await page.setViewportSize({ width: width === 1280 ? 700 : 320, height: 700 })
    await measure(page, 'resized')
    await page.setViewportSize({ width, height: 900 })
    await open()
    await page.evaluate(() => window.releaseDraft())
    await page.locator('input[type="datetime-local"]').waitFor()
    await page.waitForTimeout(200)
    await measure(page, 'reloaded')
    assert.deepEqual(errors, [])
    await page.close()
  }
  await writeFile(`${out}/checked.json`, JSON.stringify(results, null, 2))
  console.log(JSON.stringify({ status: 'passed', measurements: results }, null, 2))
} finally { await browser.close() }
