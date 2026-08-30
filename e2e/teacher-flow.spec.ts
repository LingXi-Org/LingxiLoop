import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/teacher-flow.html', { waitUntil: 'domcontentloaded', timeout: 90_000 })
})

test('renders the native assistant-ui thread, Expo-style bubble, composer, and streaming update', async ({ page }) => {
  await expect(page.getByText('Welcome to the assistant-ui conversation fixture.')).toBeVisible()
  const composer = page.locator('[contenteditable="true"]')
  await composer.fill('Hello Scout')
  await composer.press('Enter')
  await expect(page.getByText('Hello Scout')).toBeVisible()
  await expect(page.getByText('Streaming complete')).toBeVisible()
  await expect(page.locator('.chat-composer')).toHaveCSS('border-radius', '28px')
  await expect(page.locator('.chat-composer')).toHaveCSS('background-color', 'rgb(33, 33, 33)')
  const userBubble = page.locator('[data-message-bubble="user"]').filter({ hasText: 'Hello Scout' })
  await expect(userBubble).toHaveCSS('border-bottom-right-radius', '4px')
  await expect(userBubble).toHaveCSS('padding-left', '14px')
  await expect(userBubble).toHaveCSS('padding-top', '8px')
  const messageWidth = await userBubble.locator('xpath=ancestor::*[@data-msg-id][1]').evaluate((element) => element.getBoundingClientRect().width)
  const composerWidth = await page.locator('.chat-composer').evaluate((element) => element.getBoundingClientRect().width)
  expect(messageWidth).toBeGreaterThan(900)
  expect(composerWidth).toBeGreaterThan(900)
})

test('groups consecutive bubbles with preset-controlled cluster corners', async ({ page }) => {
  const start = page.locator('[data-msg-id="welcome"] [data-message-bubble="assistant"]')
  const middle = page.locator('[data-msg-id="cluster-middle"] [data-message-bubble="assistant"]')
  const middleEnd = page.locator('[data-msg-id="cluster-end"] [data-message-bubble="assistant"]')
  const end = page.locator('[data-msg-id="approval"] [data-message-bubble="assistant"]')
  await expect(start).toHaveAttribute('data-message-group-position', 'start')
  await expect(middle).toHaveAttribute('data-message-group-position', 'middle')
  await expect(middleEnd).toHaveAttribute('data-message-group-position', 'middle')
  await expect(end).toHaveAttribute('data-message-group-position', 'end')
  await expect(start).toHaveCSS('border-top-left-radius', '18px')
  await expect(start).toHaveCSS('border-bottom-left-radius', '4px')
  await expect(middle).toHaveCSS('border-top-left-radius', '4px')
  await expect(middle).toHaveCSS('border-bottom-left-radius', '4px')
  await expect(end).toHaveCSS('border-top-left-radius', '4px')
  await expect(end).toHaveCSS('border-bottom-left-radius', '18px')
  await expect(end.locator('[data-slot="approval-card"] > div').first()).toHaveCSS('border-radius', '0px')
  await expect(middle).toHaveCSS('padding-left', '14px')
})

test('groups consecutive self-authored bubbles on the trailing edge', async ({ page }) => {
  const start = page.locator('[data-msg-id="mine-start"] [data-message-bubble="user"]')
  const end = page.locator('[data-msg-id="mine-end"] [data-message-bubble="user"]')
  await expect(start).toHaveAttribute('data-message-group-position', 'start')
  await expect(end).toHaveAttribute('data-message-group-position', 'end')
  await expect(start).toHaveCSS('border-top-right-radius', '18px')
  await expect(start).toHaveCSS('border-bottom-right-radius', '4px')
  await expect(end).toHaveCSS('border-top-right-radius', '4px')
  await expect(end).toHaveCSS('border-bottom-right-radius', '18px')
  await expect(start).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(start.locator('.typeset')).toHaveCSS('color', 'rgb(255, 255, 255)')
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
  await expect(start).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(start.locator('.typeset')).toHaveCSS('color', 'rgb(255, 255, 255)')
})

test('uses chatcn hover actions and reaction pill states', async ({ page }) => {
  const message = page.locator('[data-msg-id="cluster-middle"]')
  const mine = page.getByRole('button', { name: '🔥 2 个反应' })
  const other = page.getByRole('button', { name: '👍 1 个反应' })
  await expect(mine).toHaveAttribute('aria-pressed', 'true')
  await expect(other).toHaveAttribute('aria-pressed', 'false')
  await expect(mine).toHaveCSS('height', '26px')
  await expect(other).toHaveCSS('height', '26px')
  const pill = await mine.evaluate((element) => ({
    radius: Number.parseFloat(getComputedStyle(element).borderRadius),
    height: element.getBoundingClientRect().height,
  }))
  expect(pill.radius).toBeGreaterThanOrEqual(pill.height / 2)
  expect(await mine.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(await other.evaluate((element) => getComputedStyle(element).backgroundColor))
  await message.hover()
  const copy = message.getByRole('button', { name: '复制' })
  const quote = message.getByRole('button', { name: '回复' })
  const emoji = message.getByRole('button', { name: '添加表情' })
  await expect(copy).toBeVisible()
  await expect(copy).toHaveCSS('width', '28px')
  await expect(quote).toBeVisible()
  await expect(emoji).toBeVisible()
  await expect(message.locator('[role="toolbar"] button')).toHaveCount(3)
  const bubble = message.locator('[data-message-bubble="assistant"]')
  const toolbar = message.getByRole('toolbar', { name: '消息操作' })
  const before = await toolbar.boundingBox()
  await message.hover({ position: { x: 180, y: 24 } })
  const after = await toolbar.boundingBox()
  expect(after?.x).toBe(before?.x)
  const bubbleBox = await bubble.boundingBox()
  expect(after?.y).toBeLessThan(bubbleBox?.y ?? Number.POSITIVE_INFINITY)
  expect(Math.abs((after?.x ?? 0) + (after?.width ?? 0) - ((bubbleBox?.x ?? 0) + (bubbleBox?.width ?? 0)))).toBeLessThan(1)
  await quote.click()
  await expect(page.locator('.chat-composer')).toContainText('This is the middle of a compact message cluster.')
  await page.getByRole('button', { name: '取消回复' }).click()
  await message.hover()
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, 'writeText', {
      configurable: true,
      value: async (value: string) => {
        Object.assign(window, { __copiedMessage: value })
      },
    })
  })
  await copy.click()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __copiedMessage?: string }).__copiedMessage ?? '')).toContain('This is the middle of a compact message cluster.')
  await message.hover()
  await emoji.click()
  await expect(page.getByRole('listbox', { name: '选择消息表情' })).toBeVisible()
  await expect(page.getByRole('option', { name: '使用 🔥 回应' })).toBeVisible()
  await page.locator('.chat-composer').hover()
  await expect(toolbar).toBeHidden()
  await expect(page.getByRole('listbox', { name: '选择消息表情' })).toBeHidden()
})

test('composer focus has no selection ring or outline', async ({ page }) => {
  const composer = page.locator('.chat-composer')
  const input = composer.locator('.aui-lexical-input')
  await input.click()
  await expect(input).toHaveCSS('outline-style', 'none')
  await expect(input).toHaveCSS('box-shadow', 'none')
  await expect(composer).toHaveCSS('box-shadow', 'none')
})

test('keeps only the safe edge inset on a narrow conversation pane', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const messageWidth = await page.locator('[data-msg-id="welcome"]').evaluate((element) => element.getBoundingClientRect().width)
  const composerWidth = await page.locator('.chat-composer').evaluate((element) => element.getBoundingClientRect().width)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(messageWidth).toBeGreaterThan(360)
  expect(composerWidth).toBeGreaterThan(350)
  expect(overflow).toBe(0)
})

test('hides the scroll bubble at the latest message and reveals it after scrolling away', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 420 })
  const scrollBubble = page.getByRole('button', { name: '滚动到底部' })
  await expect(scrollBubble).toBeHidden()
  await page.locator('[data-chat-viewport]').evaluate((viewport) => {
    viewport.scrollTop = 0
    viewport.dispatchEvent(new Event('scroll'))
  })
  await expect(scrollBubble).toBeVisible()
  const bubbleShape = await scrollBubble.evaluate((element) => ({
    radius: Number.parseFloat(getComputedStyle(element).borderRadius),
    width: element.getBoundingClientRect().width,
  }))
  expect(bubbleShape.radius).toBeGreaterThanOrEqual(bubbleShape.width / 2)
})

test('mention picker and inline directive use the real Agent avatar', async ({ page }) => {
  const composer = page.locator('[contenteditable="true"]')
  await composer.fill('@')
  const picker = page.getByRole('listbox', { name: '提及成员' })
  await expect(picker).toBeVisible()
  await expect(picker.getByRole('img', { name: /Scout/ })).toBeVisible()
  await picker.getByRole('option').filter({ hasText: 'Scout' }).click()
  await expect(composer.getByRole('img', { name: /Scout/ })).toBeVisible()
  await expect(composer.locator('[data-directive-id="scout-e2e"]')).toContainText('@Scout')
})

test('slash command opens poll composer and approval uses Tool UI', async ({ page }) => {
  const composer = page.locator('[contenteditable="true"]')
  await composer.fill('/')
  const commands = page.getByRole('listbox', { name: '快捷命令' })
  await expect(commands).toBeVisible()
  await commands.getByRole('option').filter({ hasText: '/poll' }).click()
  await expect(page.getByText('新建投票')).toBeVisible()
  await page.getByRole('button', { name: '取消投票' }).click()
  await page.getByRole('button', { name: '批准' }).click()
  await expect(page.getByRole('status', { name: 'Approved' })).toBeVisible()
})
