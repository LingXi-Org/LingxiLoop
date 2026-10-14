import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Serve with: node node_modules/vite/bin/vite.js --port 5196 --strictPort
// Run with E2E_STREAMING_FIXTURE=1 E2E_BASE_URL=http://127.0.0.1:5196:
// npm run test:e2e:web -- e2e/web/streaming-text.e2e.ts --output artifacts/streaming-fix
// Failure cases: bursts skip intermediate text; asynchronous Markdown strands blue spans;
// old blocks replay entry; completion/replacement leaves a cursor; code/table/citation
// boundaries move the tail; narrow screens overflow.
test.describe('Streaming renderer', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
  for (const theme of ['light', 'dark']) {
    test(`bursts reveal continuously and the tail settles (${theme})`, async ({ app, browser }) => {
      await browser.setViewport({ width: theme === 'dark' ? 390 : 1440, height: 960 })
      await app.open(`/scripts/streaming-browser-check.html?theme=${theme}`)
      await expect(browser.locator('#body')).toContainText('准备')
      const step = (text: string, done = false) => browser.evaluate(({ text, done }) => {
        return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done } }))
      }, { text, done })
      const burst = '准备' + '连续输出的中文内容需要逐步呈现而不是整段闪现。'.repeat(12)
      const samples = await browser.evaluate(async (text) => {
        window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: false } }))
        const lengths: number[] = []
        let entry = false
        const start = performance.now()
        while (performance.now() - start < 1800) {
          await new Promise(requestAnimationFrame)
          const root = document.querySelector('#body')!
          lengths.push(root.textContent!.length)
          entry ||= [...root.querySelectorAll('[data-sd-animate]')].some(word => getComputedStyle(word).animationName === 'sd-fadeIn')
        }
        return { lengths: [...new Set(lengths)], entry }
      }, burst)
      expect(samples.lengths.filter(length => length > 2 && length < burst.length).length).toBeGreaterThan(3)
      expect(samples.entry).toBe(true)
      console.log(`Streaming frame samples (${theme}): ${JSON.stringify(samples)}`)
      await expect(browser.locator('#body')).toHaveText(burst)
      await expect(browser.locator('[data-streaming-word]')).toHaveCount(0)
      await expect(browser.locator('.im-markdown[style*="--streamdown-caret"]')).toHaveCount(1)
      await app.screenshot(`streaming-burst-${theme}`)
      const markdown = `${burst}\n\n- **正在输出** [引用](#cite-S1)\n\n| 成员 | 角色 |\n| --- | --- |\n| 司南 | 协调 |\n\n尾部继续`
      await step(markdown)
      await expect(browser.locator('.im-markdown > :last-child')).toHaveText('尾部继续')
      await expect(browser.locator('#body table')).toHaveCount(1)
      await expect(browser.locator('#body [data-streamdown="strong"]')).toHaveText('正在输出')
      await app.screenshot(`streaming-markdown-${theme}`)
      await step(markdown + '\n\n```js\nconst value = 42\n')
      await expect(browser.locator('pre code')).toContainText('const value = 42')
      await step('已完成的正文。', true)
      await expect(browser.locator('#body')).toHaveText('已完成的正文。')
      await expect(browser.locator('.im-markdown[style*="--streamdown-caret"]')).toHaveCount(0)
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`streaming-complete-${theme}`)
    })
  }
  test('completion drains pending text and cancellation clears decoration', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toContainText('准备')
    const final = '准备' + '正常结束后不能丢失已经接收的正文。'.repeat(20)
    await browser.evaluate(text => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: true } }))
    }, final)
    await expect(browser.locator('#body')).toHaveText(final)
    await expect(browser.locator('.im-markdown[style*="--streamdown-caret"]')).toHaveCount(0)
    await browser.evaluate(() => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '新一轮正在输出'.repeat(30), done: false } }))
    })
    await expect(browser.locator('.im-markdown[style*="--streamdown-caret"]')).toHaveCount(1)
    await browser.evaluate(() => {
      return window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text: '已停止', done: false, cancelled: true } }))
    })
    await expect(browser.locator('#body')).toHaveText('已停止')
    await expect(browser.locator('.im-markdown[style*="--streamdown-caret"]')).toHaveCount(0)
    await app.screenshot('streaming-cancelled')
  })
  test('reduced motion preference bypasses the reveal queue', async ({ app, browser }) => {
    await browser.addInitScript(() => {
      const matchMedia = window.matchMedia.bind(window)
      window.matchMedia = query => {
        const media = matchMedia(query)
        if (query === '(prefers-reduced-motion: reduce)') Object.defineProperty(media, 'matches', { value: true })
        return media
      }
    })
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toContainText('准备')
    const text = '减少动态效果时直接显示正文。'.repeat(20)
    const rendered = await browser.evaluate(async text => {
      window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done: false } }))
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)
      return document.querySelector('#body')!.textContent
    }, text)
    expect(rendered).toBe(text)
    await app.screenshot('streaming-reduced-motion')
  })
})
