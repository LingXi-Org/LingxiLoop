import assert from 'node:assert/strict'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Deliberate red reproduction, opt-in only. These checks must fail against the
// immutable historical provider output; never rewrite that output to turn green.
if ((process.env.E2E_VISUALIZE_HISTORY_CASE ?? 'comparison') === 'comparison') {
  test('original comparison annotation agrees with the independently solved intersection', async ({ app, browser }) => {
    await app.open('/e2e/visualize/live.html')
    await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
    const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    await app.screenshot('original-comparison-intersection-red')
    const intersectionCost = 5 * (100 / (5 - 2))
    await expect(guest.locator('#fee-svg')).toContainText(intersectionCost.toFixed(2))
  })
  test('original comparison recommends the lower cost for n=20', async ({ app, browser }) => {
    await app.open('/e2e/visualize/live.html')
    await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
    const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    await guest.locator('#fee-n').fill('20')
    await app.screenshot('original-comparison-decision-red')
    assert.ok(5 * 20 < 100 + 2 * 20)
    await expect(guest.locator('#fee-result')).toContainText('选乙方案')
  })
} else {
  test('original trend bars show differences of consecutive profits', async ({ app, browser }) => {
    await app.open('/e2e/visualize/live.html')
    await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
    const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
    const profits = [12, 18, 17, 25, 31, 40].map((revenue, i) => revenue - [8, 11, 12, 15, 17, 20][i])
    const expected = profits.slice(1).map((profit, i) => profit - profits[i])
    await app.screenshot('original-trend-deltas-red')
    const labels = await guest.locator('#bars > text').allTextContents()
    const actual = labels.slice(0, 6).filter(Boolean).map(label => Number(label.replace(/^\+/, '')))
    assert.deepEqual(actual, expected)
  })
}
