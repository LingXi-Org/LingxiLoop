import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Actual owning components with synthetic public data. Counts DOM operations,
// not user-device FPS. The iframe checks PartFrame descendant identity, not the
// GenUI bridge/authorization implementation (which this change does not touch).
test.describe('Question geometry and retained trace lifecycle', {
  ...(process.env.E2E_LAYOUT_FIXTURE === '1' ? {} : { skip: 'Requires the isolated layout fixture.' }),
}, () => {
  test('tail growth keeps reading decisions and iframe identity while hidden trace clocks stop', async ({ app, browser }) => {
    await app.open('/e2e/layout-performance/index.html')
    await expect(browser.locator('[data-slot="conversation-map-tick"]')).toHaveCount(256)
    const result = await browser.evaluate(async () => {
      const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const settle = async () => { await frame(); await frame(); await frame() }
      const wait = async (check: () => boolean) => {
        const start = performance.now()
        while (!check()) { if (performance.now() - start > 10000) throw Error('Layout fixture did not settle'); await frame() }
        await settle()
      }
      const viewport = document.querySelector<HTMLElement>('#question-viewport')!
      const active = () => document.querySelector('[data-slot="conversation-map-tick"][data-active]')?.getAttribute('aria-label')
      const reference = () => {
        const bounds = viewport.getBoundingClientRect()
        const questions = [...viewport.querySelectorAll<HTMLElement>('[data-msg-id^="question-"]')]
        let selected = questions[0]!
        for (const question of questions) if (question.getBoundingClientRect().top <= bounds.top + 24) selected = question
        if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop <= 1) selected = questions.at(-1)!
        return selected.textContent
      }
      const target = viewport.querySelector<HTMLElement>('[data-msg-id="question-128"]')!
      viewport.scrollTop += target.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 12
      await wait(() => active() === reference())
      const expectedActive = active()
      const range = document.createRange()
      range.selectNodeContents(target.querySelector('p')!)
      const selection = getSelection()!
      selection.removeAllRanges(); selection.addRange(range)
      const selectedText = selection.toString()
      const iframe = document.querySelector('iframe')!
      await wait(() => iframe.dataset.loaded === 'true')
      const frameWindow = iframe.contentWindow
      let reloads = 0
      iframe.addEventListener('load', () => reloads++)
      let geometryReads = 0, queries = 0
      const rect = Element.prototype.getBoundingClientRect
      const query = viewport.querySelector
      Element.prototype.getBoundingClientRect = function () {
        if (this.getAttribute('data-msg-id')?.startsWith('question-')) geometryReads++
        return rect.call(this)
      }
      viewport.querySelector = function <E extends Element = Element>(selector: string): E | null {
        if (selector.startsWith('[data-msg-id=')) queries++
        return query.call(this, selector) as E | null
      }
      const perStep: number[] = []
      try {
        for (let step = 1; step <= 20; step++) {
          const before = geometryReads
          window.dispatchEvent(new CustomEvent('layout-step', { detail: step }))
          await wait(() => document.querySelector('main')!.dataset.step === String(step))
          perStep.push(geometryReads - before)
        }
      } finally {
        Element.prototype.getBoundingClientRect = rect
        viewport.querySelector = query
      }
      if (active() !== expectedActive || selection.toString() !== selectedText) throw Error('Tail growth changed the reading choice/selection')
      if (document.querySelector('iframe') !== iframe || iframe.contentWindow !== frameWindow || reloads) throw Error('Same-source iframe remounted')
      // Reflow above the viewport is read fresh, without re-registering stable roots.
      viewport.querySelector<HTMLElement>('[data-msg-id="question-0"]')!.style.minHeight = '300px'
      await wait(() => active() === reference())
      window.dispatchEvent(new CustomEvent('layout-step', { detail: 'prepend' }))
      await wait(() => document.querySelectorAll('[data-slot="conversation-map-tick"]').length === 257 && active() === reference())
      viewport.scrollTop = viewport.scrollHeight
      await wait(() => active() === 'Question 255')
      viewport.scrollTop = 0
      await wait(() => active() === 'Question -1')
      const trace = document.querySelector('[data-slot="trace-waterfall"]')!
      const clock = trace.querySelector('[data-trace-clock]')!
      const sample = async () => {
        await settle()
        await new Promise(resolve => setTimeout(resolve, 120))
        const start = clock.textContent
        await new Promise(resolve => setTimeout(resolve, 350))
        return start !== clock.textContent
      }
      const closedChanges = await sample()
      const details = document.querySelector<HTMLDetailsElement>('[data-slot="run-activity-details"]')!
      details.open = true
      await wait(() => trace.getBoundingClientRect().height > 100)
      const openChanges = await sample()
      const filter = [...trace.querySelectorAll<HTMLButtonElement>('[aria-pressed]')].find(button => button.textContent?.startsWith('工具'))!
      filter.click()
      await wait(() => filter.getAttribute('aria-pressed') === 'true')
      const surface = document.querySelector<HTMLElement>('#trace-surface')!
      surface.style.marginTop = '2000px'
      const offscreenChanges = await sample()
      surface.style.marginTop = ''
      const returnedChanges = await sample()
      const sameTrace = document.querySelector('[data-slot="trace-waterfall"]') === trace
      const filterRetained = filter.getAttribute('aria-pressed') === 'true'
      details.open = false
      const reclosedChanges = await sample()
      selection.removeAllRanges()
      return { questionCount: 257, geometryReads, queries, maxReadsPerStep: Math.max(...perStep), perStep,
        iframeRetained: document.querySelector('iframe') === iframe && iframe.contentWindow === frameWindow,
        iframeReloads: reloads, selectedText, closedChanges, openChanges, offscreenChanges, returnedChanges, reclosedChanges, sameTrace, filterRetained }
    })
    console.log('LAYOUT_OPERATION_EVIDENCE', JSON.stringify(result))
    expect(result.geometryReads).toBeGreaterThan(0)
    expect(result.maxReadsPerStep).toBeLessThanOrEqual(64)
    expect(result.queries).toBe(0)
    expect(result.iframeRetained).toBe(true)
    expect(result.iframeReloads).toBe(0)
    expect(result.selectedText).toBe('Question 128')
    expect(result.closedChanges).toBe(false)
    expect(result.openChanges).toBe(true)
    expect(result.offscreenChanges).toBe(false)
    expect(result.returnedChanges).toBe(true)
    expect(result.reclosedChanges).toBe(false)
    expect(result.sameTrace).toBe(true)
    expect(result.filterRetained).toBe(true)
    await app.screenshot('layout-reading-and-trace')
  })
})
