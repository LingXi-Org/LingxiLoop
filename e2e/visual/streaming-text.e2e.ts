import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: the whole answer shimmers; old words stay blue; Chinese has no
// word boundaries; Markdown/citations break; stop leaves a caret; mobile wraps it away.
for (const theme of ['light', 'dark']) {
  test(`streaming tail follows the latest text (${theme})`, async ({ app, browser }) => {
    await browser.setViewport({ width: theme === 'dark' ? 390 : 1440, height: 960 })
    await app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&theme=${theme}&scenario=streaming-text`)
    if (theme === 'dark') await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    const root = browser.locator('[data-msg-id="streaming-preview"]')
    await expect(root).toBeVisible()
    const step = (text: string, done = false) => browser.evaluate(({ text, done }) => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done } }))
    }, { text, done })
    await step('Here is what changed in the latest release: the composer now')
    await expect(root).toContainText('the composer now')
    await expect(browser.locator('[data-streaming-fresh]')).toHaveCount(0)
    await expect(browser.locator('[data-streaming-cursor]')).toHaveText('now')
    await app.screenshot(`streaming-tail-${theme}`)
    await step('Here is what changed in the latest release: the composer now restores drafts')
    await expect(browser.locator('[data-streaming-cursor]')).toHaveText('drafts')
    await expect.poll(() => browser.evaluate(() => {
      const words = [...document.querySelectorAll('[data-streaming-word]')]
      const old = words.find(word => word.textContent === 'now')!
      return getComputedStyle(old).color === getComputedStyle(words[0]).color
    })).toBe(true)
    await step('第一段已经显示。\n\n- **正在输出** [引用](#cite-S1)\n- 使用 `useAuiState` 展示当前位置')
    await expect(root).toContainText('展示当前位置')
    await expect(browser.locator('[data-msg-id="streaming-preview"] ul')).toHaveCount(1)
    await expect(browser.locator('[data-msg-id="streaming-preview"] code')).toHaveText('useAuiState')
    await expect(browser.locator('[data-streaming-cursor]')).toHaveText('置')
    await expect(browser.locator('[data-streaming-fresh]')).toHaveCount(0)
    const styles = await browser.evaluate(() => {
      const tail = document.querySelector('[data-streaming-cursor]')!
      return { width: getComputedStyle(tail, '::after').width,
        pulse: getComputedStyle(tail, '::after').animationName,
        transition: getComputedStyle(tail).transitionDuration,
        overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(styles).toEqual({ width: '2px', pulse: 'streaming-tail-pulse', transition: '0.7s', overflow: false })
    await app.screenshot(`streaming-markdown-${theme}`)
    await step('```js\nconst value = 1\n')
    await expect(browser.locator('[data-streaming-cursor]')).toContainText('const value = 1')
    await app.screenshot(`streaming-code-${theme}`)
    await step('已完成的正文。', true)
    await expect(root).toContainText('已完成的正文。')
    await expect(browser.locator('[data-streaming-cursor]')).toHaveCount(0)
    await expect(browser.locator('[data-streaming-fresh]')).toHaveCount(0)
    await app.screenshot(`streaming-complete-${theme}`)
  })
}
