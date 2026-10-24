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

  test('normal completion reveals pending text immediately while tail color settles', async ({ app, browser }) => {
    await app.open('/scripts/streaming-lifecycle-check.html')
    await expect(browser.locator('[data-text-index="0"]')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      const frame = () => new Promise(requestAnimationFrame)
      const root = () => document.querySelector('[data-text-index="0"]')!
      const text = '准备' + '正常结束继续显示已经收到的完整正文。'.repeat(70)
      const startedAt = performance.now()
      const remaining = () => Math.max(0, 5000 - (performance.now() - startedAt))
      const snapshot = () => ({ length: root().textContent!.length,
        received: Number(root().getAttribute('data-received-length')),
        message: root().getAttribute('data-message-status'),
        carets: root().querySelectorAll('[data-streaming-caret]').length,
        wrappers: root().querySelectorAll('[data-streaming-word]').length,
        fresh: root().querySelectorAll('[data-streaming-fresh="true"]').length })
      const step = (status: string) => window.dispatchEvent(new CustomEvent('streaming-lifecycle-step', { detail: { text, status, sync: status === 'complete' } }))
      // Observe the committed pending queue, before another animation frame can drain it.
      const completion = await new Promise<{ before: ReturnType<typeof snapshot>; terminal: ReturnType<typeof snapshot>; commitMs: number }>((resolve, reject) => {
        let before: ReturnType<typeof snapshot> | undefined, terminalAt = 0
        const observer = new MutationObserver(() => {
          const sample = snapshot()
          // The external-store runtime may publish after the parent flushSync.
          // Observe the first actual terminal commit, never wait for its text.
          if (before) {
            if (sample.message !== 'complete') return
            observer.disconnect()
            clearTimeout(timeout)
            resolve({ before, terminal: sample, commitMs: performance.now() - terminalAt })
            return
          }
          if (sample.message !== 'running' || sample.received !== text.length || sample.length <= 0 || sample.length >= text.length) return
          before = sample
          terminalAt = performance.now()
          step('complete')
        })
        const timeout = setTimeout(() => { observer.disconnect(); reject(new Error(before ? 'No terminal commit' : 'No committed pending queue before completion')) }, remaining())
        observer.observe(root(), { subtree: true, childList: true, characterData: true, attributes: true })
        step('running')
      })
      // Body completeness is checked at the terminal commit, before any rAF can
      // replay the old queue. Color exit is a separate, non-blocking lifetime.
      const samples: ReturnType<typeof snapshot>[] = [completion.terminal]
      do {
        const sample = snapshot()
        samples.push(sample)
        if (sample.wrappers === 0) break
        if (!remaining()) throw new Error('Terminal color did not settle')
        await frame()
      } while (samples.at(-1)?.wrappers !== 0)
      return { total: text.length, ...completion, samples, full: root().textContent === text }
    })
    console.log('Completion body and color', JSON.stringify(result))
    expect(result.before.message).toBe('running')
    expect(result.before.received).toBe(result.total)
    expect(result.before.length).toBeGreaterThan(0)
    expect(result.before.length).toBeLessThan(result.total)
    expect(result.samples.length).toBeGreaterThan(0)
    expect(result.samples.every(sample => sample.message === 'complete' && sample.received === result.total)).toBe(true)
    expect(result.terminal.message).toBe('complete')
    expect(result.terminal.length).toBe(result.total)
    expect(result.terminal.wrappers).toBeGreaterThan(0)
    expect(result.samples.every(sample => sample.length === result.total && sample.carets === 0 && sample.fresh === 0)).toBe(true)
    expect(result.samples.at(-1)?.wrappers).toBe(0)
    expect(result.full).toBe(true)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('streaming-lifecycle-step', { detail: { text: '历史正文', status: 'complete', id: 'history-message' } })))
    await expect(browser.locator('[data-text-index="0"]')).toHaveText('历史正文')
    await expect(browser.locator('[data-streaming-word]')).toHaveCount(0)
    await expect(browser.locator('[data-streaming-caret]')).toHaveCount(0)
    await app.screenshot('streaming-lifecycle-history')
  })
})
