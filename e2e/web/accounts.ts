import type { Browser } from '@e2e-dev/web'
import { credentials, expect, type TestFixtures } from 'e2e'

type AccountBrowser = Pick<TestFixtures, 'app' | 'screen'> & { browser: Browser }

export async function signIn({ app, screen }: AccountBrowser, role: 'member' | 'student') {
  const user = credentials.user(role)
  await app.open('/')
  await screen.getByLabel('邮箱').fill(user.username)
  await screen.getByLabel('密码').fill(user.password)
  await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 45_000 })
  await screen.getByRole('button', '登录').tap()
  await expect(screen.getByRole('button', '新建对话')).toBeVisible({ timeout: 45_000 })
}

export async function signOut({ screen, browser }: AccountBrowser) {
  await screen.getByRole('button', '打开账户菜单').tap()
  await screen.getByRole('menuitem', '退出登录').tap()
  await expect.poll(() => browser.evaluate(async () => (await fetch('/api/session', { credentials: 'include' })).status)).toBe(401)
}

export async function selectWorkspace({ screen }: AccountBrowser, name: string) {
  if (await screen.getByRole('button', `切换工作区：${name}`).count() === 0) {
    await screen.getByRole('button', /^切换工作区/).tap()
    await screen.getByRole('menuitem').filter({ hasText: name }).tap()
  }
  await expect(screen.getByRole('button', `切换工作区：${name}`)).toBeVisible()
}
