import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('admin login exposes labelled credentials and password recovery', { tags: ['admin', 'public', 'auth'] }, async ({ app, screen }) => {
  await app.open('/login')
  await expect(screen.getByLabel('邮箱')).toBeVisible()
  await expect(screen.getByLabel('密码')).toBeVisible()
  await expect(screen.getByRole('button', '创建账号')).toHaveCount(0)
  await screen.getByRole('button', '忘记密码？').tap()
  await expect(screen.getByText('找回密码')).toBeVisible()
  await expect(screen.getByLabel('邮箱')).toBeVisible()
  await expect(screen.getByRole('button', '发送重置邮件')).toBeVisible()
  await screen.getByRole('button', '返回登录').tap()
  await expect(screen.getByLabel('密码')).toBeVisible()
})

test('admin reset link exposes the new-password form', { tags: ['admin', 'public', 'auth'] }, async ({ app, screen }) => {
  await app.open('/login?mode=reset&token=invalid-e2e-token')
  await expect(screen.getByLabel('新密码')).toBeVisible()
  await expect(screen.getByText('新密码至少需要 8 个字符。')).toBeVisible()
})

test('admin forbidden page returns to sign in', { tags: ['admin', 'public', 'auth'] }, async ({ app, screen, browser }) => {
  await app.open('/forbidden')
  await expect(screen.getByText('需要管理员权限')).toBeVisible()
  await screen.getByRole('button', '返回登录').tap()
  await expect(browser).toHaveURL('/login')
  await expect(screen.getByLabel('邮箱')).toBeVisible()
})

for (const path of ['/', '/users', '/organizations', '/projects', '/ai', '/system', '/members', '/organizations/new']) {
  test(`anonymous admin route ${path} requires sign in`, { tags: ['admin', 'auth', 'control'] }, async ({ app, browser, screen }) => {
    await app.open(path)
    await expect(browser).toHaveURL(/\/login(?:\?|$)/)
    await expect(screen.getByLabel('邮箱')).toBeVisible()
    await expect(screen.getByRole('button', '退出管理后台')).toHaveCount(0)
  })
}

test('control routes reject anonymous callers before reaching business services', { tags: ['admin', 'control', 'security'] }, async ({ app }) => {
  for (const path of ['/api/control/management-session', '/api/control/auth-settings', '/api/control/platform/resources/users', '/api/control/company/resources/projects']) {
    const response = await fetch(new URL(path, app.baseUrl))
    expect(response.status, path).toBe(401)
    expect(await response.json()).toEqual({ error: 'authentication required' })
  }
  for (const path of ['/api/admin/users', '/api/admin-company/resources/users', '/api/internal/registration/provision']) {
    const response = await fetch(new URL(path, app.baseUrl))
    expect(response.status, path).toBe(403)
    expect(await response.json()).toEqual({ error: 'internal service route' })
  }
})

test('control accepts the configured local browser origin and rejects untrusted origins', { tags: ['admin', 'control', 'security', 'local-origin'] }, async ({ app }) => {
  for (const [origin, status] of [[new URL('/', app.baseUrl).origin, 200], ['http://untrusted.invalid', 403], ['http://127.0.0.1:4444', 403]] as const) {
    const response = await fetch(new URL('/api/auth/sign-out', app.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, cookie: 'better-auth.session_token=invalid-e2e-token' },
      body: '{}',
    })
    expect(response.status, origin).toBe(status)
  }
})
