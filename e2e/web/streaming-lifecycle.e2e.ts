import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model is recorded before implementation in docs/evidence/issue-214/lifecycle.
test.describe('Streaming Text lifecycle', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
  for (const reason of ['cancelled', 'error'] as const) {
    test(`non-last Text immediately settles on ${reason}`, async ({ app, browser }) => {
      await app.open('/scripts/streaming-lifecycle-check.html')
      await expect(browser.locator('[data-text-index="0"]')).toHaveText('准备')
      const result = await browser.evaluate(async reason => {
        const frame = () => new Promise(requestAnimationFrame)
        const root = () => document.querySelector('[data-text-index="0"]')!
        const text = '准备' + '停止后不继续播放收到的正文。'.repeat(70)
        const step = (status: string) => window.dispatchEvent(new CustomEvent('streaming-lifecycle-step', { detail: { text, status, tool: true } }))
        step('running')
        let start = performance.now()
        while (performance.now() - start < 70) await frame()
        const before = root().textContent!.length
        step(reason)
        start = performance.now()
        while (root().getAttribute('data-message-status') !== 'incomplete') {
          if (performance.now() - start > 3000) throw new Error('Terminal message did not commit')
          await frame()
        }
        const samples: { length: number; carets: number; part: string | null }[] = []
        start = performance.now()
        do {
          samples.push({ length: root().textContent!.length, carets: root().querySelectorAll('[data-streaming-caret]').length, part: root().getAttribute('data-part-status') })
          await frame()
        } while (performance.now() - start < 250)
        return { before, total: text.length, samples }
      }, reason)
      console.log(`Terminal ${reason}`, JSON.stringify(result))
      expect(result.before).toBeLessThan(result.total)
      expect(result.samples.length).toBeGreaterThan(0)
      expect(result.samples.every(sample => sample.part === 'complete' && sample.length === result.total && sample.carets === 0)).toBe(true)
      await app.screenshot(`streaming-lifecycle-${reason}`)
    })
  }

  test('reduced motion settles this part without retraction and a new part can stream', async ({ app, browser }) => {
    await browser.addInitScript(() => {
      const original = window.matchMedia.bind(window)
      let reduced = false
      const media = new EventTarget()
      Object.defineProperties(media, { matches: { get: () => reduced }, media: { value: '(prefers-reduced-motion: reduce)' } })
      window.matchMedia = query => query === '(prefers-reduced-motion: reduce)' ? media as MediaQueryList : original(query)
      window.addEventListener('streaming-test-motion', event => { reduced = (event as CustomEvent<boolean>).detail; media.dispatchEvent(new Event('change')) })
    })
    await app.open('/scripts/streaming-lifecycle-check.html')
    await expect(browser.locator('[data-text-index="0"]')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      const frame = () => new Promise(requestAnimationFrame)
      const root = () => document.querySelector('[data-text-index="0"]')!
      const text = '准备' + '已经显示的正文不能再次收回。'.repeat(90)
      const step = (body: string, partId: string) => window.dispatchEvent(new CustomEvent('streaming-lifecycle-step', { detail: { text: body, status: 'running', partId } }))
      step(text, 'answer:1:0')
      let start = performance.now()
      while (performance.now() - start < 70) await frame()
      window.dispatchEvent(new CustomEvent('streaming-test-motion', { detail: true }))
      while (root().textContent !== text) {
        if (performance.now() - start > 3000) throw new Error('Reduced motion did not flush')
        await frame()
      }
      window.dispatchEvent(new CustomEvent('streaming-test-motion', { detail: false }))
      const lengths: number[] = []
      start = performance.now()
      do { await frame(); lengths.push(root().textContent!.length) } while (performance.now() - start < 250)
      const appended = text + '同一部分的新字也直接显示。'
      step(appended, 'answer:1:0')
      while (root().textContent !== appended) {
        if (performance.now() - start > 3000) throw new Error('Settled part append did not commit')
        await frame()
      }
      // Same message and slot, but a new explicit public part identity.
      const next = '新尝试' + '新的部分恢复公开 SDK 平滑显示。'.repeat(60)
      step(next, 'answer:2:0')
      const nextLengths: number[] = []
      start = performance.now()
      do { await frame(); if (root().textContent !== appended) nextLengths.push(root().textContent!.length) }
      while (root().textContent !== next && performance.now() - start < 5000)
      return { total: text.length, lengths, nextTotal: next.length, nextLengths, final: root().textContent, expected: next }
    })
    console.log('Motion lifecycle', JSON.stringify({ ...result, final: undefined, expected: undefined }))
    expect(result.lengths.length).toBeGreaterThan(0)
    expect(result.lengths.every(length => length === result.total)).toBe(true)
    expect(result.nextLengths.some(length => length > 0 && length < result.nextTotal)).toBe(true)
    expect(result.final).toBe(result.expected)
    await app.screenshot('streaming-lifecycle-motion')
  })

  test('normal completion drains pending text and replaced history stays static', async ({ app, browser }) => {
    await app.open('/scripts/streaming-lifecycle-check.html')
    await expect(browser.locator('[data-text-index="0"]')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      const frame = () => new Promise(requestAnimationFrame)
      const root = () => document.querySelector('[data-text-index="0"]')!
      const text = '准备' + '正常结束继续显示已经收到的完整正文。'.repeat(70)
      const step = (status: string) => window.dispatchEvent(new CustomEvent('streaming-lifecycle-step', { detail: { text, status } }))
      step('running')
      let start = performance.now()
      while (performance.now() - start < 70) await frame()
      step('complete')
      start = performance.now()
      const samples: number[] = []
      while (root().textContent !== text) {
        if (performance.now() - start > 5000) throw new Error('Completion did not drain')
        await frame()
        if (root().getAttribute('data-message-status') === 'complete') samples.push(root().textContent!.length)
      }
      return { total: text.length, samples, carets: root().querySelectorAll('[data-streaming-caret]').length }
    })
    console.log('Completion drain', JSON.stringify(result))
    expect(result.samples.some(length => length > 0 && length < result.total)).toBe(true)
    expect(result.carets).toBe(0)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('streaming-lifecycle-step', { detail: { text: '历史正文', status: 'complete', id: 'history-message' } })))
    await expect(browser.locator('[data-text-index="0"]')).toHaveText('历史正文')
    await expect(browser.locator('[data-streaming-word]')).toHaveCount(0)
    await expect(browser.locator('[data-streaming-caret]')).toHaveCount(0)
    await app.screenshot('streaming-lifecycle-history')
  })
})
