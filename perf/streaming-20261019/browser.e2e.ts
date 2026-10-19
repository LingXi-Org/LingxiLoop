import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { mkdir, writeFile } from 'node:fs/promises'

const runs = Number(process.env.PERF_RUNS ?? 10)
for (let pair = 0; pair < runs; pair++) for (const variant of ['base', 'candidate']) {
  test(`paint ${pair} ${variant}`, async ({ app, browser }) => {
    await browser.addInitScript(() => {
      const marks = { interactiveMs: 0, feedbackMs: 0, firstBodyMs: 0, completeMs: 0, longTaskMs: 0 }
      Object.assign(window, { __streamPerf: marks })
      new PerformanceObserver(list => { for (const entry of list.getEntries()) marks.longTaskMs += entry.duration }).observe({ type: 'longtask', buffered: true })
      const check = () => {
        if (document.querySelector('input')) marks.interactiveMs ||= performance.now()
        const start = performance.getEntriesByName('send')[0]?.startTime
        if (start !== undefined) {
          if (document.querySelector('.native-message-content')) marks.feedbackMs ||= performance.now() - start
          if (document.querySelector('.im-markdown')?.textContent?.length) marks.firstBodyMs ||= performance.now() - start
          const body = document.querySelector('.im-markdown')?.textContent ?? ''
          if ((body.match(/合成性能测试/g) ?? []).length === 40 && !document.querySelector('.im-markdown-host[data-status="running"]')) marks.completeMs ||= performance.now() - start
        }
        requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
    await app.open(`/perf/streaming-20261019/browser.html?variant=${variant}`)
    await browser.locator('input').fill('输入保持可用')
    await browser.locator('button').filter({ hasText: '发送合成流' }).tap()
    await expect(browser.locator('.im-markdown')).toContainText('合成性能测试')
    await expect(browser.locator('.im-markdown-host[data-status="running"]')).toHaveCount(0)
    await expect(browser.locator('[role="alert"]')).toHaveCount(0)
    // The exact synthetic answer contains 40 identical parts and no dropped text.
    const text = await browser.locator('.im-markdown').textContent() ?? ''
    expect((text.match(/合成性能测试/g) ?? []).length).toBe(40)
    await browser.locator('input').fill('流完成后仍可输入')
    const sample = await browser.evaluate(() => ({
      ...(window as unknown as { __streamPerf: { interactiveMs: number; feedbackMs: number; firstBodyMs: number; completeMs: number; longTaskMs: number } }).__streamPerf,
      requests: performance.getEntriesByType('resource').length,
      protocolRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/perf-api/')).length,
      heapBytes: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null,
    }))
    expect(sample.firstBodyMs).toBeGreaterThan(0)
    const output = process.env.PERF_WIDTH === '390' ? 'browser-mobile' : 'browser-results'
    await mkdir(output, { recursive: true })
    await writeFile(`${output}/${pair}-${variant}.json`, JSON.stringify({ pair, variant, ...sample, errors: 0 }) + '\n')
    if (pair === 0) {
      await browser.evaluate(() => document.fonts.ready.then(() => true))
      await app.screenshot(`stream-${variant}-${process.env.PERF_WIDTH ?? 1440}`)
    }
  })
}
