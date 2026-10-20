import { mkdir, writeFile } from 'node:fs/promises'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: blur composites over either scroll-button branch; badge baseline
// alignment; legacy display aliases overwrite custom names or stable addressing.
for (const width of [1440, 390]) test(`chat controls and Chinese mentions (${width})`, async ({ app, browser, screen }) => {
  await browser.setViewport({ width, height: 960 })
  await app.open('/e2e/chat-213/index.html')
  await expect(browser.locator('[data-msg-id="mention-13"]')).toBeVisible()
  const screenshots = [await app.screenshot(`mentions-${width}`)]
  const baseline = process.env.E2E_CAPTURE_BASELINE === '1'
  if (!baseline) {
    for (const name of ['司南', '明理', '砺思', '溯源', '寻知', '成器', '所有人', 'Nova Labs', '我的研究搭档']) {
      await expect(browser.locator(`[data-mention-id][aria-label="提及 ${name}"]`).first()).toHaveAttribute('title', `@${name}`)
    }
    expect(await browser.evaluate(() => Array.from(document.querySelectorAll('[data-mention-id]')).every(node => getComputedStyle(node).verticalAlign === 'middle'))).toBe(true)
    await expect(browser.locator('[data-msg-id="mention-12"]')).not.toContainText('@Nova')
    await expect(browser.locator('[data-msg-id="mention-13"] code')).toHaveText('@Nova')
    await expect(browser.locator('[data-msg-id="mention-13"]')).toContainText('mail@nova.cn')
  }
  // Ordinary viewport scrolling exercises assistant-ui's ScrollToBottom branch.
  await browser.evaluate(() => { document.querySelector('[data-chat-viewport]')!.scrollTop -= 250; return true })
  const button = screen.getByRole('button', '滚动到底部', { exact: true })
  await expect(button).toBeVisible()
  const inspect = () => browser.evaluate(() => ({
    button: Number(getComputedStyle(document.querySelector('[data-chat-scroll-bottom]')!).zIndex),
    composer: Number(getComputedStyle(document.querySelector('[data-chat-composer-bar]')!).zIndex),
    blur: Array.from(document.querySelector('[data-chat-composer-transition]')!.children).map(node => getComputedStyle(node).backdropFilter),
  }))
  const ordinary = await inspect()
  screenshots.push(await app.screenshot(`scroll-normal-${width}`))
  if (!baseline) expect(ordinary.button).toBeGreaterThan(ordinary.composer)
  await button.focus()
  await browser.keyboard.press('Enter')
  await expect.poll(() => browser.evaluate(() => { const node = document.querySelector('[data-chat-viewport]')!; return node.scrollHeight - node.clientHeight - node.scrollTop })).toBeLessThan(2)
  // Question navigation sets the explicit readingHistory branch.
  // The product omits its index on mobile. Enter history at desktop width,
  // then resize the same mounted conversation to cover the retained branch.
  if (width < 768) await browser.setViewport({ width: 1440, height: 960 })
  await browser.locator('[data-slot="conversation-map-tick"]').first().tap()
  if (width < 768) await browser.setViewport({ width, height: 960 })
  await expect(button).toBeVisible()
  const history = await inspect()
  screenshots.push(await app.screenshot(`scroll-history-${width}`))
  if (!baseline) expect(history.button).toBeGreaterThan(history.composer)
  expect(history.blur.filter(value => value.includes('blur('))).toHaveLength(4)
  await button.focus()
  await browser.keyboard.press('Space')
  await expect.poll(() => browser.evaluate(() => { const node = document.querySelector('[data-chat-viewport]')!; return node.scrollHeight - node.clientHeight - node.scrollTop })).toBeLessThan(2)
  const output = process.env.E2E_CHAT_OUTPUT ?? '.e2e/chat-213'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/appearance-${width}.json`, JSON.stringify({ width, baseline, ordinary, history, screenshots }, null, 2))
})

test('composer candidates, selected mentions and refreshed history preserve Chinese names and stable IDs', async ({ app, browser, screen }) => {
  await app.open('/e2e/chat-213/index.html')
  const input = browser.locator('[contenteditable="true"]')
  await input.fill('@')
  const options = browser.locator('[role="option"]')
  await expect(options).toContainText(['所有人', '司南', '明理', '砺思', '溯源', '寻知', '成器', 'Nova Labs', '我的研究搭档'])
  await screen.getByRole('option', /司南/).tap()
  await expect(browser.locator('[contenteditable="true"] [data-directive-id="preset-nova"]')).toContainText('@司南')
  await expect(browser.locator('[contenteditable="true"] [data-mention-id="preset-nova"]')).toHaveAttribute('aria-label', '提及 司南')
  await app.screenshot('composer-selected-Chinese')
  await app.open('/e2e/chat-213/index.html?currentNames=1')
  await expect(browser.locator('[data-msg-id="mention-12"]')).not.toContainText('@Nova')
  await expect(browser.locator('[data-msg-id="mention-12"] [data-mention-id="preset-nova"]')).toHaveAttribute('title', '@司南')
  await app.screenshot('history-refreshed-Chinese')
})
