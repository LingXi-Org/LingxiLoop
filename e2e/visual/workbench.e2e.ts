import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Synthetic, credential-free fixtures of the production components. Real API
// workflows are covered separately by e2e/web and retain secret protection.
for (const theme of ['dark', 'light']) {
  test(`workbench surfaces and readable conversation column (${theme})`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 1440, height: 960 })
    await app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=${theme}`)
    await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible()
    await expect(browser.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(browser.locator('[data-msg-id]').first()).toBeVisible()
    await browser.evaluate(async () => { await document.fonts.ready; return null })
    const geometry = await browser.evaluate(() => {
      const width = (selector: string) => document.querySelector(selector)!.getBoundingClientRect().width
      return { rail: width('.server-rail'), list: width('[data-slot="sidebar"]'), message: width('[data-msg-id]'), composer: width('[data-composer-column]'), overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(geometry.rail).toBe(64)
    expect(Math.abs(geometry.list - 300)).toBeLessThanOrEqual(1)
    expect(geometry.message).toBeLessThanOrEqual(801)
    expect(geometry.composer).toBeLessThanOrEqual(801)
    expect(Math.abs(geometry.message - geometry.composer)).toBeLessThanOrEqual(1)
    expect(geometry.overflow).toBe(false)
    const selectedColor = await browser.evaluate(() => {
      const selected = document.querySelector('[data-slot="sidebar"] [aria-current="page"]')!
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')!
      context.fillStyle = getComputedStyle(selected).backgroundColor
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    })
    expect(selectedColor[1]).toBeGreaterThan(selectedColor[0])
    expect(selectedColor[1]).toBeGreaterThan(selectedColor[2])
    await app.screenshot(`chat-1440-${theme}`)
    for (const [name, view] of [['Agent', 'agents'], ['邮件', 'mail'], ['学习概览', 'learning'], ['资料', 'library']]) {
      await screen.getByRole('navigation', '工作区与功能').getByRole('button', name).tap()
      await expect(browser.locator(`[data-ui-page="${view}"]`)).toBeVisible()
      await expect(browser.locator(`[data-ui-page="${view}"] [aria-busy="true"], [data-ui-page="${view}"] [data-skeleton-region]`)).toHaveCount(0)
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`${view}-1440-${theme}`)
      if (view === 'mail') {
        await screen.getByRole('button').filter({ hasText: '本地邮件标题' }).tap()
        const contrast = await browser.evaluate(() => {
          const style = getComputedStyle(document.querySelector('[data-page="mail"] button[aria-current="page"]')!)
          const context = document.createElement('canvas').getContext('2d')!
          const luminance = (color: string) => {
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
            const rgb = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3).map(value => {
              const channel = value / 255
              return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
            })
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
          }
          const a = luminance(style.color), b = luminance(style.backgroundColor)
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
        })
        expect(contrast).toBeGreaterThanOrEqual(4.5)
        await app.screenshot(`mail-selected-1440-${theme}`)
      }
    }
    await screen.getByRole('button', '打开账户菜单').tap()
    await screen.getByRole('menuitem', '设置').tap()
    await expect(screen.getByRole('dialog', 'LingxiLoop 设置')).toBeVisible()
    await screen.getByRole('button', '外观与声音').tap()
    await expect(screen.getByRole('combobox', '主题')).toBeVisible()
    await app.screenshot(`settings-1440-${theme}`)
    await browser.keyboard.press('Escape')
    await expect(screen.getByRole('button', '打开账户菜单')).toBeFocused()
    await app.open(`/scripts/ui-experience-browser-check.html?surface=教师概览&capture=1&theme=${theme}`)
    await expect(browser.locator('[data-testid="teacher-overview-dashboard"]')).toBeVisible()
    await expect(browser.locator('[aria-busy="true"], [data-skeleton-region]')).toHaveCount(0)
    await app.screenshot(`teacher-1440-${theme}`)
  })
}

test('wide chat, narrow desktop and mobile preserve layout and actions', async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 2560, height: 1440 })
  await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=dark&long=1')
  await expect(browser.locator('[data-msg-id]').first()).toBeVisible()
  expect(await browser.evaluate(() => document.querySelector('[data-msg-id]')!.getBoundingClientRect().width)).toBeLessThanOrEqual(801)
  await app.screenshot('chat-2560-dark')
  await browser.setViewport({ width: 1366, height: 768 })
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(screen.getByRole('button', '发送')).toBeVisible()
  await app.screenshot('chat-long-title-1366-dark')
  await browser.setViewport({ width: 390, height: 844 })
  await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light')
  await expect(screen.getByLabel('搜索会话和消息')).toBeVisible()
  await app.screenshot('conversation-list-390-light')
  await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
  await expect(screen.getByRole('button', '返回会话列表')).toBeVisible()
  await expect(screen.getByRole('button', '发送')).toBeVisible()
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot('chat-390-light')
  await screen.getByRole('button', '返回会话列表').tap()
  await expect(screen.getByLabel('搜索会话和消息')).toBeVisible()
  await screen.getByRole('button', '打开账户菜单').tap()
  await screen.getByRole('menuitem', '设置').tap()
  await screen.getByRole('tab', '外观与声音').tap()
  await expect(screen.getByRole('combobox', '主题')).toBeVisible()
  await app.screenshot('settings-390-light')
  await screen.getByRole('button', '关闭设置').tap()
  await expect(screen.getByRole('button', '打开账户菜单')).toBeFocused()
})
