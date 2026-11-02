import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '/opt/codex/cua_node/lib/node_modules/playwright-core/index.mjs')
const base = process.env.SIDEBAR_BASE_URL || 'http://127.0.0.1:5180'
const out = process.env.SIDEBAR_OUTPUT || '/tmp/628-safe-area'
const baseline = process.env.SIDEBAR_EXPECT_UNSAFE === '1'
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const reports = []
const settle = page => page.waitForTimeout(260)
async function measure(panel, close) {
  return panel.evaluate((el, closeLabel) => {
    const button = el.querySelector(`button[aria-label="${closeLabel}"]`)
    const rect = button.getBoundingClientRect()
    return { paddingTop: Number.parseFloat(getComputedStyle(el).paddingTop), paddingBottom: Number.parseFloat(getComputedStyle(el).paddingBottom),
      closeTop: rect.top, closeBottom: rect.bottom, closeHeight: rect.height, viewportHeight: innerHeight,
      pageOverflow: document.documentElement.scrollWidth - innerWidth }
  }, close)
}
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 780 }, { width: 1400, height: 900 }]) {
    const page = await browser.newPage({ viewport })
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 44, bottom: 34, left: 0, right: 0 } })
    await page.goto(`${base}/docs/evidence/issue-628/fixture.html`)
    const toggle = page.locator('[data-page-header] [data-slot=sidebar-trigger]:visible')
    await toggle.waitFor()
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    await toggle.focus(); await page.keyboard.press('Enter'); await settle(page)
    const mobile = viewport.width < 768
    const leftPanel = page.locator(mobile ? '[data-mobile=true][data-sidebar=sidebar]' : '[data-slot=sidebar-container]')
    const left = await measure(leftPanel, '收起演示文稿导航')
    const expectedTop = mobile ? 44 : 0, expectedBottom = mobile ? 34 : 0
    if (baseline && mobile) {
      assert.equal(left.paddingTop, 0)
      assert.ok(left.closeTop < 44, 'baseline must reproduce the top safe-area regression')
    } else {
      assert.equal(left.paddingTop, expectedTop)
      assert.equal(left.paddingBottom, expectedBottom)
      assert.ok(left.closeTop >= expectedTop)
      assert.ok(left.closeBottom <= viewport.height - expectedBottom)
    }
    assert.ok(left.pageOverflow <= 1)
    if (!baseline) await page.screenshot({ path: `${out}/left-safe-area-${viewport.width}.png` })
    if (mobile) await page.keyboard.press('Escape')
    else await page.getByRole('button', { name: '收起演示文稿导航', exact: true }).click()
    await settle(page)
    assert.ok(await toggle.evaluate(el => document.activeElement === el))
    // Reopening uses the same provider; inset padding does not alter toggle/focus state.
    await toggle.click(); await settle(page)
    await page.getByRole('button', { name: '收起演示文稿导航', exact: true }).click(); await settle(page)
    await page.getByRole('button', { name: '切换模块' }).click()
    const opener = page.getByRole('button', { name: '切换画板' })
    await opener.click(); await settle(page)
    const frame = page.locator('iframe[title*=设计]')
    await frame.waitFor()
    await frame.evaluate(el => { window.safeAreaCanvas = el })
    const right = await measure(page.locator('[data-slot=sidebar-container]'), '关闭设计')
    if (baseline && mobile) assert.equal(right.paddingTop, 0)
    else {
      assert.equal(right.paddingTop, expectedTop)
      assert.equal(right.paddingBottom, expectedBottom)
      assert.ok(right.closeTop >= expectedTop)
      assert.ok(right.closeBottom <= viewport.height - expectedBottom)
    }
    assert.ok(right.pageOverflow <= 1)
    if (!baseline) await page.screenshot({ path: `${out}/right-safe-area-${viewport.width}.png` })
    await page.getByRole('button', { name: '关闭设计' }).click(); await settle(page)
    assert.ok(await opener.evaluate(el => document.activeElement === el))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await opener.click(); await settle(page)
    assert.ok(await frame.evaluate(el => el === window.safeAreaCanvas))
    assert.equal(await page.locator('[data-slot=sidebar-container]').evaluate(el => getComputedStyle(el).animationName), 'none')
    assert.deepEqual(errors, [])
    reports.push({ viewport, insets: { top: 44, bottom: 34 }, left, right, focusRestored: true, retainedCanvas: true, reducedMotion: true, errors })
    await page.close()
  }
  await writeFile(`${out}/${baseline ? 'before' : 'after'}.json`, JSON.stringify(reports, null, 2) + '\n')
  console.log(JSON.stringify(reports, null, 2))
} finally { await browser.close() }
