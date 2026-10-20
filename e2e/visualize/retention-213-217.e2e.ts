import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: a parked iframe emits its gutter-only height; re-entry keeps
// a collapsed viewport even though the retained document reports ready.
test('repeated conversation changes retain usable page dimensions', async ({ app, browser, screen }) => {
  await browser.addInitScript(() => {
    if (window !== window.top) return
    const events: unknown[] = []
    Object.assign(window, { __sizeEvidence: events })
    addEventListener('message', event => {
      if (event.data?.method !== 'ui/notifications/size-changed') return
      const frame = Array.from(document.querySelectorAll('iframe')).find(frame => frame.contentWindow === event.source)
      events.push({ ...event.data.params, visible: frame?.checkVisibility(), time: performance.now() })
    })
  })
  await app.open('/e2e/visualize/loading.html?count=3')
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-retention'
  await mkdir(output, { recursive: true })
  for (let iteration = 0; iteration < 12; iteration++) {
    await screen.getByRole('button', `进入 ${iteration % 2 ? 'B' : 'A'}`, { exact: true }).tap()
    await expect(browser.locator('[data-gen-ui-phase="ready"]')).toHaveCount(3)
    const guest = browser.frameLocator('[data-testid="gen-ui-card"]:first-child iframe[data-visualize-guest]').frameLocator('iframe[data-visualize-content]')
    await expect(guest.locator('[data-fixture-ready="true"]')).toBeVisible()
    const evidence = await browser.evaluate(() => ({
      events: (window as unknown as { __sizeEvidence: never[] }).__sizeEvidence,
      heights: Array.from(document.querySelectorAll('[data-testid="gen-ui-anchor"]')).map(node => node.getBoundingClientRect().height),
    }))
    await writeFile(`${output}/retention-${iteration}.json`, JSON.stringify(evidence, null, 2))
    expect(Math.min(...evidence.heights)).toBeGreaterThan(100)
    await guest.locator('#fixture-play').tap({ timeout: 10000 })
  }
  // Fast route changes exercise outstanding browser resize notifications. These
  // are ordinary fixture navigation events, never a fabricated guest message.
  await browser.evaluate(async () => {
    const enter = (name: string) => Array.from(document.querySelectorAll('button')).find(button => button.textContent === name)!.click()
    for (let index = 0; index < 12; index++) {
      enter('进入 B')
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      enter('进入 A')
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    }
    return true
  })
  const final = await browser.evaluate(() => ({
    events: (window as unknown as { __sizeEvidence: never[] }).__sizeEvidence,
    heights: Array.from(document.querySelectorAll('[data-testid="gen-ui-anchor"]')).map(node => node.getBoundingClientRect().height),
  }))
  await writeFile(`${output}/retention-final.json`, JSON.stringify(final, null, 2))
  expect(Math.min(...final.heights)).toBeGreaterThan(100)
  await browser.frameLocator('[data-testid="gen-ui-card"]:first-child iframe[data-visualize-guest]').frameLocator('iframe[data-visualize-content]').locator('#fixture-play').tap({ timeout: 10000 })
  await app.screenshot('retained-after-twelve-switches')
})
