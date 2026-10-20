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

  const geometry = async (preview = false) => {
    const content = JSON.parse((await guest.locator('#corner-surface').getAttribute('data-bounds'))!) as { x: number; y: number; width: number; height: number }
    return browser.evaluate(({ content, preview }) => {
      const card = preview ? document.querySelector('[data-testid="gen-ui-preview-anchor"]')! : document.querySelector('[data-testid="gen-ui-card"]')!.firstElementChild!
      const frame = document.querySelector<HTMLElement>('iframe[data-visualize-guest]')!
      const outer = card.getBoundingClientRect(), iframe = frame.getBoundingClientRect()
      const scale = (frame as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom || 1
      const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius) * scale
      const left = iframe.left + content.x * scale, top = iframe.top + content.y * scale
      const right = left + content.width * scale, bottom = top + content.height * scale
      const corners = [[left + .5, top + .5], [right - .5, top + .5], [left + .5, bottom - .5], [right - .5, bottom - .5]]
      return {
        content, radius, scale, minimumInset: radius * (1 - 1 / Math.sqrt(2)),
        insets: [left - outer.left, top - outer.top, outer.right - right, outer.bottom - bottom],
        cornerHits: corners.map(([x, y]) => document.elementFromPoint(x, y) === frame),
        frameAlignment: [iframe.left - outer.left, iframe.top - outer.top, iframe.right - outer.right, iframe.bottom - outer.bottom],
        frameWidth: iframe.width, frameHeight: iframe.height,
        cardWidth: outer.width, cardHeight: outer.height,
        documentWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      }
    }, { content, preview })
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

  // This is CSS zoom coverage, not native browser zoom or device pinch zoom.
  await browser.setViewport({ width, height: 960 })
  await browser.evaluate(() => { document.body.style.zoom = '1.25'; return true })
  await expect.poll(async () => (await geometry()).cornerHits).toEqual([true, true, true, true])
  const zoomedInline = await geometry()
  await writeFile(`${output}/corners-${width}-css-zoom-inline.json`, JSON.stringify(zoomedInline, null, 2))
  await app.screenshot(`css-zoom-inline-${width}`)
  expect(zoomedInline.scale).toBe(1.25)
  for (const inset of zoomedInline.insets) expect(inset).toBeGreaterThanOrEqual(zoomedInline.minimumInset)
  expect(zoomedInline.documentWidth).toBeLessThanOrEqual(zoomedInline.viewport)

  await screen.getByRole('button', '放大', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toBeVisible()
  await expect(guest.locator('#corner-counter')).toHaveText('Local count: 1')
  await browser.evaluate(() => new Promise<boolean>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))))
  const zoomedPreview = await geometry(true)
  await writeFile(`${output}/corners-${width}-css-zoom-preview.json`, JSON.stringify(zoomedPreview, null, 2))
  await app.screenshot(`css-zoom-preview-${width}`)
  expect(zoomedPreview.cornerHits).toEqual([true, true, true, true])
  for (const offset of zoomedPreview.frameAlignment) expect(Math.abs(offset)).toBeLessThan(1)
})
