import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { reduceMotion } from './media'

for (const [width, theme] of [[1440, 'light'], [1440, 'dark'], [390, 'light'], [390, 'dark']] as const) {
  test(`question previews, navigation, streaming and conversation scope (${width}, ${theme})`, async ({ app, browser, screen }) => {
    await browser.setViewport({ width, height: 900 })
    await app.open(`/e2e/question-index/index.html?theme=${theme}`)
    const markers = browser.locator('[data-question-id]')
    const question = (id: number) => browser.locator(`[data-question-id="q-${id}"]`)
    await expect(markers).toHaveCount(40)
    await expect(question(23)).toHaveAttribute('aria-label', /附件：研究笔记.pdf/)
    await expect(question(22)).toHaveAttribute('aria-label', /…$/)
    await question(23).hover()
    await expect(screen.getByRole('tooltip')).toContainText('研究笔记.pdf')
    await question(23).focus()
    await question(23).press('ArrowUp')
    await expect(question(22)).toBeFocused()
    await expect(screen.getByRole('tooltip', { name: /第22次提问/ })).toContainText('这是需要截断的长问题')
    await app.screenshot(`question-index-preview-${width}-${theme}`)
    await question(22).press('Enter')
    await expect.poll(() => browser.evaluate(() => {
      const viewport = document.querySelector('[data-chat-viewport]')!.getBoundingClientRect()
      return Math.abs(document.querySelector('[data-msg-id="q-22"]')!.getBoundingClientRect().top - viewport.top - 16)
    })).toBeLessThan(2)
    await expect(question(22)).toHaveAttribute('aria-current', 'location')
    await question(22).press('Escape')
    await browser.evaluate(() => {
      const viewport = document.querySelector('[data-chat-viewport]')! as HTMLElement
      viewport.scrollTop += document.querySelector('[data-msg-id="q-35"]')!.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16
      return true
    })
    await expect(question(35)).toHaveAttribute('aria-current', 'location')
    const before = await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'stream' })))
    await expect(browser.locator('[data-msg-id="a-60"]')).toContainText('持续输出的新内容')
    await expect.poll(() => browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)).toBe(before)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'append' })))
    await expect(markers).toHaveCount(41)
    await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'receipt' })))
    await expect(markers).toHaveCount(41)
    expect(await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)).toBe(before)
    const layout = await browser.evaluate(() => {
      const rail = document.querySelector('[data-question-index]')!.getBoundingClientRect()
      const viewport = document.querySelector('[data-chat-viewport]')!.getBoundingClientRect()
      const composer = document.querySelector('[data-chat-composer-bar]')!.getBoundingClientRect()
      return { railClear: rail.right <= viewport.left, composerClear: rail.bottom <= composer.top, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    expect(layout).toEqual({ railClear: true, composerClear: true, overflow: false })
    await app.screenshot(`question-index-history-${width}-${theme}`)
    await screen.getByRole('button', '滚动到底部').tap()
    await expect.poll(() => browser.evaluate(() => {
      const viewport = document.querySelector('[data-chat-viewport]')!
      return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
    })).toBeLessThan(2)
    await screen.getByRole('button', '另一段对话', { exact: true }).tap()
    await expect(markers).toHaveCount(1)
    await expect(question(101)).toBeVisible()
    await screen.getByRole('button', '历史提问', { exact: true }).tap()
    await expect(markers).toHaveCount(41)
    await browser.reload()
    await expect(markers).toHaveCount(40)
  })
}

test('older history retries, preserves position and remains reachable with the keyboard', async ({ app, browser, screen }) => {
  await app.open('/e2e/question-index/index.html')
  const markers = browser.locator('[data-question-id]')
  await expect(markers).toHaveCount(40)
  await browser.locator('[data-question-id="q-30"]').tap()
  await expect(browser.locator('[data-question-id="q-30"]')).toHaveAttribute('aria-current', 'location')
  await expect.poll(() => browser.evaluate(() => Math.abs(document.querySelector('[data-msg-id="q-30"]')!.getBoundingClientRect().top - document.querySelector('[data-chat-viewport]')!.getBoundingClientRect().top - 16))).toBeLessThan(2)
  const before = await browser.evaluate(() => document.querySelector('[data-msg-id="q-30"]')!.getBoundingClientRect().top)
  await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'fail-history' })))
  await screen.getByRole('button', '加载更早的提问', { exact: true }).tap()
  await expect(screen.getByRole('button', '加载失败，重试更早的提问')).toBeVisible()
  await screen.getByRole('button', '加载失败，重试更早的提问').tap()
  await expect(markers).toHaveCount(60)
  await expect.poll(async () => Math.abs(await browser.evaluate(() => document.querySelector('[data-msg-id="q-30"]')!.getBoundingClientRect().top) - before)).toBeLessThan(2)
  await expect(screen.getByRole('button', '加载更早的提问', { exact: true })).toHaveCount(0)
  await browser.locator('[data-question-id="q-30"]').focus()
  await browser.keyboard.press('Home')
  await expect(browser.locator('[data-question-id="q-1"]')).toBeFocused()
  await browser.keyboard.press('Enter')
  await expect(browser.locator('[data-question-id="q-1"]')).toHaveAttribute('aria-current', 'location')
  await app.screenshot('question-index-oldest-history')
  await browser.keyboard.press('End')
  await expect(browser.locator('[data-question-id="q-60"]')).toBeFocused()
  await browser.keyboard.press('Space')
  await expect(browser.locator('[data-question-id="q-60"]')).toHaveAttribute('aria-current', 'location')
  await app.screenshot('question-index-latest-keyboard')
})

test('the latest question stays put as its short answer starts streaming', async ({ app, browser, screen }) => {
  await app.open('/e2e/question-index/index.html')
  const latest = browser.locator('[data-question-id="q-60"]')
  await expect(latest).toHaveAttribute('aria-current', 'location')
  await latest.tap()
  const before = await browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)
  await browser.evaluate(() => window.dispatchEvent(new CustomEvent('question-index-step', { detail: 'stream' })))
  await expect(browser.locator('[data-msg-id="a-60"]')).toContainText('持续输出的新内容')
  await expect.poll(() => browser.evaluate(() => document.querySelector('[data-chat-viewport]')!.scrollTop)).toBe(before)
  await screen.getByRole('button', '滚动到底部').tap()
  await expect.poll(() => browser.evaluate(() => {
    const viewport = document.querySelector('[data-chat-viewport]')!
    return viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop
  })).toBeLessThan(2)
  await app.screenshot('question-index-resume-following')
})

test('imported Codex waveform is centered, magnifies neighbours and navigates by pointer', async ({ app, browser, screen }) => {
  await app.open('/e2e/question-index/index.html?theme=dark')
  await expect(browser.locator('[data-question-id]')).toHaveCount(40)
  await expect(browser.locator('[data-question-index]')).toHaveAttribute('data-source', 'dsh-turn-scrubber')
  const geometry = await browser.evaluate(() => {
    const markers = [...document.querySelectorAll('[data-question-id]')]
    const first = markers[0].getBoundingClientRect(), last = markers.at(-1)!.getBoundingClientRect()
    const rail = markers[0].parentElement!.parentElement!.getBoundingClientRect()
    return { centered: Math.abs((first.top + last.bottom) / 2 - (rail.top + rail.bottom) / 2), height: last.bottom - first.top }
  })
  expect(geometry.centered).toBeLessThan(2)
  expect(geometry.height).toBe(240)
  const target = browser.locator('[data-question-id="q-40"]')
  await target.hover()
  await expect(screen.getByRole('tooltip')).toContainText('第40次提问')
  await expect.poll(() => browser.evaluate(() => {
    const widths = [40, 39, 38, 30].map(id => document.querySelector(`[data-question-id="q-${id}"] span`)!.getBoundingClientRect().width)
    return widths[0] > widths[1] && widths[1] > widths[2] && widths[2] > widths[3] && widths[0] > 14
  })).toBe(true)
  await app.screenshot('question-index-upstream-waveform')
  await target.tap()
  await expect(target).toHaveAttribute('aria-current', 'location')
  await expect.poll(() => browser.evaluate(() => Math.abs(document.querySelector('[data-msg-id="q-40"]')!.getBoundingClientRect().top - document.querySelector('[data-chat-viewport]')!.getBoundingClientRect().top - 16))).toBeLessThan(2)
})

if (process.env.E2E_REDUCED_MOTION === '1') {
  test('reduced motion jumps without animation and retains a visible keyboard focus', async ({ app, browser }) => {
    const caseId = crypto.randomUUID()
    await app.open(`/e2e/question-index/index.html?theme=dark&media-case=${caseId}`)
    await expect(browser.locator('[data-question-id]')).toHaveCount(40)
    const resetMedia = await reduceMotion(caseId)
    try {
    expect(await browser.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const target = browser.locator('[data-question-id="q-30"]')
    await target.focus()
    await target.press('Enter')
    expect(await browser.evaluate(() => Math.abs(document.querySelector('[data-msg-id="q-30"]')!.getBoundingClientRect().top - document.querySelector('[data-chat-viewport]')!.getBoundingClientRect().top - 16))).toBeLessThan(2)
    await expect(target).toHaveAttribute('aria-current', 'location')
    expect(await browser.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle)).toBe('solid')
    expect(await browser.evaluate(() => [...document.querySelectorAll('[data-question-id], [data-question-id] span')].every(element => getComputedStyle(element).transitionDuration === '0s'))).toBe(true)
    await app.screenshot('question-index-reduced-motion-keyboard')
    } finally { resetMedia() }
  })
}
