import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test.describe('Public authentication', { tags: ['web', 'auth', 'public'] }, () => {
  test('signed-out visitors get labelled login fields and no open registration', async ({ app, screen, browser }) => {
    await app.open('/')
    await expect(screen.getByText('欢迎回来')).toBeVisible()
    await expect(screen.getByLabel('邮箱')).toBeVisible()
    await expect(screen.getByLabel('密码')).toBeVisible()
    await expect(screen.getByRole('tab', '注册')).toBeHidden()
    expect(await screen.getByLabel('邮箱').getAttribute('type')).toBe('email')
    expect(await browser.evaluate(() => document.querySelector('form')?.checkValidity() ?? true)).toBe(false)
    await app.screenshot('public-login')
  })

  test('password recovery returns to login without losing the entry point', async ({ app, screen }) => {
    await app.open('/')
    await screen.getByRole('button', '忘记密码？').tap()
    await expect(screen.getByText('找回密码')).toBeVisible()
    await expect(screen.getByLabel('邮箱')).toBeVisible()
    await expect(screen.getByRole('button', '发送重置邮件')).toBeVisible()
    await screen.getByRole('button', '返回登录').tap()
    await expect(screen.getByLabel('密码')).toBeVisible()
    await expect(screen.getByRole('button', '登录')).toBeVisible()
  })

  test('reset links reject an invalid token with a visible error', async ({ app, screen }) => {
    await app.open('/?mode=reset&token=e2e-invalid-reset-token')
    await expect(screen.getByText('设置新密码')).toBeVisible()
    await screen.getByLabel('新密码').fill('InvalidTokenCheck!2026')
    await screen.getByRole('button', '保存新密码').tap()
    await expect(screen.getByRole('alert')).toBeVisible()
    await expect(screen.getByText('设置新密码')).toBeVisible()
  })

  for (const path of ['/invite/e2e-invalid-invitation', '/invite/project/e2e-invalid-invitation', '/#invite=%25']) {
    test(`invalid invitation is explained instead of leaving a blank app: ${path}`, async ({ app, screen }) => {
      await app.open(path)
      await expect(screen.getByRole('heading', /该邀请链接无效|无法加载此邀请/)).toBeVisible()
      await expect(screen.getByRole('button', '使用邮箱继续')).toBeHidden()
    })
  }

  test('login and password recovery fit a phone viewport', async ({ app, screen, browser }) => {
    await browser.setViewport({ width: 390, height: 844 })
    await app.open('/')
    await expect(screen.getByLabel('邮箱')).toBeVisible()
    await screen.getByRole('button', '忘记密码？').tap()
    await expect(screen.getByRole('button', '返回登录')).toBeVisible()
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
