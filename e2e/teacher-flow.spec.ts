import { expect, test } from '@playwright/test'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await page.route('**/api/im/approvals/**', async (route) => {
    const supersede = route.request().url().endsWith('/supersede')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(supersede
        ? { approvalId: 'replacement-e2e', supersedesApprovalId: 'modify-approval' }
        : { ok: true, approved: true, result: { persisted: true }, error: null }),
    })
  })
  await page.goto('/e2e/teacher-flow.html', { waitUntil: 'domcontentloaded', timeout: 90_000 })
  await page.getByRole('button', { name: '进入 Project' }).click()
})

test('teacher Project exposes Briefing, Attention and Evidence without generic chat creation', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Retrieval Studio' })).toBeVisible()
  await expect(page.locator('[data-teacher-message="briefing"]')).toContainText('教学简报')

  await page.getByRole('button', { name: '需要关注' }).click()
  await expect(page.getByText('关注事项 1')).toBeVisible()

  await page.getByRole('button', { name: '查看简报依据' }).click()
  await expect(page.getByRole('heading', { name: '简报依据' })).toBeVisible()
  await page.getByRole('tab', { name: 'Attention' }).click()
  await expect(page.getByText('attention-e2e-1')).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(page.getByRole('button', { name: /新建群聊|发起私聊|New group|Direct message/i })).toHaveCount(0)
})

test('teacher can modify, approve and reject through AlertDialog and Toast lifecycles', async ({ page }) => {
  const modify = page.getByTestId('modify-approval')
  await modify.getByRole('button', { name: '修改' }).click()
  await expect(page.getByRole('heading', { name: '修改审批' })).toBeVisible()
  await page.getByLabel('摘要').fill('修改后的学习评价建议')
  await page.getByRole('button', { name: '提交修改' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('提交修改后的审批？')
  await page.getByRole('button', { name: '创建新审批' }).click()
  await expect(page.getByText('已创建新的待审批任务')).toBeVisible()

  const approve = page.getByTestId('approve-approval')
  await approve.getByRole('button', { name: '批准' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('批准并执行这项任务？')
  await page.getByRole('button', { name: '批准并执行' }).click()
  await expect(page.getByText('任务已批准并触发')).toBeVisible()

  const reject = page.getByTestId('reject-approval')
  await reject.getByRole('button', { name: '拒绝' }).click()
  await expect(page.getByRole('alertdialog')).toContainText('拒绝这项任务？')
  await page.getByRole('button', { name: '确认拒绝' }).click()
  await expect(page.getByText('任务已拒绝，未触发执行')).toBeVisible()
  await expect(page.getByLabel('审批回执')).toContainText('approve-approval:approved')
  await expect(page.getByLabel('审批回执')).toContainText('reject-approval:denied')
})

test('unsupported Enterprise provider cards remain disabled', async ({ page }) => {
  const cards = page.locator('[data-capability]')
  await expect(cards).toHaveCount(4)
  await expect(cards.getByText('暂不支持')).toHaveCount(4)
  for (const button of await cards.getByRole('button').all()) await expect(button).toBeDisabled()
})
