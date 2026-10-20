import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model is recorded before the owning component change in
// docs/evidence/issue-246-layout/FAILURE-MODEL.md.
for (const width of [1440, 390]) test(`all authored corners survive rounded clipping (${width})`, async ({ app, browser, screen }) => {
  await browser.setViewport({ width, height: 960 })
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light&corners=1')
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await expect(guest.locator('#corner-counter')).toHaveText('Local count: 0')
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-corners'
  await mkdir(output, { recursive: true })

  const geometry = async () => {
    const content = JSON.parse((await guest.locator('#corner-surface').getAttribute('data-bounds'))!) as { x: number; y: number; width: number; height: number }
    return browser.evaluate((content) => {
      const card = document.querySelector('[data-testid="gen-ui-card"]')!.firstElementChild!
      const frame = document.querySelector('iframe[data-visualize-guest]')!
      const outer = card.getBoundingClientRect(), iframe = frame.getBoundingClientRect()
      const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius)
      const left = iframe.left + content.x, top = iframe.top + content.y
      const right = left + content.width, bottom = top + content.height
      const corners = [[left + .5, top + .5], [right - .5, top + .5], [left + .5, bottom - .5], [right - .5, bottom - .5]]
      return {
        content, radius, minimumInset: radius * (1 - 1 / Math.sqrt(2)),
        insets: [left - outer.left, top - outer.top, outer.right - right, outer.bottom - bottom],
        cornerHits: corners.map(([x, y]) => document.elementFromPoint(x, y) === frame),
        frameWidth: iframe.width, frameHeight: iframe.height,
        cardWidth: outer.width, cardHeight: outer.height,
        documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      }
    }, content)
  }

  const initial = await geometry()
  await app.screenshot(`inline-corners-${width}`)
  await writeFile(`${output}/corners-${width}-initial.json`, JSON.stringify(initial, null, 2))
  expect(initial.radius).toBeGreaterThan(0)
  for (const inset of initial.insets) expect(inset).toBeGreaterThanOrEqual(initial.minimumInset)
  expect(initial.cornerHits).toEqual([true, true, true, true])
  expect(initial.documentWidth).toBeLessThanOrEqual(initial.viewport)

  await guest.locator('#corner-counter').tap()
  await screen.getByRole('button', '放大', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toBeVisible()
  await expect(guest.locator('#corner-counter')).toHaveText('Local count: 1')
  await app.screenshot(`preview-corners-${width}`)
  await screen.getByRole('button', '收起', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toHaveCount(0)
  await expect(guest.locator('#corner-counter')).toHaveText('Local count: 1')
  await expect.poll(async () => (await geometry()).cornerHits).toEqual([true, true, true, true])
  const collapsed = await geometry()
  await writeFile(`${output}/corners-${width}-collapsed.json`, JSON.stringify(collapsed, null, 2))
  expect(collapsed.content).toEqual(initial.content)
  await app.screenshot(`collapsed-corners-${width}`)
  if (width === 1440) {
    await browser.setViewport({ width: 390, height: 960 })
    await expect.poll(async () => (await geometry()).content.width).toBeLessThan(initial.content.width)
    await expect.poll(async () => (await geometry()).cornerHits).toEqual([true, true, true, true])
    const resized = await geometry()
    expect(resized.documentWidth).toBeLessThanOrEqual(resized.viewport)
    await expect(guest.locator('#corner-counter')).toHaveText('Local count: 1')
    await writeFile(`${output}/corners-${width}-resized.json`, JSON.stringify(resized, null, 2))
    await app.screenshot(`resized-corners-${width}`)
  }
})
