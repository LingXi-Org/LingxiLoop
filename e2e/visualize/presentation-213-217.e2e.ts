import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: clipping creates a scroll container, toolbar falls outside the
// rounded card, focus cannot reveal it, preview changes state or retry breaks.
for (const width of [1440, 390]) test(`rounded visualization and top toolbar (${width})`, async ({ app, browser, screen }) => {
  await browser.setViewport({ width, height: 960 })
  await app.open('/e2e/visualize/index.html?implementation=product&theme=light&failOnce=1')
  await expect(screen.getByText('无法加载交互视图', { exact: true })).toBeVisible()
  await app.screenshot(`error-${width}`)
  await screen.getByRole('button', '重试', { exact: true }).tap()
  await expect(browser.locator('[data-testid="gen-ui-card"]')).toHaveAttribute('data-gen-ui-phase', 'ready')
  const guest = browser.frameLocator('iframe[data-visualize-guest]:visible').frameLocator('iframe[data-visualize-content]')
  await guest.locator('#fixture-play').tap()
  await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
  await screen.getByRole('button', '复制图像', { exact: true }).focus()
  await expect.poll(() => browser.evaluate(() => getComputedStyle(document.querySelector('[data-testid="gen-ui-actions"]')!).opacity)).toBe('1')
  const geometry = await browser.evaluate(() => {
    const card = document.querySelector('[data-testid="gen-ui-card"]')!.firstElementChild!
    const toolbar = document.querySelector('[data-testid="gen-ui-actions"]')!
    const rect = card.getBoundingClientRect(), controls = toolbar.getBoundingClientRect(), css = getComputedStyle(card)
    return { radius: css.borderRadius, overflow: css.overflow, scrollTop: card.scrollTop, top: controls.top - rect.top, right: rect.right - controls.right, width: rect.width, controlsWidth: controls.width, documentWidth: document.documentElement.scrollWidth, viewport: innerWidth }
  })
  if (process.env.E2E_CAPTURE_BASELINE !== '1') {
    expect(parseFloat(geometry.radius)).toBeGreaterThan(0)
    expect(geometry.overflow).toBe('clip')
    expect(geometry.top).toBeGreaterThanOrEqual(0)
    expect(geometry.top).toBeLessThan(10)
    expect(geometry.right).toBeGreaterThanOrEqual(0)
    expect(geometry.right).toBeLessThan(10)
  }
  expect(geometry.controlsWidth).toBeLessThan(geometry.width)
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewport)
  await app.screenshot(`toolbar-focus-${width}`)
  await screen.getByRole('button', '放大', { exact: true }).focus()
  await browser.keyboard.press('Enter')
  await expect(screen.getByRole('dialog')).toBeVisible()
  await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
  await app.screenshot(`expanded-${width}`)
  await screen.getByRole('button', '收起', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toHaveCount(0)
  await expect(guest.locator('#fixture-play-label')).toHaveText('Play')
  await app.screenshot(`collapsed-${width}`)
  const output = process.env.E2E_VISUALIZE_OUTPUT ?? '.e2e/visualize-presentation'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/presentation-${width}.json`, JSON.stringify(geometry, null, 2))
})
