import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { selectWorkspace, signIn, signOut } from './accounts'
import { memberSession, mutationPermission, testName } from './support'

test('course member identities are displayed without unsupported role changes', {
  ...memberSession(), skip: memberSession().skip ?? memberSession('student').skip,
  tags: ['web', 'learning', 'authorization'],
}, async ({ app, screen, browser }) => {
  await app.open('/')
  await screen.getByRole('button', '课程管理').tap()
  await screen.getByRole('button', '成员与邀请').tap()
  const student = browser.locator('table').first().getByRole('row').filter({ hasText: process.env.E2E_USER_STUDENT_USERNAME! })
  await expect(student).toContainText('学习者')
  await expect(student.getByRole('combobox')).toHaveCount(0)
})

test('course invitation acceptance, fixed identity and removal update student access', {
  skip: memberSession().skip ?? memberSession('student').skip ?? mutationPermission.skip,
  tags: ['web', 'learning', 'authorization', 'mutations'], timeout: 360_000,
}, async (fixtures) => {
  const { app, screen, browser } = fixtures
  const course = testName('membership course')
  const privateMessage = testName('private course message')
  const classroom = process.env.E2E_WORKSPACE_NAME ?? 'E2E Classroom'
  await signIn(fixtures, 'member')
  await selectWorkspace(fixtures, classroom)
  await screen.getByRole('button', /^切换工作区/).tap()
  await screen.getByRole('menuitem', '新建课程').tap()
  await screen.getByLabel('课程名称').fill(course)
  await screen.getByRole('button', '创建课程').tap()
  await expect(screen.getByRole('button', `切换工作区：${course}`)).toBeVisible()
  await screen.getByRole('button', '课程管理').tap()
  await screen.getByRole('button', '成员与邀请').tap()
  await screen.getByRole('button', '创建邀请').tap()
  await screen.getByLabel('限定邮箱').fill(process.env.E2E_USER_STUDENT_USERNAME!)
  await screen.getByRole('dialog', '创建课程邀请').getByRole('button', '创建邀请').tap()
  await screen.getByRole('alertdialog').getByRole('button', '创建邀请').tap()
  await expect(screen.getByRole('button', '复制链接')).toBeVisible()
  const inviteUrl = await browser.evaluate(() => [...document.querySelectorAll('p')].map(item => item.textContent ?? '').find(text => /\/invite\/project\//.test(text)) ?? '')
  expect(inviteUrl).toMatch(/\/invite\/project\//)
  const invitation = new URL(inviteUrl).pathname
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '对话').tap()
  await browser.locator('[data-slot="sidebar"] [role="button"]').filter({ hasText: `${course} · Study Room` }).tap()
  await browser.locator('[contenteditable="true"]').fill(privateMessage)
  await screen.getByRole('button', '发送').tap()
  await expect(screen.getByText(privateMessage, { exact: true })).toBeVisible()
  await signOut(fixtures)

  await signIn(fixtures, 'student')
  await selectWorkspace(fixtures, classroom)
  await screen.getByRole('button', /^切换工作区/).tap()
  await expect(screen.getByRole('menuitem').filter({ hasText: course })).toHaveCount(0)
  await browser.keyboard.press('Escape')
  await screen.getByLabel('搜索会话和消息').fill(privateMessage)
  await expect(screen.getByText('没有找到匹配结果', { exact: true })).toBeVisible()
  await app.open(invitation)
  await expect(screen.getByRole('navigation', '工作区与功能')).toBeVisible({ timeout: 45_000 })
  await selectWorkspace(fixtures, course)
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '对话').tap()
  await browser.locator('[data-slot="sidebar"] [role="button"]').filter({ hasText: `${course} · Study Room` }).tap()
  await expect(screen.getByText(privateMessage, { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '课程管理')).toBeHidden()
  await signOut(fixtures)

  await signIn(fixtures, 'member')
  await selectWorkspace(fixtures, course)
  await screen.getByRole('button', '课程管理').tap()
  await screen.getByRole('button', '成员与邀请').tap()
  const student = browser.locator('table').first().getByRole('row').filter({ hasText: process.env.E2E_USER_STUDENT_USERNAME! })
  await expect(student).toContainText('学习者')
  await expect(student.getByRole('combobox')).toHaveCount(0)
  await browser.reload()
  await screen.getByRole('button', '课程管理').tap()
  await screen.getByRole('button', '成员与邀请').tap()
  await expect(student).toContainText('学习者')
  await student.getByRole('button', '移除 E2E student').tap()
  await screen.getByRole('alertdialog').getByRole('button', '移除成员').tap()
  await expect(student).toHaveCount(0)
  await signOut(fixtures)

  await signIn(fixtures, 'student')
  await selectWorkspace(fixtures, classroom)
  await screen.getByRole('button', /^切换工作区/).tap()
  await expect(screen.getByRole('menuitem').filter({ hasText: course })).toHaveCount(0)
  await browser.keyboard.press('Escape')
  await screen.getByLabel('搜索会话和消息').fill(privateMessage)
  await expect(screen.getByText('没有找到匹配结果', { exact: true })).toBeVisible()
})
