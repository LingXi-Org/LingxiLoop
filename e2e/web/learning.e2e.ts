import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

// Fresh sessions keep this multi-role journey from revoking other tests' saved sessions.
test('student completes a historical activity and teacher opens its persisted evidence', {
  skip: memberSession().skip ?? memberSession('student').skip ?? mutationPermission.skip,
  tags: ['web', 'learning', 'mutations'], timeout: 300_000,
}, async ({ app, screen, browser }) => {
  const activity = 'E2E Triangle explanation'
  const answer = `${testName('evidence')}: A triangle has three sides. A triangular road sign is one example.`
  const workspace = process.env.E2E_WORKSPACE_NAME ?? 'E2E Classroom'
  const signIn = async (role: 'member' | 'student') => {
    const user = credentials.user(role)
    await app.open('/?project=e2e-classroom')
    await screen.getByLabel('邮箱').fill(user.username)
    await screen.getByLabel('密码').fill(user.password)
    await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 45_000 })
    await screen.getByRole('button', '登录').tap()
    await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible({ timeout: 45_000 })
    await expect(screen.getByRole('button', '新建对话')).toBeVisible({ timeout: 45_000 })
    if (await screen.getByRole('button', `切换工作区：${workspace}`).count() === 0) {
      await screen.getByRole('button', /^切换工作区/).tap()
      await screen.getByRole('menuitem').filter({ hasText: workspace }).tap()
    }
    await expect(screen.getByRole('button', `切换工作区：${workspace}`)).toBeVisible()
  }
  const signOut = async () => {
    await screen.getByRole('button', '打开账户菜单').tap()
    await screen.getByRole('menuitem', '退出登录').tap()
    await expect.poll(() => browser.evaluate(async () => (await fetch('/api/session', { credentials: 'include' })).status)).toBe(401)
  }

  await signIn('student')
  await screen.getByRole('button', '论坛', { exact: true }).tap()
  await browser.locator('article').filter({ hasText: activity }).getByRole('button', '提交作业', { exact: true }).tap()
  const answerEditor = screen.getByRole('textbox', '作业内容')
  await expect(answerEditor).toBeEnabled()
  await answerEditor.fill(answer)
  await screen.getByRole('dialog').getByRole('button', '提交作业', { exact: true }).tap()
  await expect(screen.getByText('作业已提交', { exact: true })).toBeVisible()
  await browser.keyboard.press('Escape')
  await screen.getByRole('button', '学习概览').tap()
  await screen.getByRole('button', /^查看学习记录：/).tap()
  await expect(screen.getByText(answer, { exact: true })).toBeVisible()
  await browser.reload()
  await screen.getByRole('button', '学习概览').tap()
  await screen.getByRole('button', /^查看学习记录：/).tap()
  await expect(screen.getByText(answer, { exact: true })).toBeVisible()
  await browser.keyboard.press('Escape')
  await signOut()

  await signIn('member')
  await screen.getByRole('button', '学习概览').tap()
  await screen.getByRole('button', /^查看课程学生：/).tap()
  await screen.getByLabel('搜索全部学习者').fill(process.env.E2E_USER_STUDENT_USERNAME!)
  await screen.getByRole('row').filter({ hasText: process.env.E2E_USER_STUDENT_USERNAME! }).getByRole('button', '查看').tap()
  await browser.locator('[aria-labelledby="learner-attempts-title"] > div').filter({ hasText: activity }).first().getByRole('button', '查看证据').tap()
  await expect(screen.getByRole('dialog', activity)).toContainText(answer)
  await expect(screen.getByRole('dialog', activity)).toContainText('原始证据')
  await expect(screen.getByRole('dialog', activity)).toContainText('这条证据还没有评价记录。')
})
