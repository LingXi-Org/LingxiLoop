import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

test('personal text source is ingested, previewed, renamed, reloaded and deleted', {
  ...memberSession('student'), ...mutationPermission, tags: ['web', 'knowledge', 'mutations'], timeout: 180_000,
}, async ({ app, screen, browser }) => {
  test.skip(process.env.E2E_KNOWLEDGE !== '1', 'Set E2E_KNOWLEDGE=1 with the real worker, object storage and Open Notebook services running.')
  const title = testName('source')
  const text = 'A triangle has three sides. A square has four sides. This is disposable test learning material.'
  await app.open('/?project=e2e-classroom')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '资料').tap()
  await screen.getByRole('combobox', '资料范围').tap()
  await screen.getByRole('option', '个人资料').tap()
  await screen.getByRole('button', '添加资料').first().tap()
  await screen.getByRole('tab', '粘贴文本').tap()
  await screen.getByPlaceholder('标题（可选）').fill(title)
  await screen.getByPlaceholder('粘贴需要作为依据的内容…').fill(text)
  await screen.getByRole('button', '添加并处理').tap()
  const source = screen.getByRole('button').filter({ hasText: title })
  await expect(source).toContainText('可查看', { timeout: 120_000 })
  await source.tap()
  await expect(screen.getByRole('dialog', title)).toContainText('A triangle has three sides.')
  await browser.keyboard.press('Escape')
  await source.secondaryTap()
  await screen.getByRole('menuitem', '重命名').tap()
  await screen.getByLabel('名称').fill(`${title} renamed`)
  await screen.getByRole('button', '保存').tap()
  await expect(screen.getByRole('button').filter({ hasText: `${title} renamed` })).toBeVisible()
  await browser.reload()
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '资料').tap()
  await screen.getByRole('combobox', '资料范围').tap()
  await screen.getByRole('option', '个人资料').tap()
  await screen.getByRole('button').filter({ hasText: `${title} renamed` }).secondaryTap()
  await screen.getByRole('menuitem', '删除资料').tap()
  await screen.getByRole('alertdialog').getByRole('button', '删除资料').tap()
  await expect(screen.getByRole('button').filter({ hasText: `${title} renamed` })).toHaveCount(0)
})
