import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession } from './support'

test('learner next steps precede analysis and keep the activity detail reachable', {
  ...memberSession('student'), tags: ['web', 'business-layout', 'learning'],
}, async ({ app, screen, browser }) => {
  await app.open('/')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '学习概览').tap()
  await expect(screen.getByRole('heading', '接下来学什么')).toBeVisible()
  const nextSteps = await screen.getByRole('heading', '接下来学什么').boundingBox()
  const activity = await screen.getByRole('button', /^查看课程活动：/).boundingBox()
  expect(nextSteps!.y).toBeLessThan(activity!.y)
  await screen.getByRole('button', /^查看课程活动：/).tap()
  await expect(screen.getByRole('dialog', '课程活动')).toBeVisible()
  await browser.keyboard.press('Escape')
  await browser.setViewport({ width: 390, height: 844 })
  await expect(screen.getByRole('heading', '接下来学什么')).toBeVisible()
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('teacher priorities and follow-up precede charts and open the existing review flow', {
  ...memberSession(), tags: ['web', 'business-layout', 'learning'],
}, async ({ app, screen, browser }) => {
  await app.open('/')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '学习概览').tap()
  await expect(screen.getByRole('heading', '教学重点')).toBeVisible()
  await expect(screen.getByRole('heading', '需要关注的学生')).toBeVisible()
  const priorities = await screen.getByRole('heading', '教学重点').boundingBox()
  const analysis = await screen.getByRole('button', /^查看学情分析：/).boundingBox()
  expect(priorities!.y).toBeLessThan(analysis!.y)
  await screen.getByRole('button', /^审核学习评价/).tap()
  await expect(screen.getByRole('dialog', '评价审核')).toBeVisible()
  await browser.keyboard.press('Escape')
  await screen.getByRole('button', /^跟进学生进展/).tap()
  await expect(screen.getByRole('dialog', '课程学生')).toBeVisible()
})

test('resource scope shows public sources immediately and preserves student write permissions', {
  ...memberSession('student'), tags: ['web', 'business-layout', 'knowledge', 'authorization'],
}, async ({ app, screen, browser }) => {
  await app.open('/')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '资料').tap()
  await expect(screen.getByRole('heading', '课程资料', { level: 1 })).toBeVisible()
  await expect(screen.getByRole('combobox', '资料范围')).toContainText('公共资料')
  await expect(browser.locator('[data-ui-page="library"] [aria-busy="true"]')).toHaveCount(0)
  await expect(screen.getByRole('button', '添加资料')).toBeHidden()
  await screen.getByRole('combobox', '资料范围').tap()
  await screen.getByRole('option', '个人资料').tap()
  await expect(screen.getByRole('button', '添加资料').first()).toBeVisible()
  await screen.getByRole('combobox', '资料范围').tap()
  await screen.getByRole('option', '公共资料').tap()
  await expect(screen.getByRole('button', '添加资料')).toBeHidden()
  await browser.setViewport({ width: 390, height: 844 })
  await expect(screen.getByRole('combobox', '资料范围')).toBeVisible()
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('mail keeps its page title visible beside search on desktop', {
  ...memberSession(), tags: ['web', 'business-layout', 'mail'],
}, async ({ app, screen }) => {
  await app.open('/')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '邮件').tap()
  const title = screen.getByRole('heading', '邮件', { level: 1 })
  await expect(title).toBeVisible()
  const bounds = await title.boundingBox()
  expect(bounds!.height).toBeGreaterThan(20)
  await expect(screen.getByLabel('搜索邮件标题或发件人')).toBeVisible()
  await screen.getByRole('button', '写邮件').first().tap()
  await expect(screen.getByLabel('至')).toBeVisible()
  await screen.getByRole('button', '关闭邮件编辑器').tap()
})

test('teacher can manage public sources while learner review sources stay read-only', {
  ...memberSession(), tags: ['web', 'business-layout', 'knowledge', 'authorization'],
}, async ({ app, screen }) => {
  await app.open('/')
  await screen.getByRole('navigation', '工作区与功能').getByRole('button', '资料').tap()
  await expect(screen.getByRole('combobox', '资料范围')).toContainText('公共资料')
  await expect(screen.getByRole('button', '添加资料')).toBeVisible()
  await screen.getByRole('combobox', '资料范围').tap()
  await screen.getByRole('option', /个人资料$/).first().tap()
  await expect(screen.getByRole('combobox', '资料范围')).toContainText('个人资料')
  await expect(screen.getByRole('button', '添加资料')).toBeHidden()
  await screen.getByRole('combobox', '资料范围').tap()
  await screen.getByRole('option', '公共资料').tap()
  await expect(screen.getByRole('button', '添加资料')).toBeVisible()
})
