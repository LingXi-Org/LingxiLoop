import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'

for (const role of ['member', 'student'] as const) {
  const prefix = `E2E_USER_${role.toUpperCase()}`
  if (!process.env[`${prefix}_USERNAME`] || !process.env[`${prefix}_PASSWORD`]) continue

  test.setup(`sign in as ${role}`, { sessions: [`web-${role}`], tags: ['web', 'auth'] }, async ({ app, screen, session }) => {
    const user = credentials.user(role)
    await app.open('/')
    await screen.getByLabel('邮箱').fill(user.username)
    await screen.getByLabel('密码').fill(user.password)
    await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 45_000 })
    await screen.getByRole('button', '登录').tap()
    await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible({ timeout: 45_000 })
    await expect(screen.getByRole('button', '新建对话')).toBeVisible({ timeout: 45_000 })
    const workspace = process.env.E2E_WORKSPACE_NAME ?? 'E2E Classroom'
    if (await screen.getByRole('button', `切换工作区：${workspace}`).count() === 0) {
      await screen.getByRole('button', /^切换工作区/).tap()
      await screen.getByRole('menuitem').filter({ hasText: workspace }).tap()
    }
    await expect(screen.getByRole('button', `切换工作区：${workspace}`)).toBeVisible()
    await expect(screen.getByRole('button', '新建对话')).toBeVisible({ timeout: 45_000 })
    await session.save(`web-${role}`)
  })
}
