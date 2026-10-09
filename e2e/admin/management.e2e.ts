import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { ADMIN_RESOURCES } from '../../admin/src/resources'
import { recordPath } from '../../admin/src/workspace-model'

const hasAccount = (name: string) => Boolean(process.env[`E2E_USER_${name.toUpperCase()}_USERNAME`] && process.env[`E2E_USER_${name.toUpperCase()}_PASSWORD`])
const platform = hasAccount('admin') ? { session: 'platform-admin' } : { skip: 'Set E2E_USER_ADMIN_USERNAME/PASSWORD for a real platform administrator.' }
const company = hasAccount('member') ? { session: 'company-admin' } : { skip: 'Set E2E_USER_MEMBER_USERNAME/PASSWORD for a real company administrator.' }
const mutations = process.env.E2E_MUTATIONS === '1'

for (const [account, sessionName, heading] of [['admin', 'platform-admin', '平台总览'], ['member', 'company-admin', /本公司概览/]] as const) {
  if (hasAccount(account)) test.setup(`authenticate ${sessionName} through the real control plane`, { sessions: [sessionName] }, async ({ app, screen, session }) => {
    await app.open('/login')
    await screen.getByLabel('邮箱').fill(credentials.user(account).username)
    await screen.getByLabel('密码').fill(credentials.user(account).password)
    await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 60_000 })
    await screen.getByRole('button', '登录').tap()
    await expect(screen.getByRole('heading', heading)).toBeVisible({ timeout: 60_000 })
    await session.save(sessionName)
  })
}

test.describe('platform administration', { ...platform, tags: ['admin', 'platform'] }, () => {
  test('dashboard links lead to operational records', async ({ app, screen, browser }) => {
    await app.open('/')
    await expect(screen.getByRole('heading', '平台总览')).toBeVisible()
    await expect(screen.getByRole('region', '平台概况')).toBeVisible()
    await screen.getByRole('link', '查看失败运行').tap()
    await expect(browser).toHaveURL(/\/ai\/agent-runs\?status=failed&period=24h/)
    await expect(screen.getByLabel('状态筛选')).toHaveValue('failed')
    await expect(screen.getByText('过去 24 小时创建的运行')).toBeVisible()
  })

  for (const resource of ADMIN_RESOURCES) {
    test(`${resource.name}: browse real records and refresh`, async ({ app, screen }) => {
      await app.open(recordPath(resource.name))
      await expect(screen.getByText(`${resource.label}记录`, { exact: true })).toBeVisible()
      await expect(screen.getByRole('button', '刷新')).toBeEnabled()
      await expect(screen.getByRole('alert')).toHaveCount(0)
      await expect(screen.getByText(/^(共 \d+ 条|\d+ 条记录)$/)).toBeVisible()
      await screen.getByRole('button', '刷新').tap()
      await expect(screen.getByRole('button', '刷新')).toBeEnabled()
      await expect(screen.getByRole('alert')).toHaveCount(0)
    })
  }

  test('user filters survive detail navigation and clear correctly', async ({ app, screen, browser }) => {
    await app.open('/users')
    await screen.getByLabel('搜索用户').fill(credentials.user('admin').username)
    await screen.getByLabel('搜索用户').press('Enter')
    await screen.getByLabel('状态筛选').selectOption({ value: 'active' })
    await screen.getByLabel('排序').selectOption({ value: 'oldest' })
    await expect(screen.getByRole('region', '用户记录表格')).toContainText(credentials.user('admin').username)
    await screen.getByRole('link', /^查看/).first().tap()
    await expect(screen.getByRole('navigation', '详情分区')).toBeVisible()
    await screen.getByRole('link', '返回用户').tap()
    await expect(screen.getByLabel('搜索用户')).toHaveValue(credentials.user('admin').username)
    await expect(screen.getByLabel('排序')).toHaveValue('oldest')
    await expect(browser).toHaveURL(/status=active/)
    await screen.getByLabel('搜索用户').fill(`missing-${Date.now()}`)
    await screen.getByLabel('搜索用户').press('Enter')
    await expect(screen.getByText('没有符合条件的记录')).toBeVisible()
    await screen.getByRole('button', '清除筛选', { exact: true }).tap()
    await expect(screen.getByLabel('搜索用户')).toHaveValue('')
    await expect(screen.getByLabel('状态筛选')).toHaveValue('')
    await expect(screen.getByRole('region', '用户记录表格')).toBeVisible()
  })

  test('global search opens the matching user', async ({ app, screen }) => {
    await app.open('/')
    await screen.getByLabel('全局搜索').fill(credentials.user('admin').username)
    await screen.getByLabel('全局搜索').press('Enter')
    await expect(screen.getByRole('heading', `搜索“${credentials.user('admin').username}”`)).toBeVisible()
    await screen.getByRole('link').filter({ hasText: credentials.user('admin').username }).last().tap()
    await expect(screen.getByRole('navigation', '详情分区')).toBeVisible()
  })

  test('legacy resource links preserve filters', async ({ app, screen, browser }) => {
    await app.open('/resources/users?status=suspended')
    await expect(browser).toHaveURL('/users?status=suspended')
    await expect(screen.getByLabel('状态筛选')).toHaveValue('suspended')
  })

  test('identity settings can be saved with an audit reason', async ({ app, screen, browser }) => {
    test.skip(!mutations, 'Set E2E_MUTATIONS=1 only for a disposable test environment.')
    await app.open('/system?tab=authentication')
    await expect(screen.getByRole('heading', '身份与安全')).toBeVisible()
    await expect(screen.getByLabel('会话有效期（秒）')).toBeVisible()
    const existing = await screen.getByLabel('会话有效期（秒）').inputValue()
    const updated = existing === '604800' ? '604860' : '604800'
    try {
      await screen.getByLabel('会话有效期（秒）').fill(updated)
      await screen.getByRole('button', '保存更改').tap()
      await screen.getByLabel('变更原因').fill('验证中文审计原因与身份配置保存')
      await screen.getByRole('button', '保存配置').tap()
      await expect(screen.getByText('身份认证配置已更新')).toBeVisible()
      await browser.reload()
      await expect(screen.getByLabel('会话有效期（秒）')).toHaveValue(updated)
    } finally {
      await screen.getByLabel('会话有效期（秒）').fill(existing)
      await screen.getByRole('button', '保存更改').tap()
      await screen.getByLabel('变更原因').fill('恢复回归验证前的会话有效期')
      await screen.getByRole('button', '保存配置').tap()
      await expect(screen.getByText('身份认证配置已更新')).toBeVisible()
      await browser.reload()
      await expect(screen.getByLabel('会话有效期（秒）')).toHaveValue(existing)
    }
  })

  test('education onboarding creates an organization and administrator invitation', async ({ app, screen }) => {
    test.skip(!mutations, 'Set E2E_MUTATIONS=1 only for a disposable test environment.')
    const suffix = Date.now().toString(36)
    const name = `E2E School ${suffix}`
    await app.open('/organizations/new')
    await screen.getByLabel('公司名称').fill(name)
    await screen.getByLabel('公司标识').fill(`e2e-school-${suffix}`)
    await screen.getByLabel('首位管理员邮箱').fill(`teacher-${suffix}@e2e.lingxiloop.test`)
    await screen.getByLabel('席位数').fill('10')
    await screen.getByLabel('合同开始').fill(new Date().toISOString().slice(0, 10))
    await screen.getByLabel('合同结束').fill(new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10))
    await screen.getByRole('button', '创建公司并生成邀请').tap()
    await expect(screen.getByLabel('管理员邀请链接')).toHaveValue(/\/invite\/.+/)
    await expect(screen.getByRole('button', '创建公司并生成邀请')).toBeDisabled()
    await screen.getByRole('link', '查看组织详情').tap()
    await expect(screen.getByRole('heading', name)).toBeVisible()
    await screen.getByRole('button', '激活', { exact: true }).tap()
    await screen.getByLabel('操作原因').fill('E2E activates its newly created education organization')
    await screen.getByRole('button', '激活', { exact: true }).last().tap()
    await expect(screen.getByText('激活成功', { exact: true })).toBeVisible()
    await expect(screen.getByRole('heading', name)).toBeVisible()
    await screen.getByRole('button', '合同与治理').tap()
    await expect(screen.getByRole('region', '教育合同记录表格')).toBeVisible()
    await expect(screen.getByRole('alert')).toHaveCount(0)
  })

  test('theme preference survives reload and logout removes access', async ({ app, screen, browser }) => {
    await app.open('/')
    await screen.getByRole('button', '切换深色模式').tap()
    await browser.reload()
    await expect(screen.getByRole('button', '切换浅色模式')).toBeVisible()
    await screen.getByRole('button', '退出管理后台').tap()
    await screen.getByRole('button', '退出', { exact: true }).tap()
    await expect(browser).toHaveURL('/login')
    await app.open('/users')
    await expect(screen.getByLabel('邮箱')).toBeVisible()
  })
})

test.describe('company administration', { ...company, tags: ['admin', 'company'] }, () => {
  test('company dashboard, members, company profile and usage are available', async ({ app, screen }) => {
    await app.open('/')
    await expect(screen.getByRole('heading', /本公司概览/)).toBeVisible()
    await screen.getByRole('link', '成员', { exact: true }).tap()
    await expect(screen.getByRole('heading', '公司成员')).toBeVisible()
    await expect(screen.getByRole('listitem').filter({ hasText: credentials.user('member').username })).toBeVisible()
    await app.open('/')
    await screen.getByRole('link', '查看公司资料').tap()
    await expect(screen.getByRole('heading', '编辑公司资料')).toBeVisible()
    await app.open('/ai')
    await expect(screen.getByRole('button', '公司用量')).toBeVisible()
    await expect(screen.getByText('调用次数')).toBeVisible()
  })

  for (const path of ['/system', '/organizations/new', '/authentication', '/status', '/education']) {
    test(`company admin cannot open platform-only ${path}`, async ({ app, screen }) => {
      await app.open(path)
      await expect(screen.getByText('需要管理员权限')).toBeVisible()
    })
  }

  test('company profile saves and a teacher invitation is generated without sending mail', async ({ app, screen, browser }) => {
    test.skip(!mutations, 'Set E2E_MUTATIONS=1 only for a disposable test environment.')
    await app.open('/')
    await screen.getByRole('link', '查看公司资料').tap()
    await expect(screen.getByLabel('公司简介')).toBeVisible()
    const original = await screen.getByLabel('公司简介').inputValue()
    const description = `E2E profile ${Date.now()}`
    try {
      await screen.getByLabel('公司简介').fill(description)
      await screen.getByRole('button', '保存资料').tap()
      await expect(screen.getByRole('button', '保存资料')).toBeEnabled()
      await browser.reload()
      await expect(screen.getByLabel('公司简介')).toHaveValue(description)
    } finally {
      await screen.getByLabel('公司简介').fill(original)
      await screen.getByRole('button', '保存资料').tap()
      await expect(screen.getByRole('button', '保存资料')).toBeEnabled()
      await browser.reload()
      await expect(screen.getByLabel('公司简介')).toHaveValue(original)
    }
    await screen.getByRole('link', '管理成员与邀请').tap()
    await screen.getByLabel('教师邮箱').fill(`invited-${Date.now()}@e2e.lingxiloop.test`)
    await screen.getByRole('button', '邀请教师').tap()
    await expect(screen.getByLabel('邀请链接')).toHaveValue(/\/invite\/.+/)
  })
})
