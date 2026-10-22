import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

for (const scenario of ['replay', 'headers', 'snapshot', 'forbidden', 'missing', 'offline', 'failed', 'cancelled']) {
  test(`reply recovery: ${scenario}`, async ({ app, browser, screen }) => {
    await app.open(`/e2e/run-recovery/index.html?scenario=${scenario}`)
    await expect(screen.getByText('已经保存的回复正文。', { exact: true })).toBeVisible()
    const proof = screen.getByRole('status', '恢复证据')
    if (['replay', 'headers', 'snapshot'].includes(scenario)) await expect(proof).toContainText('"status":"complete"')
    if (scenario === 'forbidden') await expect(screen.getByText('你已无法访问此回复。', { exact: true })).toBeVisible()
    if (scenario === 'missing') await expect(screen.getByText('此回复已不可用，请重新发送消息。', { exact: true })).toBeVisible()
    if (scenario === 'offline') {
      await expect(screen.getByRole('button', '重新连接', { exact: true })).toBeVisible()
      await expect(proof).toContainText('"active":0')
      const before = await proof.textContent()
      await browser.evaluate(() => new Promise<boolean>(resolve => setTimeout(() => resolve(true), 1000)))
      expect(await proof.textContent()).toBe(before)
    }
    if (scenario === 'failed') await expect(screen.getByText('回复生成失败', { exact: true })).toBeVisible()
    if (scenario === 'cancelled') await expect(screen.getByText('已取消', { exact: true })).toBeVisible()
    await expect(proof).toContainText('"mutations":0')
    expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/连接任务失败|核对任务状态|状态待确认|已停止本地等待|Synthetic|handshake|503/)
    expect(await browser.locator('[data-agent-body]').count()).toBe(1)
    await app.screenshot(`run-recovery-${scenario}`)
  })
}
