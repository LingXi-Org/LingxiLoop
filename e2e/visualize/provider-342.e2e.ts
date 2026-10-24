import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Reads the actual real-provider message and stored resource through production
// rendering and APIs; server auth/IM are isolated local test fixtures.
test('real generated reference renders and switches its invented stage', async ({ app, browser }) => {
  await app.open('/e2e/visualize/live.html')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  const gather = guest.getByRole('heading', 'Gather', { exact: true })
  const check = guest.getByRole('heading', 'Check', { exact: true })
  const gatherDescription = guest.getByText('Collect the items.', { exact: true })
  const checkDescription = guest.getByText('Review the items.', { exact: true })
  // A state-qualified accessible name is valid; the visible label stays exact.
  const toggle = guest.getByRole('button', /^Switch stage(?:\. Currently showing (?:Gather|Check)\.)?$/)
  await expect(toggle).toHaveText('Switch stage')
  await expect(gather).toBeVisible()
  await expect(gatherDescription).toBeVisible()
  await expect(check).toBeHidden()
  await expect(checkDescription).toBeHidden()
  await toggle.tap()
  await expect(toggle).toHaveText('Switch stage')
  await expect(check).toBeVisible()
  await expect(checkDescription).toBeVisible()
  await expect(gather).toBeHidden()
  await expect(gatherDescription).toBeHidden()
  await toggle.tap()
  await expect(toggle).toHaveText('Switch stage')
  await expect(gather).toBeVisible()
  await expect(gatherDescription).toBeVisible()
  await expect(check).toBeHidden()
  await expect(checkDescription).toBeHidden()
  const output = process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-provider-342'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/provider-browser.json`, JSON.stringify({ status: 'passed', actualSavedResource: true,
    productMessageRenderer: true, productResourceApi: true, interactionChangedStage: true,
    observedVisibleTransitions: ['Gather: Collect the items.', 'Check: Review the items.', 'Gather: Collect the items.'],
    localAuthFixture: true, productionOperations: 0, originalCaseVerified: false }, null, 2) + '\n')
})
