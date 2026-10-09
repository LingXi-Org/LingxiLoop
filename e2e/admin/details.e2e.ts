import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { adminFixtures as f } from './seed'

const enabled = process.env.E2E_ADMIN_FIXTURES === '1' && process.env.E2E_MUTATIONS === '1'
  && Boolean(process.env.E2E_USER_ADMIN_USERNAME && process.env.E2E_USER_ADMIN_PASSWORD)

if (enabled) test.setup('authenticate detailed administration', { sessions: ['admin-details'] }, async ({ app, screen, session }) => {
  await app.open('/login')
  await screen.getByLabel('邮箱').fill(credentials.user('admin').username)
  await screen.getByLabel('密码').fill(credentials.user('admin').password)
  await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 60_000 })
  await screen.getByRole('button', '登录').tap()
  await expect(screen.getByRole('heading', '平台总览')).toBeVisible({ timeout: 60_000 })
  await session.save('admin-details')
})

test.describe('record-specific administration', {
  ...(enabled ? { session: 'admin-details' } : { skip: 'Requires disposable local admin fixtures and credentials.' }),
  tags: ['admin', 'fixtures'],
}, () => {
  test('a replacement administrator invitation persists in organization records', async ({ app, screen, browser }) => {
    const email = `replacement-${Date.now()}@e2e.lingxiloop.test`
    await app.open(`/organizations/companies/${f.company}`)
    await expect(screen.getByRole('heading', '邀请替任管理员')).toBeVisible()
    await screen.getByLabel('教师邮箱').fill(email)
    await screen.getByRole('button', '生成单次邀请').tap()
    await expect(screen.getByLabel('替任管理员邀请链接')).toHaveValue(/\/invite\/.+/)
    await browser.reload()
    await screen.getByRole('button', '成员与组织').tap()
    await screen.getByRole('button', '公司邀请', { exact: true }).tap()
    await expect(screen.getByRole('region', '公司邀请记录表格')).toContainText(email)
  })

  test('routine technical fields expand and close without exposing collapsed content', async ({ app, screen }) => {
    await app.open('/ai/agent-routines/e2e-admin-routine')
    await expect(screen.getByRole('heading', 'E2E Admin Routine')).toBeVisible()
    await screen.getByText('正文与技术详情', { exact: true }).tap()
    await screen.getByText('说明', { exact: true }).tap()
    await expect(screen.getByText('Future test routine', { exact: true })).toBeVisible()
    await screen.getByText('说明', { exact: true }).tap()
    await expect(screen.getByText('Future test routine', { exact: true })).toHaveCount(0)
    await screen.getByText('schedule', { exact: true }).tap()
    await expect(screen.getByText('everyMinutes', { exact: true })).toBeVisible()
    await expect(screen.getByText('60', { exact: true })).toBeVisible()
  })

  test('unavailable local monitoring shows a retryable error without reporting healthy services', async ({ app, screen }) => {
    await app.open('/system?tab=status')
    await expect(screen.getByText('无法读取监控数据', { exact: true })).toBeVisible({ timeout: 30_000 })
    await screen.getByRole('button', '重新加载', { exact: true }).tap()
    await expect(screen.getByText('无法读取监控数据', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(screen.getByText('所有系统运行正常', { exact: true })).toHaveCount(0)
    await screen.getByRole('button', '身份与安全', { exact: true }).tap()
    await expect(screen.getByLabel('会话有效期（秒）')).toBeVisible()
  })
})
