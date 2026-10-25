import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession } from './support'

test('learner next steps precede analysis and keep the activity detail reachable', {
  ...memberSession('student'), tags: ['web', 'business-layout', 'learning'],
}, async ({ app, screen, browser }) => {
  await app.open('/?project=e2e-classroom')
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
  await app.open('/?project=e2e-classroom')
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

test('student course materials show public read access and private upload on narrow screens', {
  ...memberSession('student'), tags: ['web', 'business-layout', 'knowledge', 'authorization'],
}, async ({ app, screen, browser }) => {
  await app.open('/?project=e2e-classroom&view=course-materials')
  await expect(screen.getByRole('heading', '课程资料', { level: 1 })).toBeVisible()
  await expect(screen.getByRole('tab', '公共资料')).toHaveAttribute('aria-selected', 'true')
  await expect(screen.getByText('教师上传 · 课程成员可见')).toBeVisible()
  await expect(screen.getByRole('button', '上传到公共资料')).toBeHidden()
  await screen.getByRole('tab', '我的资料').tap()
  await expect(screen.getByText('仅自己可见')).toBeVisible()
  await expect(screen.getByRole('button', '上传到我的资料').first()).toBeVisible()
  await browser.setViewport({ width: 390, height: 844 })
  await expect(screen.getByRole('tab', '我的资料')).toBeVisible()
  expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('teacher public uploads follow course authority and private space has no upload', {
  ...memberSession(), tags: ['web', 'business-layout', 'knowledge', 'authorization'],
}, async ({ app, screen }) => {
  await app.open('/?project=e2e-classroom&view=course-materials')
  await expect(screen.getByRole('button', '上传到公共资料').first()).toBeVisible()
  await screen.getByRole('tab', '我的资料').tap()
  await expect(screen.getByRole('button', '上传到我的资料')).toBeHidden()
  await screen.getByRole('tab', '公共资料').tap()
  await expect(screen.getByRole('button', '上传到公共资料').first()).toBeVisible()
})
