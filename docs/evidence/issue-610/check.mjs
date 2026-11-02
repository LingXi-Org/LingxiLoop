import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.LAYOUT_BASE_URL || 'http://127.0.0.1:5180'
const out = process.env.LAYOUT_OUTPUT || '/tmp/610-evidence'
const baseline = process.env.LAYOUT_BASELINE === '1'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const reports = []
try {
  for (const width of [1920, 1280, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(`${base}/api/**`, route => route.fulfill({ json: { latestSeq: 0, entries: [], hasMore: false } }))
    await page.goto(`${base}/docs/evidence/issue-610/fixture.html`)
    await page.locator('[data-msg-id="16"]').waitFor({ timeout: 60000 })
    await page.locator('[data-chat-viewport]').evaluate(el => { el.scrollTop = 0 })
    await page.waitForTimeout(400)
    const measure = async (stage) => {
      const result = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width } }
        const viewport = document.querySelector('[data-chat-viewport]')
        return { column: rect('[data-chat-message-column]'), agent: rect('[data-msg-id="4"] [data-agent-body]'),
          human: rect('[data-msg-id="3"] [data-message-bubble]'), composer: rect('[data-composer-column]'),
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          transcriptOverflow: viewport.scrollWidth - viewport.clientWidth,
          bottomDistance: viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight,
          ids: [...document.querySelectorAll('[data-msg-id]')].map(el => el.dataset.msgId) }
      })
      reports.push({ width, stage, ...result })
      assert.ok(result.pageOverflow <= 1 && result.transcriptOverflow <= 1, `${width}/${stage}: horizontal overflow`)
      assert.equal(result.ids.length, 16)
      if (!baseline) {
        assert.ok(result.column.width <= 960, `${width}/${stage}: unbounded reading column`)
        assert.ok(result.agent.right > result.human.left + 20, `${width}/${stage}: replies remain in separate horizontal lanes`)
      }
      return result
    }
    await measure('full')
    if (width === 1920 || width === 390) await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-${width}.png` })
    await page.locator('[data-msg-id="7"]').scrollIntoViewIfNeeded()
    await page.locator('[data-msg-id="8"] svg[id^="mermaid"]').waitFor({ timeout: 30000 })
    await page.locator('[data-msg-id="7"] code').evaluate(el => el.scrollIntoView({ block: 'start' }))
    await page.waitForTimeout(400)
    await measure('code-visualization')
    if (width === 1920 || width === 390) await page.screenshot({ path: `${out}/${baseline ? 'before' : 'after'}-rich-${width}.png` })
    // Same viewport/content/composer DOM must survive the actual split pane toggle.
    const anchorTop = await page.evaluate(() => {
      window.__viewport610 = document.querySelector('[data-chat-viewport]')
      const code = document.querySelector('[data-msg-id="7"] code')
      const selection = getSelection(), range = document.createRange()
      range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range)
      return code.getBoundingClientRect().top
    })
    await page.getByRole('button', { name: '切换画板' }).click()
    await page.locator('[data-design-open="true"]').waitFor()
    await page.waitForTimeout(400)
    await measure('design-open')
    assert.ok(await page.evaluate(() => window.__viewport610 === document.querySelector('[data-chat-viewport]')))
    await page.getByRole('button', { name: '关闭设计', exact: true }).click()
    await page.waitForTimeout(400)
    await measure('design-closed')
    const held = await page.evaluate(() => ({ top: document.querySelector('[data-msg-id="7"] code').getBoundingClientRect().top, selected: getSelection().toString() }))
    reports.push({ width, stage: 'reading-anchor', displacement: held.top - anchorTop })
    assert.ok(Math.abs(held.top - anchorTop) <= 56, `${width}: reading anchor moved by ${held.top - anchorTop}px`)
    assert.equal(held.selected, 'LongUnbrokenCode'.repeat(50))
    // Changing viewport and opening a pane preserves the existing bottom-follow intent.
    await page.locator('[data-chat-scroll-bottom]').click()
    await page.waitForTimeout(200)
    await page.setViewportSize({ width: width > 768 ? 700 : width, height: 700 })
    await page.waitForTimeout(400)
    const resized = await measure('resized-at-bottom')
    assert.ok(resized.bottomDistance <= 2, `bottom intent lost: ${resized.bottomDistance}`)
    const input = page.locator('[contenteditable="true"]').first()
    await input.fill('布局回归输入')
    assert.equal(await input.innerText(), '布局回归输入')
    assert.deepEqual(errors, [])
    await page.close()
  }
  await writeFile(`${out}/measurements.json`, JSON.stringify({ baseline, browser: 'cloud Chromium', reports }, null, 2))
  console.log(JSON.stringify({ passed: true, baseline, scenarios: reports.length }))
} finally { await browser.close() }
