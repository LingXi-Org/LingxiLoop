import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure cases: duplicate smooth owners freeze React; tool changes remount text;
// long CJK replies create thousands of DOM spans; commit loses the reveal queue.
// Same fixture server and E2E_STREAMING_FIXTURE gate as streaming-text.e2e.ts.
test.describe('Native streaming conversation', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming fixture server.' }),
}, () => {
  test('long native replies remain responsive through tool and final updates', async ({ app, browser }) => {
    await app.open('/e2e/native-streaming.html')
    await expect(browser.locator('input')).toHaveCount(1)
    const text = Array.from({ length: 70 }, (_, index) => `第 ${index + 1} 段：${'连续输出中文内容，页面仍可输入和滚动。'.repeat(8)}\n\n`).join('')
    const sample = await browser.evaluate(async text => {
      const lengths: number[] = [], intervals: number[] = []
      let last = performance.now()
      const timer = setInterval(() => { const now = performance.now(); intervals.push(now - last); last = now }, 25)
      window.dispatchEvent(new CustomEvent('native-streaming-step', { detail: { text, done: false } }))
      const start = performance.now()
      while (performance.now() - start < 2300) {
        await new Promise(requestAnimationFrame)
        lengths.push(document.querySelector('.im-markdown')?.textContent?.length ?? 0)
      }
      clearInterval(timer)
      return { distinct: new Set(lengths).size, maxBlock: Math.max(...intervals), spans: document.querySelectorAll('[data-streaming-word]').length }
    }, text)
    console.log(`Native streaming evidence: ${JSON.stringify(sample)}`)
    expect(sample.distinct).toBeGreaterThan(3)
    expect(sample.maxBlock).toBeLessThan(500)
    expect(sample.spans).toBe(0)
    await browser.locator('input').fill('页面仍然响应')
    await expect(browser.locator('.im-markdown')).toContainText('第 70 段')
    const minimum = await browser.evaluate(async text => {
      window.dispatchEvent(new CustomEvent('native-streaming-step', { detail: { text: text + '工具完成后继续输出。', tool: true } }))
      const lengths: number[] = []
      const start = performance.now()
      while (performance.now() - start < 800) {
        await new Promise(requestAnimationFrame)
        lengths.push(document.querySelector('.im-markdown')?.textContent?.length ?? 0)
      }
      return Math.min(...lengths)
    }, text)
    expect(minimum).toBeGreaterThan(text.length - 200)
    await browser.evaluate(text => window.dispatchEvent(new CustomEvent('native-streaming-step', { detail: { text: text + '工具完成后继续输出。最终答复。', tool: true, done: true } })), text)
    await expect(browser.locator('.im-markdown')).toContainText('最终答复。')
    await expect(browser.locator('.im-markdown-host[data-status="running"]')).toHaveCount(0)
    await expect(browser.locator('[role="alert"]')).toHaveCount(0)
    await app.screenshot('native-streaming-complete')
  })
})
