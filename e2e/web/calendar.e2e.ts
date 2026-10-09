import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

test('calendar personal event is validated, saved, reloaded, edited and deleted', {
  ...memberSession(), ...mutationPermission, tags: ['web', 'calendar', 'mutations'],
}, async ({ app, screen, browser }) => {
  const title = testName('calendar')
  await app.open('/?project=e2e-classroom')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '日历').tap()
  await screen.getByRole('button', '新事件').tap()
  await screen.getByRole('button', '个人').tap()
  await screen.getByRole('button', '时间表').tap()
  await expect(screen.getByRole('alert')).toContainText('请输入事件标题。')
  await screen.getByLabel('标题').fill(title)
  await screen.getByLabel('注释').fill('Browser test event')
  await screen.getByRole('button', '时间表').tap()
  await expect(screen.getByRole('dialog', '新活动')).toBeHidden()
  await expect(screen.getByText(title).first()).toBeVisible()
  await browser.reload()
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '日历').tap()
  await screen.getByText(title).first().tap()
  await expect(screen.getByLabel('注释')).toHaveValue('Browser test event')
  await screen.getByLabel('标题').fill(`${title} edited`)
  await screen.getByRole('button', '保存').tap()
  await expect(screen.getByText(`${title} edited`).first()).toBeVisible()
  await screen.getByText(`${title} edited`).first().tap()
  await screen.getByRole('dialog', '编辑事件').getByRole('button', '删除').tap()
  await screen.getByRole('alertdialog').getByRole('button', '删除事件').tap()
  await expect(screen.getByText(`${title} edited`)).toHaveCount(0)
  await browser.reload()
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '日历').tap()
  await expect(screen.getByText(`${title} edited`)).toHaveCount(0)
})
