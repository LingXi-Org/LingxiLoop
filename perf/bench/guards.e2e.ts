import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { readFile } from 'node:fs/promises'

// Written before deferring CanvasPreview: fonts must load only when needed,
// while previews, full canvas, keyboard focus, history and access errors survive.
const room = '/?project=e2e-classroom&view=conversations&conversation=e2e-study-room'
test.beforeEach(async ({ browser }) => {
  await browser.setCookies(JSON.parse(await readFile('.e2e/perf-session.json', 'utf8')))
})

test('notification window keeps its separate renderer', async ({ app, browser }) => {
  await app.open('/#notifications')
  await expect.poll(() => browser.evaluate(() => document.body.style.background)).toBe('transparent')
  await expect(browser.locator('input[type="email"], [contenteditable="true"], [aria-label="工作区与功能"]')).toBeHidden()
  await app.screenshot('notification-renderer')
})

test('chat defers canvas fonts and both canvas entry points still open', async ({ app, browser, screen }) => {
  await app.open(room)
  await expect(browser.locator('[data-msg-id]').filter({ hasText: '性能基准历史 6' })).toBeVisible()
  expect(await browser.evaluate(() => [...document.styleSheets].some(sheet => {
    try { return [...sheet.cssRules].some(rule => rule.cssText.includes('font-family: Xiaolai')) } catch { return false }
  }))).toBe(false)
  await screen.getByRole('button', '打开画布预览').tap()
  await expect(browser.locator('[data-canvas-preview]')).toBeVisible()
  await screen.getByRole('button', /^打开完整画布：/).tap()
  await expect(screen.getByRole('dialog', 'Canvas')).toBeVisible()
  await screen.getByRole('button', '返回对话').tap()
  await expect(screen.getByRole('dialog', 'Canvas')).toBeHidden()
  await expect(screen.getByRole('button', '打开画布预览')).toBeFocused()
  await app.screenshot('canvas-lazy-load-and-focus')
})

test('settings still open and failed deep links never open an unrelated chat', async ({ app, browser, screen }) => {
  await app.open(room)
  await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
  await screen.getByRole('button', '打开账户菜单').tap()
  await screen.getByRole('menuitem', '设置').tap()
  await expect(screen.getByRole('dialog', 'LingxiLoop 设置')).toBeVisible()
  await screen.getByRole('button', '通知', { exact: true }).tap()
  await expect(screen.getByLabel('通知时区')).toBeVisible()
  await app.screenshot('settings-after-splitting')
  await app.open('/?project=e2e-no-access&view=conversations')
  await expect(screen.getByRole('alert')).toContainText('该工作区不存在或无权访问')
  await expect(browser.locator('[contenteditable="true"]')).toBeHidden()
  await app.screenshot('unauthorized-workspace-stays-closed')
})

test('mobile history and drafts survive opening and closing the conversation list', async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 390, height: 844 })
  await app.open(room)
  const input = browser.locator('[contenteditable="true"]')
  await expect(input).toBeVisible()
  await input.focus()
  await browser.keyboard.type('不要丢失的草稿 draft')
  await expect(input).toHaveText('不要丢失的草稿 draft')
  await screen.getByRole('button', '返回会话列表').tap()
  await expect(input).toBeHidden()
  await browser.locator('[data-slot="sidebar"] [role="button"]').filter({ hasText: 'E2E Classroom · Study Room' }).tap()
  await expect(input).toHaveText('不要丢失的草稿 draft')
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot('mobile-history-and-draft')
})
