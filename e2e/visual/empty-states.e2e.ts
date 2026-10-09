import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('empty conversation fixture offers the existing creation dialog', async ({ app, browser, screen }) => {
  await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&scenario=empty-conversations')
  await expect(screen.getByRole('heading', '开始一段新对话')).toBeVisible()
  await browser.locator('[data-empty-conversation]').getByRole('button', '新建对话').tap()
  await expect(screen.getByRole('dialog', '新建对话')).toBeVisible()
  await app.screenshot('empty-conversation-action')
})

for (const role of ['teacher', 'student']) {
  test(`empty learning fixture provides the ${role} next step`, async ({ app, screen }) => {
    await app.open(`/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&scenario=empty-spaces&role=${role}`)
    await expect(screen.getByText('当前没有可用的学习空间', { exact: true })).toBeVisible()
    if (role === 'teacher') {
      await screen.getByRole('button', '新建课程', { exact: true }).tap()
      await expect(screen.getByRole('dialog', '新建课程')).toBeVisible()
    } else {
      await expect(screen.getByText('请向老师索取课程邀请链接，加入后刷新。', { exact: true })).toBeVisible()
      await expect(screen.getByRole('button', '刷新')).toBeEnabled()
    }
    await app.screenshot(`empty-learning-space-${role}`)
  })
}

test('empty read-only course offers workspace selection', async ({ app, browser, screen }) => {
  await app.open('/scripts/ui-experience-browser-check.html?surface=主应用&capture=1&scenario=read-only-empty')
  const empty = browser.locator('[data-empty-conversation]')
  await expect(empty.getByRole('button', '新建对话')).toHaveCount(0)
  await empty.getByRole('button', '选择工作区').tap()
  await expect(screen.getByRole('menu')).toBeVisible()
  await app.screenshot('empty-read-only-workspace-selection')
})
