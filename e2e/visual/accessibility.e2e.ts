import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

for (const theme of ['light', 'dark']) {
  test(`workbench text contrast and keyboard action (${theme})`, async ({ app, browser, screen }) => {
    await app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=${theme}`)
    await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible()
    const ratios = await browser.evaluate(() => {
      const style = getComputedStyle(document.documentElement)
      const context = document.createElement('canvas').getContext('2d')!
      const luminance = (token: string) => {
        context.fillStyle = style.getPropertyValue(token)
        context.fillRect(0, 0, 1, 1)
        const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
          const channel = value / 255
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
      }
      return [['--foreground', '--background'], ['--muted-foreground', '--background'], ['--muted-foreground', '--card'], ['--primary-foreground', '--primary']].map(([foreground, background]) => {
        const a = luminance(foreground), b = luminance(background)
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      })
    })
    for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5)
    await browser.locator('[data-workspace-view="agents"]').focus()
    await browser.keyboard.press('Enter')
    await expect(browser.locator('[data-ui-page="agents"]')).toBeVisible()
  })
}

test('admin shared components retain a readable usable shell', async ({ app, browser }) => {
  await app.open('/scripts/ui-experience-browser-check.html?admin=1&capture=1&theme=light')
  await expect(browser.locator('#admin-main h1')).toBeVisible()
  await expect(browser.locator('#admin-main [role="alert"]')).toHaveCount(0)
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot('admin-shared-components-light')
})
