import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { writeFile } from 'node:fs/promises'

test('synthetic before/after IME, reading, theme and body paint', async ({ app, browser }) => {
  const evidence: Record<string, unknown> = {}
  const caseId = String(Date.now())
  for (const version of [process.env.E2E_VISUAL_BASELINE === '1' ? 'before' : 'after']) {
    await app.open(`/e2e/visual-input.html?version=${version}&case=${caseId}`)
    const editor = browser.locator('[contenteditable="true"]')
    try { await expect(editor).toBeVisible() } catch (error) { console.log('FIXTURE_STARTUP', await browser.evaluate(() => ({ html: document.body.innerHTML.slice(0, 4000), resources: performance.getEntriesByType('resource').slice(-8).map(item => item.name) }))); throw error }
    await editor.fill('中文候选')
    await browser.evaluate(() => document.querySelector('[contenteditable]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 229, isComposing: false, bubbles: true, cancelable: true })))
    await expect(browser.locator('output')).toHaveAttribute('data-fixture-submitted', version === 'before' ? '1' : '0')
    evidence[`${version}229Submissions`] = await browser.locator('output').getAttribute('data-fixture-submitted')
    await editor.fill('')
    await app.screenshot(`${version}-light-comfortable-compact`)
    await browser.evaluate(() => Object.assign(window, { retainedBody: document.querySelector('[data-msg-id="history-11"] [data-message-region="body"]') }))
    evidence[`${version}Paint`] = await browser.evaluate(async () => (window as unknown as { visualInputStream: () => Promise<unknown> }).visualInputStream())
    evidence[`${version}BodyIdentity`] = await browser.evaluate(() => (window as unknown as { retainedBody: Element }).retainedBody === document.querySelector('[data-msg-id="history-11"] [data-message-region="body"]'))
    expect(evidence[`${version}BodyIdentity`]).toBe(true)
    evidence[`${version}Style`] = await browser.evaluate(() => ({
      page: getComputedStyle(document.querySelector('main')!).backgroundColor,
      panel: getComputedStyle(document.querySelector('section')!).backgroundColor,
      proseLineHeight: getComputedStyle(document.querySelector('.im-markdown-agent')!).lineHeight,
      tablePadding: getComputedStyle(document.querySelector('td')!).paddingBlock,
    }))
    await writeFile(`/tmp/loop373-visual-browser-${version}-evidence.json`, JSON.stringify(evidence, null, 2))
    if (version === 'before') continue
    await editor.fill('组合结束候选')
    await browser.evaluate(() => {
      const node = document.querySelector('[contenteditable]')!
      node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '组合结束候选' }))
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await expect(browser.locator('output')).toHaveAttribute('data-fixture-submitted', '0')
    await browser.keyboard.press('Enter')
    await expect(browser.locator('output')).toHaveAttribute('data-fixture-submitted', '1')
    await editor.fill('换行保留')
    await browser.keyboard.press('Shift+Enter')
    await expect(browser.locator('output')).toHaveAttribute('data-fixture-submitted', '1')
    await browser.keyboard.press('Control+A')
    await browser.keyboard.press('Backspace')
    await browser.keyboard.type('@学')
    await expect(browser.locator('[role="option"]').first()).toBeVisible()
    await browser.evaluate(() => document.querySelector('[contenteditable]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true })))
    await expect(browser.locator('[data-directive-id]')).toHaveCount(0)
    await browser.keyboard.press('Escape')
    await expect(browser.locator('[role="option"]')).toHaveCount(0)
    await editor.fill('')
    await browser.keyboard.type('@学')
    await browser.keyboard.press('Enter')
    await expect(browser.locator('[data-directive-id="agent"]')).toBeVisible()
    await browser.keyboard.press('Control+A')
    await browser.keyboard.press('Backspace')
    await browser.keyboard.type('/投')
    await expect(browser.locator('[role="option"]').first()).toBeVisible()
    await browser.evaluate(() => document.querySelector('[contenteditable]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true })))
    await expect(browser.locator('output')).not.toHaveText('已打开投票')
    await browser.keyboard.press('Enter')
    await expect(browser.locator('output')).toHaveText('已打开投票')
    await editor.fill('')
    await browser.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    // Native selection is a reading action even if the viewport is at bottom.
    await browser.evaluate(() => {
      const node = document.querySelector('[data-msg-id="history-9"] [data-message-region="body"]')!
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      const range = document.createRange(); range.selectNodeContents(node)
      window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await expect(browser.locator('[data-chat-scroll-bottom]')).toBeVisible()
    const reading = await browser.evaluate(() => ({ top: document.querySelector('[data-chat-viewport]')!.scrollTop, height: document.querySelector('[data-chat-viewport]')!.clientHeight, anchor: document.querySelector('[data-msg-id="history-9"]')!.getBoundingClientRect().top, selected: window.getSelection()!.toString() }))
    await browser.evaluate(() => (window as unknown as { visualInputRevise: () => void }).visualInputRevise())
    await expect(browser.locator('[data-msg-id="history-11"]')).toContainText('新增解题说明')
    const after = await browser.evaluate(() => ({ top: document.querySelector('[data-chat-viewport]')!.scrollTop, height: document.querySelector('[data-chat-viewport]')!.clientHeight, anchor: document.querySelector('[data-msg-id="history-9"]')!.getBoundingClientRect().top, selected: window.getSelection()!.toString() }))
    evidence.selectionBefore = reading; evidence.selectionAfter = after
    await writeFile('/tmp/loop373-selection-debug.json', JSON.stringify({ reading, after }, null, 2))
    // Native overflow anchoring can move less than a line while retaining the
    // same visible selection. Keep native anchoring for late images/fonts.
    expect(Math.abs(reading.anchor - after.anchor)).toBeLessThan(28)
    expect(after.selected).toBe(reading.selected)
    await browser.locator('[data-chat-scroll-bottom]').tap()
    await browser.setViewport({ width: 390, height: 900 })
    await browser.evaluate(() => { document.documentElement.classList.add('dark'); document.documentElement.dataset.theme = 'dark' })
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await app.screenshot('after-dark-narrow')
    await browser.locator('[contenteditable="true"]').fill('焦点与选中可见')
    evidence.focusAndSelection = await browser.evaluate(() => ({ outline: getComputedStyle(document.querySelector('form')!).outline, selection: getComputedStyle(document.querySelector('[contenteditable]')!, '::selection').backgroundColor }))
    evidence.darkNarrow = await browser.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
    // The official engine has no media-preference option; use native CDP only
    // for the browser preference, as in e2e/question-index/media.ts.
    const endpoint = process.env.E2E_CDP_URL!
    const pages = await (await fetch(new URL('/json/list', endpoint))).json() as { url: string; webSocketDebuggerUrl: string }[]
    const target = pages.find(page => page.url.includes(`/e2e/visual-input.html?version=after&case=${caseId}`))!
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('error', () => reject(new Error('Native motion preference setup failed')), { once: true })
      socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Emulation.setEmulatedMedia', params: { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] } })), { once: true })
      socket.addEventListener('message', event => { const reply = JSON.parse(String(event.data)); if (reply.id === 1) { reply.error ? reject(new Error(reply.error.message)) : resolve() } })
    })
    await browser.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
    evidence.reducedMotion = await browser.evaluate(() => {
      const node = document.querySelector('[data-chat-message-column]')!; node.classList.add('ui-enter')
      return { matches: matchMedia('(prefers-reduced-motion: reduce)').matches, animation: getComputedStyle(node).animationName }
    })
    try { expect(evidence.reducedMotion).toEqual({ matches: true, animation: 'none' }) } finally { socket.close() }
  }
  console.log('VISUAL_INPUT_EVIDENCE', JSON.stringify(evidence))
  await writeFile(`/tmp/loop373-visual-browser-${process.env.E2E_VISUAL_BASELINE === '1' ? 'before' : 'after'}-evidence.json`, JSON.stringify(evidence, null, 2))
})
