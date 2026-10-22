import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { command, mixed } from './data'

test('390px real process disclosure stays framed and keyboard usable in light and dark themes', async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 390, height: 844 })
  await command('reset', { snapshot: mixed() })
  await app.open('/e2e/answer-first.html')
  const disclosure = browser.locator('[data-slot="run-activity"] > [data-slot="collapsible"] > button')
  for (const theme of ['light', 'dark']) {
    await browser.evaluate(theme => { document.documentElement.classList.toggle('dark', theme === 'dark'); return true }, theme)
    await expect(screen.getByText('这是始终可读的实质答复。', { exact: true })).toBeVisible()
    await disclosure.focus(); await disclosure.press('Space')
    await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    await expect(screen.getByText('合成执行计划', { exact: true })).toBeVisible()
    await expect(browser.locator('[data-slot="task-card"][data-task-id="task-parent"]')).toBeVisible()
    // A real wheel gesture tells the thread the user is reading above the end.
    await browser.mouse.move(180, 280); await browser.mouse.wheel(0, -10000)
    await expect(browser.locator('[data-chat-scroll-bottom]')).toBeVisible()
    await disclosure.focus()
    const measure = () => {
      const trigger = document.querySelector<HTMLElement>('[data-slot="run-activity"] > [data-slot="collapsible"] > button')!
      const rect = trigger.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right,
        viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
        focused: document.activeElement === trigger, expanded: trigger.getAttribute('aria-expanded') }
    }
    const before = await browser.evaluate(measure)
    expect(before.top).toBeGreaterThanOrEqual(0)
    expect(before.bottom).toBeLessThan(844)
    expect(before.left).toBeGreaterThanOrEqual(0)
    expect(before.right).toBeLessThanOrEqual(before.viewport)
    expect(before.overflow).toBe(false)
    expect(before.focused).toBe(true)
    expect(before.expanded).toBe('true')
    await app.screenshot(`answer-first-current-390-${theme}-real-expanded`)
    const after = await browser.evaluate(measure)
    expect(Math.abs(after.top - before.top)).toBeLessThan(2)
    expect(after.focused).toBe(true)
    await disclosure.press('Space')
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    await expect(screen.getByText('这是始终可读的实质答复。', { exact: true })).toBeVisible()
    await expect(screen.getByText('明确请求的查询成果', { exact: true })).toBeVisible()
    await expect(screen.getByText('正文最终引用', { exact: true })).toBeVisible()
    await app.screenshot(`answer-first-current-390-${theme}-body`)
  }
})
