import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { memberSession } from './support'

test.describe('Member workspace', { ...memberSession(), tags: ['web', 'workspace'] }, () => {
  test('session survives reload and the account menu shows the signed-in user', async ({ app, browser, screen }) => {
    await app.open('/')
    await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible()
    await browser.reload()
    await screen.getByRole('button', '打开账户菜单').tap()
    await expect(screen.getByText(process.env.E2E_USER_MEMBER_USERNAME!)).toBeVisible()
    await expect(screen.getByRole('menuitem', '退出登录')).toBeVisible()
  })

  test('workspace picker opens, preserves selection, and closes with Escape', async ({ app, screen, browser }) => {
    await app.open('/')
    const picker = screen.getByRole('button', /^切换工作区/)
    await picker.tap()
    await expect(screen.getByRole('menu')).toBeVisible()
    await expect(screen.getByRole('menuitem').first()).toBeVisible()
    await browser.keyboard.press('Escape')
    await expect(screen.getByRole('menu')).toBeHidden()
    await expect(picker).toBeFocused()
  })

  test('keyboard command palette searches and navigates to the resource library', async ({ app, screen, browser }) => {
    await app.open('/')
    await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible()
    await browser.keyboard.press('ControlOrMeta+k')
    await screen.getByPlaceholder('输入命令或会话名称…').fill('打开资料库')
    await screen.getByRole('option', '打开资料库').tap()
    await expect(browser.locator('[data-ui-page="library"]')).toBeVisible()
    await expect(screen.getByPlaceholder('输入命令或会话名称…')).toBeHidden()
  })

  test('command palette focuses conversation search and composer and opens message find', async ({ app, screen, browser }) => {
    await app.open('/')
    await expect(screen.getByRole('button', '新建对话')).toBeVisible()
    await browser.keyboard.press('ControlOrMeta+k')
    await screen.getByPlaceholder('输入命令或会话名称…').fill('搜索会话和消息')
    await screen.getByRole('option', '搜索会话和消息').tap()
    await expect(screen.getByLabel('搜索会话和消息')).toBeFocused()
    await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await browser.keyboard.press('ControlOrMeta+k')
    await screen.getByPlaceholder('输入命令或会话名称…').fill('聚焦消息输入框')
    await screen.getByRole('option', '聚焦消息输入框').tap()
    await expect(browser.locator('[contenteditable="true"]')).toBeFocused()
    await browser.keyboard.press('ControlOrMeta+k')
    await screen.getByPlaceholder('输入命令或会话名称…').fill('搜索当前对话')
    await screen.getByRole('option', /^搜索当前对话/).tap()
    await expect(screen.getByPlaceholder('搜索当前会话…')).toBeVisible()
  })

  test('all top-level learner surfaces load without an error panel', async ({ app, browser, screen }) => {
    await app.open('/')
    for (const [name, view] of [['Agent', 'agents'], ['邮件', 'mail'], ['学习概览', 'learning'], ['资料', 'library'], ['日历', 'calendar'], ['对话', 'conversations']]) {
      await screen.getByRole('navigation', '工作区与功能').getByRole('button', name).tap()
      await expect(browser.locator(`[data-ui-page="${view}"]`)).toBeVisible()
      await expect(browser.locator(`[data-ui-page="${view}"] [data-resource-skeleton], [data-ui-page="${view}"] [data-skeleton-region], [data-ui-page="${view}"] [aria-busy="true"]`)).toHaveCount(0)
      await expect(browser.locator(`[data-ui-page="${view}"] [role="alert"]`)).toHaveCount(0)
    }
    await expect(screen.getByLabel('搜索会话和消息')).toBeVisible()
  })

  test('new-conversation selection validates empty and unmatched searches', async ({ app, screen }) => {
    await app.open('/')
    await screen.getByRole('button', '新建对话').tap()
    const dialog = screen.getByRole('dialog', '新建对话')
    await expect(dialog.getByRole('button', '开始对话')).toBeDisabled()
    await dialog.getByLabel('搜索参与者').fill('e2e-no-such-participant-9ce2922')
    await expect(dialog.getByText('没有找到匹配的参与者')).toBeVisible()
    await dialog.getByRole('button', '取消').tap()
    await expect(dialog).toBeHidden()
  })

  test('mail search can be cleared and an empty composer cannot send', async ({ app, screen }) => {
    await app.open('/')
    await screen.getByRole('navigation', '工作区与功能').getByRole('button', '邮件').tap()
    await screen.getByLabel('搜索邮件标题或发件人').fill('e2e-unmatched-mail')
    await screen.getByRole('button', '清除搜索').tap()
    await expect(screen.getByLabel('搜索邮件标题或发件人')).toHaveValue('')
    await screen.getByRole('button', '写邮件').first().tap()
    await expect(screen.getByLabel('至')).toBeVisible()
    await screen.getByRole('button', '发送').tap()
    await expect(screen.getByText('请输入邮件正文。')).toBeVisible()
    await screen.getByPlaceholder('写下您的信息...').fill('E2E validation only; no recipient is selected.')
    await screen.getByRole('button', '发送').tap()
    await expect(screen.getByText('请至少添加一位收件人。')).toBeVisible()
    await screen.getByRole('button', '关闭邮件编辑器').tap()
    await expect(screen.getByLabel('至')).toBeHidden()
  })

  test('calendar view controls and cancelled edits leave the calendar usable', async ({ app, screen }) => {
    await app.open('/')
    await screen.getByRole('navigation', '工作区与功能').getByRole('button', '日历').tap()
    for (const view of ['日', '周', '月']) {
      await screen.getByRole('tab', view).tap()
      await expect(screen.getByRole('tab', view)).toBeSelected()
    }
    await screen.getByRole('button', '下一时间段').tap()
    await screen.getByRole('button', '上一时间段').tap()
    await screen.getByRole('button', '今天').tap()
    await screen.getByRole('button', '新事件').tap()
    await expect(screen.getByLabel('标题')).toBeVisible()
    await screen.getByRole('button', '取消').tap()
    await expect(screen.getByLabel('标题')).toBeHidden()
    await expect(screen.getByRole('button', '新事件')).toBeVisible()
  })

  test('settings tabs, appearance persistence and focus restoration work', async ({ app, screen, browser }) => {
    await app.open('/')
    await screen.getByRole('button', '打开账户菜单').tap()
    await screen.getByRole('menuitem', '设置').tap()
    const dialog = screen.getByRole('dialog', 'LingxiLoop 设置')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', '外观与声音').tap()
    await screen.getByRole('combobox', '主题').tap()
    await screen.getByRole('option', '深色').tap()
    await expect(browser.locator('html')).toHaveAttribute('class', /dark/)
    await dialog.getByRole('button', '通知').tap()
    await expect(screen.getByLabel('通知时区')).toBeVisible()
    await dialog.getByRole('button', '数据与账号').tap()
    await expect(dialog.getByRole('button', '退出登录')).toBeVisible()
    await browser.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(screen.getByRole('button', '打开账户菜单')).toBeFocused()
    await browser.reload()
    await expect(browser.locator('html')).toHaveAttribute('class', /dark/)
  })

  test('mobile shell and settings stay within the viewport', async ({ app, screen, browser }) => {
    await browser.setViewport({ width: 390, height: 844 })
    await app.open('/')
    await expect(screen.getByLabel('搜索会话和消息')).toBeVisible()
    await screen.getByRole('button', '打开账户菜单').tap()
    await screen.getByRole('menuitem', '设置').tap()
    await screen.getByRole('tab', '外观与声音').tap()
    await expect(screen.getByRole('combobox', '主题')).toBeVisible()
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await screen.getByRole('button', '关闭设置').tap()
    await expect(screen.getByRole('button', '打开账户菜单')).toBeFocused()
  })
})

test('student has learner navigation without course administration', { ...memberSession('student'), tags: ['web', 'learning', 'authorization'] }, async ({ app, screen }) => {
  await app.open('/')
  await expect(screen.getByRole('button', '学习概览')).toBeVisible()
  await expect(screen.getByRole('button', '课程管理')).toBeHidden()
  await screen.getByRole('button', /^切换工作区/).tap()
  await expect(screen.getByRole('menuitem', '新建课程')).toBeHidden()
})

// Logout invalidates the saved server session, so authenticate afresh for this case.
test('logout revokes the server session after a reload', { skip: memberSession().skip, tags: ['web', 'auth'] }, async ({ app, browser, screen }) => {
  await app.open('/')
  const user = credentials.user('member')
  await screen.getByLabel('邮箱').fill(user.username)
  await screen.getByLabel('密码').fill(user.password)
  await screen.getByRole('button', '登录').tap()
  await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible({ timeout: 45_000 })
  await screen.getByRole('button', '打开账户菜单').tap()
  await screen.getByRole('menuitem', '退出登录').tap()
  await expect(screen.getByText('欢迎回来')).toBeVisible()
  await expect.poll(() => browser.evaluate(async () => (await fetch('/api/session', { credentials: 'include' })).status)).toBe(401)
  await browser.reload()
  await expect(screen.getByLabel('密码')).toBeVisible()
})
