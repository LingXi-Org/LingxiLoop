import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: global button colors override bubbles; Markdown or delivery
// status becomes unreadable; dark mode or mobile misses the same palette.
for (const theme of ['light', 'dark']) {
  for (const width of [1440, 390]) {
    test(`conversation bubble colors (${theme}, ${width})`, async ({ app, browser }) => {
      await browser.setViewport({ width, height: 960 })
      await app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=${theme}&scenario=chat-bubble-colors`)
      if (width < 768) await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
      await expect(browser.locator('[data-message-bubble="user"]')).toBeVisible()
      await expect(browser.locator('[data-message-bubble="human"]')).toBeVisible()
      await expect(browser.locator('html')).toHaveAttribute('data-theme', theme)
      const colors = await browser.evaluate(() => {
        const style = (selector: string) => {
          const element = document.querySelector(selector)
          if (!element) throw new Error(`Missing color sample: ${selector}`)
          return getComputedStyle(element)
        }
        return ['user', 'human'].map(kind => {
          const selector = `[data-message-bubble="${kind}"]`
          return { background: style(selector).backgroundColor, text: style(selector).color,
            paragraph: style(`${selector} p`).color, strong: style(`${selector} [data-streamdown="strong"]`).color,
            link: style(`${selector} [data-streamdown="link"]`).color, quote: style(`${selector} blockquote`).color,
            footer: kind === 'user' ? style(`${selector} [data-message-footer]`).color : null }
        })
      })
      const text = theme === 'light' ? 'rgb(17, 27, 33)' : 'rgb(233, 237, 239)'
      expect(colors).toEqual((theme === 'light'
        ? ['rgb(217, 253, 211)', 'rgb(255, 255, 255)']
        : ['rgb(0, 92, 75)', 'rgb(32, 44, 51)']).map((background, index) => ({ background, text, paragraph: text, strong: text,
          link: text, quote: theme === 'light' ? 'rgb(82, 102, 107)' : 'rgb(195, 209, 215)',
          footer: index === 0 ? theme === 'light' ? 'rgb(82, 102, 107)' : 'rgb(195, 209, 215)' : null })))
      expect(await browser.evaluate(() => getComputedStyle(document.querySelector('[data-agent-body]')!).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`chat-bubble-colors-${theme}-${width}`)
    })
  }
}
