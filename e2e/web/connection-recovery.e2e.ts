import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Written before the fix. The local fault proxy forwards ordinary product
// requests to real PostgreSQL/WuKongIM; it never fulfills browser routes.
// Failure modes: lost acceptance reply, failed boot with no later wake-up,
// parallel drains, revoked sends, A → B → A resurrecting an old request,
// silent/midstream SSE loss retaining a spinner, and lost attachments/drafts.
test.describe('Connection recovery', { tags: ['connection-recovery'], timeout: 150_000,
  ...(process.env.E2E_CONNECTION_RECOVERY === '1' ? {} : { skip: 'Requires e2e/connection-recovery-server.mjs.' }),
}, () => {
  for (const wake of ['backoff', 'online', 'hello', 'im']) {
    test(`failed boot drains on ${wake} without a reload`, async ({ app, browser, screen }) => {
      await app.open(`/e2e/connection-recovery.html?wake=${wake}`)
      await expect(screen.getByRole('heading', '断线恢复验收')).toBeVisible()
      await expect(browser.locator('#facts')).toContainText('"statusReads":1')
      await browser.locator('[contenteditable="true"]').fill('尚未发送的草稿')
      await screen.getByRole('button', '恢复服务').tap()
      await expect(browser.locator('#facts')).toContainText('"outbox":0', { timeout: 30_000 })
      await expect(browser.locator('#facts')).toContainText('"uniqueMessages":1')
      await expect(browser.locator('#facts')).toContainText('"maxConcurrent":1')
      await expect(browser.locator('#facts')).toContainText('"attachmentCount":1')
      await expect(browser.locator('[contenteditable="true"]')).toContainText('尚未发送的草稿')
      await app.screenshot(`recovery-boot-${wake}`)
    })
  }
  test('accepted response loss reconciles the same nonce and permits a new send', async ({ app, browser, screen }) => {
    await app.open('/e2e/connection-recovery.html?mode=lost-reply')
    await screen.getByRole('button', '发送测试消息').tap()
    await expect(browser.locator('#facts')).toContainText('"outbox":0', { timeout: 30_000 })
    await expect(browser.locator('#facts')).toContainText('"uniqueMessages":1')
    await expect(browser.locator('#facts')).toContainText('"accepts":1')
    await screen.getByRole('button', '发送新消息').tap()
    await expect(browser.locator('#facts')).toContainText('"uniqueMessages":2')
    await app.screenshot('recovery-lost-acceptance-reply')
  })
  test('accepted sequence zero is retained for reconciliation without another dispatch', async ({ app, browser, screen }) => {
    await app.open('/e2e/connection-recovery.html?mode=invalid-receipt')
    await screen.getByRole('button', '发送测试消息').tap()
    await expect(browser.locator('#facts')).toContainText('"uniqueMessages":1')
    await expect(browser.locator('#facts')).toContainText('"outbox":1')
    await expect(browser.locator('#facts')).toContainText('"accepts":1')
    await screen.getByRole('button', '恢复服务').tap()
    await expect(browser.locator('#facts')).toContainText('"outbox":0')
    await expect(browser.locator('#facts')).toContainText('"accepts":1')
    await app.screenshot('recovery-invalid-receipt')
  })
  for (const status of [401, 403, 404]) {
    test(`permanent ${status} stops automatic sends and retains manual actions`, async ({ app, browser, screen }) => {
      await app.open(`/e2e/connection-recovery.html?mode=denied&status=${status}`)
      await screen.getByRole('button', '发送测试消息').tap()
      await expect(browser.locator('#facts')).toContainText('"blocked":1')
      await screen.getByRole('button', '恢复服务').tap()
      await expect(browser.locator('#facts')).toContainText('"accepts":1')
      await expect(browser.locator('#facts')).toContainText('"outbox":1')
      await screen.getByRole('button', '手动重试').tap()
      await expect(browser.locator('#facts')).toContainText('"outbox":0')
      await expect(browser.locator('#facts')).toContainText('"uniqueMessages":1')
      await app.screenshot(`recovery-denied-${status}`)
    })
  }
  test('rapid identity A → B → A cancels old drains and never replays in B', async ({ app, browser, screen }) => {
    await app.open('/e2e/connection-recovery.html?mode=identity')
    await expect(browser.locator('#facts')).toContainText('"statusReads":1')
    await screen.getByRole('button', '快速切换身份').tap()
    await screen.getByRole('button', '恢复服务').tap()
    await expect(browser.locator('#facts')).toContainText('"outbox":0', { timeout: 30_000 })
    await expect(browser.locator('#facts')).toContainText('"crossIdentity":0')
    await expect(browser.locator('#facts')).toContainText('"uniqueMessages":1')
    await app.screenshot('recovery-identity-generations')
  })
  for (const mode of ['sse-cut', 'sse-silent', 'sse-offline']) {
    test(`${mode} reconciles authority without creating another work item`, async ({ app, browser, screen }) => {
      await app.open(`/e2e/connection-recovery.html?mode=${mode}`)
      await expect(browser.locator('#facts')).toContainText('"activeRuns":1')
      await screen.getByRole('button', '中断运行连接').tap()
      await expect(screen.getByText('连接中断，状态待确认。', { exact: true })).toBeVisible({ timeout: 30_000 })
      if (mode === 'sse-offline') {
        await expect(browser.locator('#facts')).toContainText('"activeRuns":0', { timeout: 90_000 })
        await expect(browser.locator('#facts')).toContainText('"remoteLifecycle":"queued"')
        await app.screenshot('recovery-local-wait-released')
      }
      await screen.getByRole('button', '结束远端任务并恢复服务').tap()
      await expect(browser.locator('#facts')).toContainText('"remoteLifecycle":"failed"', { timeout: 30_000 })
      await expect(browser.locator('#facts')).toContainText('"activeRuns":0', { timeout: 30_000 })
      await expect(browser.locator('#facts')).toContainText('"localLifecycle":"failed"', { timeout: 30_000 })
      await expect(browser.locator('#facts')).toContainText('"workItems":1')
      await browser.locator('[contenteditable="true"]').fill('恢复后仍然可以继续对话。')
      await browser.locator('[contenteditable="true"]').press('Enter')
      await expect(browser.locator('#facts')).toContainText('"uniqueMessages":1')
      await app.screenshot(`recovery-${mode}-terminal`)
    })
  }
})
