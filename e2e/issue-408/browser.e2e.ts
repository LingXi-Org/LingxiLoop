import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('sender identity and unmodified first-person text survive durable replay', async ({ app, browser, screen }) => {
  await app.open('/e2e/issue-408/index.html')
  await expect(screen.getByRole('heading', '身份边界合成验收')).toBeVisible()
  const checks = [
    ['trace-intro', '溯源', '我是溯源'], ['nova-plan', '司南', '我是司南'],
    ['milo-practice', '砺思', '我是砺思'], ['milo-wrong-body', '砺思', '我（溯源）'],
  ]
  async function checkRows() {
    for (const [id, sender, body] of checks) {
      const row = browser.locator(`[data-msg-id="${id}"]`)
      await expect(row.getByText(sender, { exact: true })).toBeVisible()
      await expect(row).toContainText(body)
    }
  }
  await checkRows()
  await screen.getByRole('button', '回放持久消息').tap()
  await checkRows()
  await app.screenshot('synthetic-identity-sender-and-body-replay')
})
