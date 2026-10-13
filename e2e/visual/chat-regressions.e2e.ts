import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: canvas moves the viewport edge; clock skew reverses the turn;
// receipts duplicate bubbles; timeout/replay erases text; retry revives old drafts.
for (const width of [1440, 390]) {
  test(`chat order, delivery, timeout recovery and canvas scrollbar (${width})`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 960 })
    await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=light&scenario=chat-regressions')
    if (width < 768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    const user = browser.locator('[data-msg-id="regression-user"]')
    const reply = browser.locator('[data-msg-id="run-regression"]')
    await expect(user).toBeVisible()
    await expect(browser.locator('[data-msg-id="regression-user"] [role="status"][aria-label="发送中"]')).toBeVisible()
    await expect(browser.locator('[data-msg-id="regression-user"] [data-message-footer] svg')).toHaveAttribute('class', /animate-spin/)
    const order = () => browser.evaluate(() => Array.from(document.querySelectorAll('[data-msg-id]')).slice(-2).map(node => node.getAttribute('data-msg-id')))
    expect(await order()).toEqual(['regression-user', 'run-regression'])
    await expect(browser.locator('[data-msg-id] time')).toHaveCount(0)
    await app.screenshot(`chat-pending-${width}`)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('chat-regression-step', { detail: 'delivered' })))
    await expect(browser.locator('[data-msg-id="regression-user"] [role="status"][aria-label="已送达"]')).toBeVisible()
    await expect(browser.locator('[data-msg-id="regression-user"] svg.lucide-check-check')).toHaveCount(1)
    expect(await order()).toEqual(['regression-user', 'run-regression'])
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('chat-regression-step', { detail: 'preview' })))
    await expect(reply).toContainText('第一段已显示。')
    await expect(reply).toContainText('第二段')
    const before = await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.getBoundingClientRect().right)
    await screen.getByRole('button', '打开画布预览').tap()
    await expect(screen.getByRole('button', '收起画布预览')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => {
      const viewport = document.querySelector('[data-chat-viewport]')!.getBoundingClientRect()
      return Math.abs(viewport.right - document.querySelector('.chat-pane')!.getBoundingClientRect().right)
    })).toBeLessThanOrEqual(1)
    expect(await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.getBoundingClientRect().right)).toBe(before)
    const geometry = await browser.evaluate(() => {
      const viewport = document.querySelector('[data-chat-viewport]')! as HTMLElement
      const user = document.querySelector('[data-msg-id="regression-user"]')!.getBoundingClientRect()
      const composer = document.querySelector('[data-composer-column]')!.getBoundingClientRect()
      return { scrolling: viewport.scrollHeight > viewport.clientHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        columnGap: Math.abs(user.right - composer.right + viewport.offsetWidth - viewport.clientWidth),
        reserved: viewport.getBoundingClientRect().right - user.right }
    })
    expect(geometry.scrolling).toBe(true)
    expect(geometry.overflow).toBe(false)
    expect(geometry.columnGap).toBeLessThanOrEqual(1)
    if (width >= 768) expect(geometry.reserved).toBeGreaterThanOrEqual(384)
    await app.screenshot(`chat-canvas-scrollbar-${width}`)
    await screen.getByRole('button', '收起画布预览').tap()
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('chat-regression-step', { detail: 'timeout' })))
    await expect(reply).toContainText('第一段已显示。')
    await expect(reply).toContainText('第二段')
    await expect(browser.locator('[data-msg-id="run-regression"] [role="alert"]')).toContainText('超时')
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('chat-regression-step', { detail: 'timeout' })))
    await expect(reply).toContainText('第一段已显示。')
    await expect(browser.locator('[data-msg-id="run-regression"]')).toHaveCount(1)
    expect(await order()).toEqual(['regression-user', 'run-regression'])
    await app.screenshot(`chat-timeout-preserved-${width}`)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('chat-regression-step', { detail: 'retry' })))
    await expect(reply).not.toContainText('第一段已显示。')
    await expect(browser.locator('[data-msg-id="run-regression"] [role="alert"]')).toHaveCount(0)
  })
}
