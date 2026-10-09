import { test } from '@e2e-dev/web'
import { credentials, expect, type TestFixtures } from 'e2e'
import { adminFixtures as f } from './seed'

const enabled = process.env.E2E_ADMIN_FIXTURES === '1' && process.env.E2E_MUTATIONS === '1'
const available = (name: string) => enabled && Boolean(process.env[`E2E_USER_${name.toUpperCase()}_USERNAME`] && process.env[`E2E_USER_${name.toUpperCase()}_PASSWORD`])
const admin = available('admin') ? { session: 'admin-operations' } : { skip: 'Requires the dedicated local admin fixtures and mutation opt-in.' }
const manager = available('manager') ? { session: 'isolated-manager' } : { skip: 'Requires the dedicated local manager credentials, fixtures and mutation opt-in.' }

for (const [name, sessionName, heading] of [['admin', 'admin-operations', '平台总览'], ['manager', 'isolated-manager', /本公司概览/]] as const) {
  if (available(name)) test.setup(`authenticate ${sessionName}`, { sessions: [sessionName] }, async ({ app, screen, session }) => {
    await app.open('/login')
    await screen.getByLabel('邮箱').fill(credentials.user(name).username)
    await screen.getByLabel('密码').fill(credentials.user(name).password)
    await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 60_000 })
    await screen.getByRole('button', '登录').tap()
    await expect(screen.getByRole('heading', heading)).toBeVisible({ timeout: 60_000 })
    await session.save(sessionName)
  })
}

async function command(screen: TestFixtures['screen'], label: string) {
  await screen.getByRole('button', label, { exact: true }).tap()
  await screen.getByLabel('操作原因').fill(`端到端回归：${label}`)
  await screen.getByRole('button', label, { exact: true }).last().tap()
  await expect(screen.getByText(`${label}成功`, { exact: true })).toBeVisible()
}

test.describe('isolated platform operations', { ...admin, tags: ['admin', 'mutations', 'fixtures'] }, () => {
  test('a sacrificial account can be suspended and restored with persisted status', async ({ app, screen, browser }) => {
    await app.open(`/users/users/${f.account}`)
    await expect(screen.getByRole('heading', 'E2E lifecycle account')).toBeVisible()
    await command(screen, '停用账号')
    await browser.reload()
    await expect(screen.getByRole('button', '恢复账号')).toBeVisible()
    await command(screen, '恢复账号')
    await browser.reload()
    await expect(screen.getByRole('button', '停用账号')).toBeVisible()
  })

  test('project details link populated learning and content records before lifecycle commands', { timeout: 180_000 }, async ({ app, screen, browser }) => {
    await app.open(`/projects/projects/${f.project}`)
    await expect(screen.getByRole('heading', 'E2E Admin Lifecycle Project')).toBeVisible()
    await screen.getByRole('button', '学习', { exact: true }).tap()
    await expect(screen.getByRole('region', '课程记录表格')).toContainText('E2E Admin Lifecycle Project')
    await expect(screen.getByRole('link', '查看E2E Admin Lifecycle Project')).toHaveAttribute('href', `/projects/courses/${f.course}`)
    await screen.getByRole('button', '协作内容', { exact: true }).tap()
    await screen.getByRole('button', '文档', { exact: true }).tap()
    await screen.getByRole('link', '查看E2E Admin Document').tap()
    await expect(screen.getByRole('heading', 'E2E Admin Document')).toBeVisible()
    await expect(screen.getByRole('link', 'E2E Admin School').first()).toBeVisible()
    await app.open(`/projects/projects/${f.project}`)
    for (const [action, status] of [['激活', '有效'], ['结束', '课程结束'], ['进入只读', '只读'], ['归档', '已归档']]) {
      await command(screen, action)
      await browser.reload()
      await expect(screen.getByRole('heading', 'E2E Admin Lifecycle Project')).toBeVisible()
      await expect(screen.getByText(status, { exact: true }).first()).toBeVisible()
    }
  })

  test('company read-only and archive commands respect prepared lifecycle states', async ({ app, screen, browser }) => {
    for (const [company, action, status] of [['e2e-admin-grace', '进入只读', '只读'], ['e2e-admin-retention', '归档', '已归档']]) {
      await app.open(`/organizations/companies/${company}`)
      await command(screen, action)
      await browser.reload()
      await expect(screen.getByText(status, { exact: true }).first()).toBeVisible()
    }
  })

  test('record pagination preserves search and returns to the first page', async ({ app, screen, browser }) => {
    await app.open('/users?search=E2E%20Pagination')
    await expect(screen.getByText('共 21 条', { exact: true })).toBeVisible()
    await expect(screen.getByRole('row')).toHaveCount(21)
    await screen.getByRole('button', '下一页').tap()
    await expect(screen.getByRole('row')).toHaveCount(2)
    await expect(browser).toHaveURL(/cursor=/)
    await expect(screen.getByLabel('搜索用户')).toHaveValue('E2E Pagination')
    await screen.getByRole('button', '上一页').tap()
    await expect(screen.getByRole('row')).toHaveCount(21)
    await expect(screen.getByRole('button', '上一页')).toBeDisabled()
  })

  test('phone navigation is keyboard accessible without horizontal page overflow', async ({ app, screen, browser }) => {
    await browser.setViewport({ width: 390, height: 844 })
    await app.open('/users')
    const trigger = screen.getByRole('button', '展开或收起侧边栏').last()
    await trigger.focus()
    await browser.keyboard.press('Enter')
    await expect(screen.getByRole('dialog', '主导航')).toBeVisible()
    await screen.getByRole('link', '组织', { exact: true }).focus()
    await browser.keyboard.press('Enter')
    await browser.keyboard.press('Escape')
    await expect(screen.getByRole('dialog', '主导航')).toHaveCount(0)
    await expect(screen.getByRole('heading', '组织')).toBeVisible()
    await expect(trigger).toBeFocused()
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})

test.describe('isolated company member management', { ...manager, tags: ['admin', 'mutations', 'fixtures'] }, () => {
  test('the final administrator cannot revoke their own management role or remove themselves', async ({ app, screen, browser }) => {
    await app.open('/members')
    const ownRow = screen.getByRole('listitem').filter({ hasText: credentials.user('manager').username })
    for (const action of ['撤销管理权限', '移除成员']) {
      await ownRow.getByRole('button', action).tap()
      await screen.getByRole('button', action === '移除成员' ? '移除成员' : '确认', { exact: true }).last().tap()
      await expect(screen.getByRole('alert')).toBeVisible()
      await browser.reload()
      await expect(ownRow.getByRole('button', '撤销管理权限')).toBeVisible()
    }
  })

  test('a teacher can receive and lose admin rights, then be removed', async ({ app, screen, browser }) => {
    await app.open('/members')
    const member = screen.getByRole('listitem').filter({ hasText: 'removable@e2e.lingxiloop.test' })
    await member.getByRole('button', '授予管理权限').tap()
    await screen.getByRole('button', '确认', { exact: true }).tap()
    await expect(member.getByRole('button', '撤销管理权限')).toBeVisible()
    await member.getByRole('button', '撤销管理权限').tap()
    await screen.getByRole('button', '确认', { exact: true }).tap()
    await expect(member.getByRole('button', '授予管理权限')).toBeVisible()
    await member.getByRole('button', '移除成员').tap()
    await screen.getByRole('button', '移除成员', { exact: true }).last().tap()
    await expect(member).toHaveCount(0)
    await browser.reload()
    await expect(member).toHaveCount(0)
    await expect(screen.getByRole('listitem').filter({ hasText: credentials.user('manager').username })).toBeVisible()
  })

  test('cross-company record links do not expose another organization', async ({ app, screen, browser }) => {
    await app.open('/organizations/companies/e2e-school')
    await expect(screen.getByRole('alert')).toBeVisible()
    await expect(screen.getByRole('heading', 'E2E School', { exact: true })).toHaveCount(0)
    await app.open(`/organizations/companies/${f.company}`)
    await expect(screen.getByRole('heading', 'E2E Admin School')).toBeVisible()
    await expect(browser).toHaveURL(`/organizations/companies/${f.company}`)
  })
})
