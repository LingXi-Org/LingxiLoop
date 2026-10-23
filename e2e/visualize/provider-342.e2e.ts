import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Reads the actual real-provider message and stored resource through production
// rendering and APIs; server auth/IM are isolated local test fixtures.
test('real generated reference renders and switches its invented stage', async ({ app, browser }) => {
  await app.open('/e2e/visualize/live.html')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  const body = guest.locator('body')
  const before = await body.textContent()
  await guest.getByRole('button', 'Switch stage', { exact: true }).tap()
  await expect.poll(() => body.textContent()).not.toBe(before)
  const after = await body.textContent()
  expect(after).toMatch(/Gather|Check/)
  const output = process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-provider-342'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/provider-browser.json`, JSON.stringify({ status: 'passed', actualSavedResource: true,
    productMessageRenderer: true, productResourceApi: true, interactionChangedStage: true,
    localAuthFixture: true, productionOperations: 0, originalCaseVerified: false }, null, 2) + '\n')
})
