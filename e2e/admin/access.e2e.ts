import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'

test('an authenticated student cannot enter the management workspace', {
  tags: ['admin', 'auth', 'security'],
  skip: !process.env.E2E_USER_STUDENT_USERNAME || !process.env.E2E_USER_STUDENT_PASSWORD
    ? 'Set E2E_USER_STUDENT_USERNAME/PASSWORD for a real student without management permissions.'
    : false,
}, async ({ app, browser, screen }) => {
  await app.open('/login')
  await screen.getByLabel('邮箱').fill(credentials.user('student').username)
  await screen.getByLabel('密码').fill(credentials.user('student').password)
  await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 60_000 })
  await screen.getByRole('button', '登录').tap()
  await expect(browser).toHaveURL('/forbidden')
  await expect(screen.getByText('需要管理员权限')).toBeVisible()
  await app.open('/users')
  await expect(browser).toHaveURL('/forbidden')
  await expect(screen.getByRole('button', '退出管理后台')).toHaveCount(0)
})
