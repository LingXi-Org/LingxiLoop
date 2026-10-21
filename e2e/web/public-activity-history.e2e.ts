import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: issue-215-public/FAILURE-MODEL.md. Actual product component
// tree with synthetic authorized snapshots; Worker/SQL owning test is separate.
test.describe('Public activity history', {
  ...(process.env.E2E_MEMORY_PRIVACY_FIXTURE === '1' ? {} : { skip: 'Requires the isolated component fixture.' }),
}, () => {
  test('legacy attention counts do not hide current explanation, decisions or answer', async ({ app, screen, browser }) => {
    await app.open('/e2e/run-activity.html?mode=pending&public=1&paged=1')
    await browser.locator('[data-slot="run-activity"] button').first().tap()
    await expect(screen.getByText('等待有权限的成员审批。', { exact: true })).toBeVisible()
    await screen.getByRole('button', '失败', { exact: true }).tap()
    await expect(screen.getByText('这一步未完成，请重试。', { exact: true })).toBeVisible()
    await expect(screen.getByText('已经核对条件，接下来检查资料。', { exact: true })).toBeVisible()
    await expect(screen.getByText('最终答复始终可见。', { exact: true })).toBeVisible()
    expect(await browser.evaluate(() => document.body.textContent)).not.toMatch(/查看全部活动|查看需要注意的记录/)
    await app.screenshot('public-attention-without-aggregation')
  })
  test('the captured Worker final answer appears once with its earlier public explanation', async ({ app, screen, browser }) => {
    await app.open('/e2e/run-activity.html?mode=complete&captured=1')
    await expect(screen.getByText('真实 Worker 合成输出已加载',{ exact: true })).toBeVisible()
    // The actual product component must resolve a unique visible final answer.
    await expect(screen.getByText('The inspection is complete.',{ exact: true })).toBeVisible()
    await browser.locator('[data-slot="run-activity"] button').first().tap()
    await expect(screen.getByText('I will inspect the available files.',{ exact: true })).toBeVisible()
    await app.screenshot('captured-worker-final-answer-once')

  })
})
