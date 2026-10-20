import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure: abort does not roll back server work. A times out before its
// transaction, B succeeds, then A commits and revokes B with the same instanceKey.
test('a late committed acquisition cannot revoke a successful retry', async ({ app, browser, screen }) => {
  await app.open('/e2e/visualize/loading.html?count=1')
  await browser.evaluate(async () => { await fetch('/__visualize_fixture/fault?stage=late-create'); return true })
  await screen.getByRole('button', '进入 A', { exact: true }).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'error', { timeout: 18000 })
  await browser.evaluate(async () => { await fetch('/__visualize_fixture/fault'); return true })
  await screen.getByRole('button', '重试', { exact: true }).tap()
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await expect(guest.locator('#fixture-count')).toHaveText('Saved count: 5')
  await browser.evaluate(async () => { await fetch('/__visualize_fixture/fault?release=1'); return true })
  await guest.locator('#fixture-count').tap()
  await expect(guest.locator('#fixture-status')).toHaveText('Saved')
  await expect(guest.locator('#fixture-count')).toHaveText('Saved count: 6')
  const evidence = await browser.evaluate(async () => (await fetch('/__visualize_fixture/evidence')).json())
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-timeout'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/late-create.json`, JSON.stringify(evidence, null, 2))
  // The old response was lost; its capability expires server-side. Do not
  // pretend client abort proves revocation or weaken the existing page quota.
  expect(evidence.activePages).toBe(2)
  await app.screenshot('late-create-new-page-still-usable')
})
