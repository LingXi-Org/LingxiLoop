import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { selectWorkspace, signIn, signOut } from './accounts'
import { memberSession, mutationPermission, testName } from './support'

test('a second user receives a durable DM after sending and reloading', {
  skip: memberSession().skip ?? memberSession('student').skip ?? mutationPermission.skip,
  tags: ['web', 'chat', 'mutations'], timeout: 180_000,
}, async (fixtures) => {
  const { screen, browser } = fixtures
  const message = testName('recipient message')
  const workspace = process.env.E2E_WORKSPACE_NAME ?? 'E2E Classroom'
  await signIn(fixtures, 'member')
  await selectWorkspace(fixtures, workspace)
  await screen.getByRole('button', '新建对话').tap()
  const dialog = screen.getByRole('dialog', '新建对话')
  await dialog.getByLabel('搜索参与者').fill(process.env.E2E_PEER_NAME ?? 'E2E student')
  await dialog.getByRole('checkbox').first().check()
  await dialog.getByRole('button', '开始对话').tap()
  await expect(dialog).toBeHidden()
  await browser.locator('[contenteditable="true"]').fill(message)
  await screen.getByRole('button', '发送').tap()
  await expect(screen.getByText(message, { exact: true })).toBeVisible()
  await signOut(fixtures)
  await signIn(fixtures, 'student')
  await selectWorkspace(fixtures, workspace)
  await screen.getByLabel('搜索会话和消息').fill('E2E member')
  await browser.locator('[data-slot="sidebar"] [role="button"]').filter({ has: screen.getByText('E2E member', { exact: true }) }).tap()
  await expect(screen.getByText(message, { exact: true })).toBeVisible()
  await browser.reload()
  await expect(screen.getByText(message, { exact: true })).toBeVisible()
})

test('a second user receives a durable DM and its uploaded image attachment', {
  skip: process.env.E2E_CDP_URL
    ? 'Native file chooser input is unavailable in this Chrome/CDP run; official Web 0.12 has no file chooser API. Upload and recipient retrieval are not verified by this case.'
    : memberSession().skip ?? memberSession('student').skip ?? mutationPermission.skip,
  tags: ['web', 'chat', 'attachments', 'mutations'], timeout: 240_000,
}, async (fixtures) => {
  const { screen, browser } = fixtures
  const message = testName('recipient message')
  const workspace = process.env.E2E_WORKSPACE_NAME ?? 'E2E Classroom'
  await signIn(fixtures, 'member')
  await selectWorkspace(fixtures, workspace)
  await screen.getByRole('button', '新建对话').tap()
  const dialog = screen.getByRole('dialog', '新建对话')
  await dialog.getByLabel('搜索参与者').fill(process.env.E2E_PEER_NAME ?? 'E2E student')
  await dialog.getByRole('checkbox').first().check()
  await dialog.getByRole('button', '开始对话').tap()
  await expect(dialog).toBeHidden()
  await screen.getByRole('button', '添加').tap()
  await screen.getByRole('button', /^上传文件/).tap()
  await browser.locator('input[type="file"]').setInputFiles(['public/icon-192.png'])
  await expect(screen.getByRole('group', '待发送附件')).toContainText('icon-192.png')
  await expect(browser.locator('[aria-label="待发送附件"] [aria-busy="true"]')).toHaveCount(0)
  await browser.locator('[contenteditable="true"]').fill(message)
  await screen.getByRole('button', '发送').tap()
  await expect(browser.locator('[data-msg-id]').filter({ hasText: message }).getByRole('link', '打开附件：icon-192.png')).toBeVisible()
  await signOut(fixtures)

  await signIn(fixtures, 'student')
  await selectWorkspace(fixtures, workspace)
  await screen.getByLabel('搜索会话和消息').fill('E2E member')
  await browser.locator('[data-slot="sidebar"] [role="button"]').filter({ has: screen.getByText('E2E member', { exact: true }) }).tap()
  const received = browser.locator('[data-msg-id]').filter({ hasText: message })
  await expect(received).toBeVisible()
  await expect(received.getByRole('link', '打开附件：icon-192.png')).toBeVisible()
  await expect(received.getByRole('img', 'icon-192.png')).toBeVisible()
  const imageState = await browser.evaluate((text) => {
    const row = [...document.querySelectorAll('[data-msg-id]')].find(item => item.textContent?.includes(text))
    const image = row?.querySelector<HTMLImageElement>('img[alt="icon-192.png"]')
    return { loaded: Boolean(image?.complete && image.naturalWidth > 0), authenticatedUrl: Boolean(image?.src.includes('/api/files?key=')) }
  }, message)
  expect(imageState).toEqual({ loaded: true, authenticatedUrl: true })
  await browser.reload()
  await expect(screen.getByText(message, { exact: true })).toBeVisible()
  await expect(received.getByRole('link', '打开附件：icon-192.png')).toBeVisible()
})
