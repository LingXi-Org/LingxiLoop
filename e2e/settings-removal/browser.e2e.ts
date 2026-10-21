import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: sidebar entry remains; settings lose scope isolation; load/restore
// errors remove rows; pending work paints after close; mobile navigation hides data.
test('settings list restores, retries and cancels without losing personal rows', async ({ app, browser, screen }) => {
  await app.open('/e2e/settings-removal/index.html')
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByRole('heading', '已删除的对话', { exact: true })).toBeVisible()
  const restore = screen.getByRole('button', '恢复“已移除的测试对话”', { exact: true })
  await expect(restore).toBeVisible()
  await browser.evaluate(() => { (window as any).fixture.restoreFails = true; return null })
  await restore.tap()
  await expect(screen.getByRole('alert')).toContainText('恢复失败')
  await expect(restore).toBeVisible()
  await browser.evaluate(() => { (window as any).fixture.restoreFails = false; return null })
  await restore.tap()
  await expect(screen.getByText('没有已删除的对话', { exact: true })).toBeVisible()
  expect(await browser.evaluate(() => (window as any).fixture.restores)).toEqual(['removed-a', 'removed-a'])
  await app.screenshot('desktop-restored')
  await browser.keyboard.press('Escape')
  await expect(browser.locator('#lingxiloop-settings-trigger')).toBeFocused()

  await browser.evaluate(() => { (window as any).fixture.mode = 'error'; return null })
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByRole('alert')).toBeVisible()
  await browser.evaluate(() => { (window as any).fixture.mode = 'rows'; return null })
  await screen.getByRole('button', '重试', { exact: true }).tap()
  await expect(restore).toBeVisible()
  await browser.keyboard.press('Escape')

  await browser.evaluate(() => { (window as any).fixture.mode = 'hold'; return null })
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByRole('status', '正在加载已删除的对话')).toBeVisible()
  await browser.keyboard.press('Escape')
  await browser.evaluate(() => { (window as any).fixture.release(); (window as any).fixture.mode = 'empty'; return null })
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByText('没有已删除的对话', { exact: true })).toBeVisible()
  expect(await browser.evaluate(() => (window as any).fixture.aborted)).toBeGreaterThan(0)
  await browser.keyboard.press('Escape')

  await browser.evaluate(() => { (window as any).fixture.mode = 'hold'; return null })
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByRole('status', '正在加载已删除的对话')).toBeVisible()
  await browser.evaluate(() => {
    const old = (window as any).fixture.release
    ;(window as any).fixture.mode = 'empty'
    ;(window as any).changeScope()
    old()
    return null
  })
  await expect(screen.getByText('没有已删除的对话', { exact: true })).toBeVisible()
  await expect(restore).toHaveCount(0)
  await app.screenshot('desktop-scope-fenced')
})

test('mobile settings uses existing navigation and fits the viewport', async ({ app, browser, screen }) => {
  await browser.setViewport({ width: 390, height: 844 })
  await app.open('/e2e/settings-removal/index.html')
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByRole('tab', '数据与账号', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '恢复“已移除的测试对话”', { exact: true })).toBeVisible()
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await app.screenshot('mobile-settings-removal')
  await screen.getByRole('button', '关闭设置', { exact: true }).tap()
  await expect(screen.getByRole('button', '打开设置')).toBeFocused()
})

test('closing settings fences a pending restore completion', async ({ app, browser, screen }) => {
  await app.open('/e2e/settings-removal/index.html')
  await browser.evaluate(() => { (window as any).fixture.restoreHeld = true; return null })
  await screen.getByRole('button', '打开设置').tap()
  const restore = screen.getByRole('button', '恢复“已移除的测试对话”', { exact: true })
  await restore.tap()
  await expect(restore).toBeDisabled()
  await expect(restore).toHaveText('正在恢复…')
  await browser.keyboard.press('Escape')
  await browser.evaluate(async () => {
    ;(window as any).fixture.releaseRestore()
    await new Promise(resolve => setTimeout(resolve, 0))
    return null
  })
  await expect(screen.getByText('对话已恢复', { exact: true })).toHaveCount(0)
  await screen.getByRole('button', '打开设置').tap()
  await expect(screen.getByText('没有已删除的对话', { exact: true })).toBeVisible()
  await app.screenshot('closed-restore-fenced')
})
