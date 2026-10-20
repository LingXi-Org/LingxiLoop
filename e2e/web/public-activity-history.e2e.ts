import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Failure model: issue-215-public/FAILURE-MODEL.md. Actual product component
// tree with synthetic authorized page responses; Worker/SQL owning test is separate.
test.describe('Public activity history', {
  ...(process.env.E2E_MEMORY_PRIVACY_FIXTURE === '1' ? {} : { skip: 'Requires the isolated component fixture.' }),
}, () => {
  test('a changed attention history resets the old offset without hiding current explanation or answer', async ({ app, screen }) => {
    await app.open('/e2e/run-activity.html?mode=pending&public=1&paged=1')
    await screen.getByRole('button','查看需要注意的记录（110 条）',{ exact: true }).tap()
    await screen.getByRole('button','下一页活动',{ exact: true }).tap()
    await expect(screen.getByText('活动记录 · 41–80 / 110',{ exact: true })).toBeVisible()
    await screen.getByRole('button','失败',{ exact: true }).tap()
    await expect(screen.getByText('活动记录 · 1–40 / 110',{ exact: true })).toBeVisible()
    await expect(screen.getByText('已经核对条件，接下来检查资料。',{ exact: true })).toBeVisible()
    await expect(screen.getByText('最终答复始终可见。',{ exact: true })).toBeVisible()
    await app.screenshot('public-attention-history-reset')
  })
  test('the captured Worker final answer appears once while its durable source remains in history', async ({ app, screen }) => {
    await app.open('/e2e/run-activity.html?mode=complete&captured=1')
    await expect(screen.getByText('真实 Worker 合成输出已加载',{ exact: true })).toBeVisible()
    // The actual product component must resolve a unique visible final answer.
    await expect(screen.getByText('The inspection is complete.',{ exact: true })).toBeVisible()
    await expect(screen.getByText('I will inspect the available files.',{ exact: true })).toBeVisible()
    await app.screenshot('captured-worker-final-answer-once')
    await screen.getByRole('button','查看全部活动（3 条）',{ exact: true }).tap()
    await expect(screen.getByText('活动记录 · 1–3 / 3',{ exact: true })).toBeVisible()
    await expect(screen.getByRole('button','收起活动记录',{ exact: true })).toBeVisible()
    await app.screenshot('captured-worker-final-prefix-history')
  })
})
