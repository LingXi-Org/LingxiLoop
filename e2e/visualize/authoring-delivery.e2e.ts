import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: docs/evidence/issue-342/FAILURE-MODEL.md. Real product renderer;
// deterministic local transport, separate from Worker/authorization coverage.
test('delivered reference renders an interactive view through the product host', async ({ app, browser }) => {
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await expect(guest.getByRole('button', 'Saved count: 5', { exact: true })).toBeVisible()
  await guest.getByRole('button', 'Saved count: 5', { exact: true }).tap()
  await expect(guest.getByRole('button', 'Saved count: 6', { exact: true })).toBeVisible()
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-authoring'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/delivery-smoke.json`, JSON.stringify({ syntheticOnly: true, productionRequests: 0,
    originalCaseVerified: false, productRenderer: true, transport: 'local fixture', ready: true,
    before: 5, after: 6, interactionObserved: true, providerAdherenceProven: false }, null, 2) + '\n')
  await app.screenshot('synthetic-delivered-view-interaction')
})
