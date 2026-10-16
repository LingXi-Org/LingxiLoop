import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

for (const [count, width] of [[8, 1440], [320, 1440]] as const) {
  test(`official map preserves separated rows and reachable history (${count} turns, ${width}px)`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 640 })
    await app.open(`/e2e/question-index/index.html?turns=${count}&theme=dark`)
    const markers = browser.locator('[data-slot="conversation-map-tick"]')
    await expect(markers).toHaveCount(count)
    const middle = Math.floor(count / 2)
    const target = browser.locator(`[data-slot="conversation-map-tick"][aria-label^="第${middle}次提问"]`)
    await target.focus()
    await target.hover()
    await expect(browser.locator('[data-base-ui-portal]')).toContainText(`第${middle}次提问`)
    await app.screenshot(`question-index-spacing-${count}-${width}`)
    const spacing = await browser.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-slot="conversation-map-tick"]')].map(element => element.getBoundingClientRect())
      const bars = [...document.querySelectorAll('[data-slot="conversation-map-tick"] span')].map(element => element.getBoundingClientRect())
      return {
        hitGap: Math.min(...rows.slice(1).map((row, index) => row.top - rows[index].bottom)),
        barGap: Math.min(...bars.slice(1).map((bar, index) => bar.top - bars[index].bottom)),
        height: Math.min(...rows.map(row => row.height)),
      }
    })
    expect(spacing.hitGap).toBeGreaterThanOrEqual(-0.1)
    expect(spacing.barGap).toBeGreaterThanOrEqual(8)
    expect(spacing.height).toBeGreaterThanOrEqual(12)
    const before = await browser.evaluate(() => [...document.querySelectorAll('[data-slot="conversation-map-tick"]')].map(element => element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top))
    await screen.getByRole('button', '历史提问', { exact: true }).hover()
    await expect.poll(() => browser.evaluate(() => document.querySelector('[data-base-ui-portal]') === null)).toBe(true)
    // Compare positions within the rail: native focus can scroll its container.
    await target.press('Tab')
    await screen.getByRole('button', '历史提问', { exact: true }).focus()
    await expect.poll(() => browser.evaluate(() => Math.max(...[...document.querySelectorAll('[data-slot="conversation-map-tick"] span')].map(element => element.getBoundingClientRect().width)))).toBeLessThan(13)
    expect(await browser.evaluate(() => [...document.querySelectorAll('[data-slot="conversation-map-tick"]')].map(element => element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top))).toEqual(before)
    await target.focus()
    await target.press('Home')
    const first = browser.locator('[data-slot="conversation-map-tick"][aria-label^="第1次提问"]')
    await expect(first).toBeFocused()
    await first.press('Enter')
    await expect(first).toHaveAttribute('aria-current', 'true')
    await expect.poll(() => browser.evaluate(() => Math.abs(document.querySelector('[data-msg-id="q-1"]')!.getBoundingClientRect().top - document.querySelector('[data-chat-viewport]')!.getBoundingClientRect().top - 16))).toBeLessThan(2)
    if (count > 8) {
      const beforeWheel = await browser.evaluate(() => {
        const rail = document.querySelector('[data-question-index-scroll]')!
        const box = rail.getBoundingClientRect()
        return { rail: rail.scrollTop, conversation: document.querySelector('[data-chat-viewport]')!.scrollTop, x: box.left + 10, y: box.top + 100 }
      })
      await browser.mouse.move(beforeWheel.x, beforeWheel.y)
      await browser.mouse.wheel(0, 240)
      await expect.poll(() => browser.evaluate(() => document.querySelector('[data-question-index-scroll]')!.scrollTop)).toBeGreaterThan(beforeWheel.rail)
      expect(await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)).toBe(beforeWheel.conversation)
    }
    await first.press('End')
    const last = browser.locator(`[data-slot="conversation-map-tick"][aria-label^="第${count}次提问"]`)
    await expect(last).toBeFocused()
    await last.press('Space')
    await expect(last).toHaveAttribute('aria-current', 'true')
    await expect.poll(() => browser.evaluate(() => {
      const marker = document.querySelector('[data-slot="conversation-map-tick"][aria-current="true"]')!
      const viewport = marker.parentElement!.parentElement!.getBoundingClientRect(), rect = marker.getBoundingClientRect()
      return rect.top >= viewport.top && rect.bottom <= viewport.bottom
    })).toBe(true)
    await app.screenshot(`question-index-spacing-last-${count}-${width}`)
    await screen.getByRole('button', '历史提问', { exact: true }).focus()
    await browser.evaluate((index) => {
      const viewport = document.querySelector('[data-chat-viewport]')! as HTMLElement
      viewport.scrollTop += document.querySelector(`[data-msg-id="q-${index}"]`)!.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16
      return true
    }, middle)
    await expect(target).toHaveAttribute('aria-current', 'true')
    await expect.poll(() => browser.evaluate(() => {
      const rect = document.querySelector('[data-slot="conversation-map-tick"][aria-current="true"]')!.getBoundingClientRect()
      const viewport = document.querySelector('[data-question-index-scroll]')!.getBoundingClientRect()
      return rect.top >= viewport.top && rect.bottom <= viewport.bottom
    })).toBe(true)
  })
}
