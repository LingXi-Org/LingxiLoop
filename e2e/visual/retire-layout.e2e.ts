import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure modes: centered rows retain wide gutters; body stretches; drawer or mobile
// overflows; legacy mail/calendar cards still offer approval or navigation.
for (const width of [1920, 1440, 1024, 767, 390]) {
  test(`conversation edges and readable bodies (${width})`, async ({ app, browser }) => {
    await browser.setViewport({ width, height: 960 })
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=chat-bubble-colors')
    if (width < 768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    await expect(browser.locator('[data-msg-id="bubble-me"]')).toBeVisible()
    const layout = await browser.evaluate(() => {
      const rect = (selector: string) => {
        const bounds = document.querySelector(selector)!.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right, width: bounds.width }
      }
      return { column: rect('[data-chat-message-column]'), row: rect('[data-msg-id="bubble-me"]'),
        left: rect('[data-message-bubble="human"]'), right: rect('[data-message-bubble="user"]'),
        overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(layout.overflow).toBe(false)
    expect(layout.left.width).toBeLessThanOrEqual(800)
    expect(layout.right.width).toBeLessThanOrEqual(800)
    if (process.env.E2E_LAYOUT_PHASE !== 'before') {
      expect(Math.abs(layout.row.left - layout.column.left)).toBeLessThan(2)
      expect(Math.abs(layout.row.right - layout.column.right)).toBeLessThan(2)
      expect(layout.left.left - layout.column.left).toBeLessThan(75)
      expect(layout.column.right - layout.right.right).toBeLessThan(75)
    }
    await app.screenshot(`conversation-edges-${width}`)
  })
}

for (const width of [1440,390]) {
  test(`retired history stays readable without actions (${width})`, async ({ app, browser, screen }) => {
    if (process.env.E2E_LAYOUT_PHASE === 'before') return
    await browser.setViewport({width,height:960})
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=retired-history')
    if (width < 768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    await expect(screen.getByText('历史邮件标题',{exact:true})).toBeVisible()
    await expect(screen.getByText('历史邮件正文',{exact:true})).toBeVisible()
    await expect(browser.locator('[data-msg-id="retired-history"]')).toContainText('历史日程标题')
    await expect(browser.locator('[data-msg-id="retired-history"]')).toContainText('此记录仅供查看')
    await expect(browser.locator('[data-msg-id="retired-history"]')).toContainText('此审批已不可执行')
    await expect(browser.locator('[data-msg-id="retired-history"] [data-native-part="tool-call"] button, [data-msg-id="retired-history"] [data-native-part="generative-ui"] button')).toHaveCount(0)
    await app.screenshot(`retired-history-${width}`)
  })
}

for (const width of [1440,767,390]) {
  test(`rich message and detail drawer fit (${width})`, async ({ app,browser,screen }) => {
    if (process.env.E2E_LAYOUT_PHASE === 'before') return
    await browser.setViewport({width,height:960})
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=layout-rich')
    if (width < 768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    await expect(browser.locator('[data-msg-id="layout-rich"]')).toBeVisible()
    await expect(browser.locator('[data-msg-id="layout-rich"] pre')).toBeVisible()
    await expect(browser.locator('[data-msg-id="layout-rich"] [data-native-part="image"] img')).toBeVisible()
    expect(await browser.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await app.screenshot(`rich-message-${width}`)
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=layout-rich&drawer=1')
    await expect(screen.getByRole('dialog')).toBeVisible()
    expect(await browser.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await app.screenshot(`conversation-detail-${width}`)
    await browser.keyboard.press('Escape')
    await expect(screen.getByRole('dialog')).toHaveCount(0)
  })
}
