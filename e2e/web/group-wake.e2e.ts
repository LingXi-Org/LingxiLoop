import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Teacher group automatic wake with a lost callback', {
  timeout: 180000,
  ...(process.env.GROUP_WAKE_BROWSER === '1' ? {} : { skip: 'Requires the isolated real WuKong group-wake integration fixture.' }),
}, () => {
  test('ordinary and explicit mention sends produce one reply each, surviving a browser reload', async ({ app, browser, screen }) => {
    await app.open('/e2e/group-wake.html')
    await expect(screen.getByRole('heading', '群聊唤醒本地验收')).toBeVisible()
    const bodies = browser.locator('[data-message-region="body"]')
    await expect(browser.locator('[data-message-region="body"]').filter({ hasText: 'group-wake-a 合成群聊答复已完成。' })).toHaveCount(1)
    await browser.locator('[contenteditable="true"]').fill('浏览器普通消息请回答。')
    await screen.getByRole('button', '发送', { exact: true }).tap()
    await expect(bodies.filter({ hasText: 'group-wake-a 合成群聊答复已完成。' })).toHaveCount(2)
    await browser.locator('[contenteditable="true"]').fill('@group-wake-b 请核对。')
    await browser.keyboard.press('Escape')
    await screen.getByRole('button', '发送', { exact: true }).tap()
    await expect(bodies.filter({ hasText: 'group-wake-b 合成群聊答复已完成。' })).toHaveCount(1)
    await browser.reload()
    await expect(bodies.filter({ hasText: 'group-wake-a 合成群聊答复已完成。' })).toHaveCount(2)
    await expect(bodies.filter({ hasText: 'group-wake-b 合成群聊答复已完成。' })).toHaveCount(1)
    const counts = await browser.evaluate(async () => (await fetch('/api/__group_wake/stats')).json())
    expect(counts).toEqual({ humans: 3, replies: 3, wakes: 3, runs: 3 })
    await app.screenshot('teacher-group-real-send-default-mention-reload')
  })
})
