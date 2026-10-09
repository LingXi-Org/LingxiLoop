import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'

test('platform administrator pauses a future routine and persists its state', {
  tags: ['admin', 'mutations', 'fixtures'],
  skip: process.env.E2E_ADMIN_FIXTURES !== '1' || process.env.E2E_MUTATIONS !== '1' || !process.env.E2E_USER_ADMIN_PASSWORD
    ? 'Requires a disposable future routine and platform administrator credentials.' : false,
}, async ({ app, screen, browser }) => {
  await app.open('/login')
  await screen.getByLabel('邮箱').fill(credentials.user('admin').username)
  await screen.getByLabel('密码').fill(credentials.user('admin').password)
  await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 60_000 })
  await screen.getByRole('button', '登录').tap()
  await expect(screen.getByRole('heading', '平台总览')).toBeVisible({ timeout: 60_000 })
  await app.open('/ai/agent-routines/e2e-admin-routine')
  await expect(screen.getByRole('heading', 'E2E Admin Routine')).toBeVisible()
  await screen.getByRole('button', '暂停例程', { exact: true }).tap()
  await screen.getByLabel('操作原因').fill('验证平台管理员暂停独立测试例程')
  await screen.getByRole('button', '暂停例程', { exact: true }).last().tap()
  await expect(screen.getByText('暂停例程成功', { exact: true })).toBeVisible()
  await browser.reload()
  await expect(screen.getByText('已暂停', { exact: true }).first()).toBeVisible()
  await expect(screen.getByRole('button', '暂停例程')).toHaveCount(0)
})
