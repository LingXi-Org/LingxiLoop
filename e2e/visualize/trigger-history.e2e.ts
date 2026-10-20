import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// No canned HTML or provider substitution: the server requires an accepted,
// completed real-provider message already in the dedicated test database.
test('completed real-provider visualization renders through product history and authorized sandbox', async ({ app, browser, screen }) => {
  await app.open('/e2e/visualize/live.html')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await expect(guest.locator('body')).toBeVisible()
  await expect(guest.locator('body')).not.toHaveText('')
  await app.screenshot('real-provider-comparison-ready')
  await screen.getByRole('button', '放大', { exact: true }).focus()
  await browser.keyboard.press('Enter')
  await expect(screen.getByRole('dialog')).toBeVisible()
  await app.screenshot('real-provider-comparison-expanded')
  await screen.getByRole('button', '收起', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toHaveCount(0)
  await browser.setViewport({ width: 390, height: 960 })
  await expect(guest.locator('body')).toBeVisible()
  await app.screenshot('real-provider-comparison-narrow')
})
