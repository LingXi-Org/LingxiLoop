import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

declare global {
  interface Window { viewportObservedElements?: () => Element[] }
}

test('viewport follows intrinsic growth, preserves selection and releases resized content on unmount', async ({ app, browser, screen }) => {
  await app.open('/e2e/question-index/index.html')
  const gap = () => browser.evaluate(() => {
    const viewport = document.querySelector('[data-chat-viewport]')!
    return Math.abs(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop)
  })
  await expect.poll(gap).toBeLessThan(2)
  await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'math' })))
  await expect(browser.locator('[data-msg-id="a-60"] .katex')).toBeVisible()
  await expect.poll(gap).toBeLessThan(2)
  // The image's intrinsic height changes after insertion. No extra DOM mutation
  // is needed when its data arrives; the content ResizeObserver must see it.
  await browser.evaluate(async () => {
    const image = document.createElement('img')
    image.alt = '合成尺寸测试'
    image.style.cssText = 'display:block;width:320px'
    document.querySelector('[data-msg-id="a-60"]')!.append(image)
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    image.src = URL.createObjectURL(new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="320" height="900"><rect width="320" height="900" fill="teal"/></svg>'], { type: 'image/svg+xml' }))
    await image.decode()
    URL.revokeObjectURL(image.src)
    return image.naturalHeight
  })
  await expect.poll(gap).toBeLessThan(2)
  // A selection at the bottom pauses following even before there is room to
  // scroll up. Later formula/font growth must not take away the selection.
  await browser.evaluate(() => {
    const text = document.querySelector('[data-msg-id="a-60"] p')!
    const range = document.createRange()
    range.selectNodeContents(text)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    return true
  })
  await expect(screen.getByRole('button', '滚动到底部')).toBeEnabled()
  const before = await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)
  await browser.evaluate(() => {
    const formula = document.querySelector<HTMLElement>('[data-msg-id="a-60"] .katex')!
    formula.style.fontSize = '80px'
    return true
  })
  await expect.poll(() => browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)).toBe(before)
  expect(await browser.evaluate(() => window.getSelection()!.toString())).toContain('公式尺寸变化')
  await browser.evaluate(() => { window.getSelection()!.removeAllRanges(); return true })
  await screen.getByRole('button', '滚动到底部').tap()
  await expect.poll(gap).toBeLessThan(2)
  // Scroll up without the question index or selection pause flag, then append
  // streaming content. Following must resume only through the explicit button.
  await browser.evaluate(() => {
    const viewport = document.querySelector('[data-chat-viewport]')! as HTMLElement
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -300 }))
    viewport.scrollTop -= 300
    return true
  })
  await expect.poll(gap).toBeGreaterThan(250)
  await expect(screen.getByRole('button', '滚动到底部')).toBeEnabled()
  const readingTop = await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)
  await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'append' })))
  await expect(browser.locator('[data-msg-id="a-61"]')).toContainText('第61次答复')
  await expect.poll(() => browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)).toBe(readingTop)
  await screen.getByRole('button', '滚动到底部').tap()
  await expect.poll(gap).toBeLessThan(2)

  // Track actual native observers created by the next thread mount. Switching
  // back must disconnect every ResizeObserver from that detached viewport.
  await browser.evaluate(() => {
    const Original = window.ResizeObserver
    const targets = new Map<ResizeObserver, Set<Element>>()
    window.ResizeObserver = class extends Original {
      observe(target: Element, options?: ResizeObserverOptions) {
        if (!targets.has(this)) targets.set(this, new Set())
        targets.get(this)!.add(target)
        super.observe(target, options)
      }
      unobserve(target: Element) { targets.get(this)?.delete(target); super.unobserve(target) }
      disconnect() { targets.delete(this); super.disconnect() }
    }
    Object.assign(window, { viewportObservedElements: () => [...targets.values()].flatMap(value => [...value]) })
    return true
  })
  await screen.getByRole('button', '另一段对话', { exact: true }).tap()
  await expect(browser.locator('[data-msg-id="a-101"]')).toBeVisible()
  expect(await browser.evaluate(() => window.viewportObservedElements!()
    .some(element => element.matches('[data-chat-viewport]')))).toBe(true)
  await screen.getByRole('button', '历史提问', { exact: true }).tap()
  await expect(browser.locator('[data-msg-id="a-60"] .katex')).toBeVisible()
  await expect.poll(() => browser.evaluate(() => window.viewportObservedElements!()
    .filter(element => !element.isConnected).length)).toBe(0)
})
