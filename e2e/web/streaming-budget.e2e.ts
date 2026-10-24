import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Owning opt-in behavior check on the existing production renderer fixture.
// Measures structure/selection/lifecycle, not user-device frame-time budgets.
test.describe('Bounded streaming animation', {
  ...(process.env.E2E_STREAMING_FIXTURE === '1' ? {} : { skip: 'Requires the streaming renderer fixture server.' }),
}, () => {
  test('long Chinese text keeps bounded wrappers, selection and complete text', async ({ app, browser }) => {
    await app.open('/scripts/streaming-browser-check.html')
    await expect(browser.locator('#body')).toHaveText('准备')
    const result = await browser.evaluate(async () => {
      const body = document.querySelector('#body')!
      const text = '中文流式正文'.repeat(1700)
      const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      const step = (text: string, done = false) => window.dispatchEvent(new CustomEvent('streaming-text-step', { detail: { text, done } }))
      const wait = async (predicate: () => boolean) => {
        const start = performance.now()
        while (!predicate()) {
          if (performance.now() - start > 15_000) throw new Error('Streaming content did not settle')
          await frame()
        }
        await frame(); await frame()
      }
      step(text)
      await wait(() => body.textContent === text)
      const wrappers = body.querySelectorAll('[data-streaming-word]').length
      const fresh = body.querySelectorAll('[data-streaming-fresh="true"]').length
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT)
      let node = walker.nextNode()
      while (node && (node.textContent?.length ?? 0) < 100) node = walker.nextNode()
      if (!node) throw new Error('No static readable prefix')
      const range = document.createRange()
      range.setStart(node, 10); range.setEnd(node, 40)
      const selection = window.getSelection()!
      selection.removeAllRanges(); selection.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
      await frame(); await frame()
      const selected = selection.toString()
      const next = text + '新的尾部'
      step(next)
      await wait(() => body.textContent === next)
      const selectedAfter = selection.toString()
      step(next, true)
      await wait(() => body.querySelectorAll('[data-streaming-caret]').length === 0)
      const completeText = body.textContent
      selection.removeAllRanges(); document.dispatchEvent(new Event('selectionchange'))
      await wait(() => body.querySelectorAll('[data-streaming-word]').length === 0)
      return { wrappers, fresh, selected, selectedAfter, completeText, expected: next,
        staticWrappers: body.querySelectorAll('[data-streaming-word]').length }
    })
    expect(result.wrappers).toBeLessThanOrEqual(128)
    expect(result.fresh).toBe(2)
    expect(result.selected.length).toBe(30)
    expect(result.selectedAfter).toBe(result.selected)
    expect(result.completeText).toBe(result.expected)
    expect(result.staticWrappers).toBe(0)
    console.log('Bounded streaming structure:', JSON.stringify({ wrappers: result.wrappers, fresh: result.fresh,
      characters: result.completeText?.length, selectionPreserved: result.selectedAfter === result.selected, staticWrappers: result.staticWrappers }))
  })
})
