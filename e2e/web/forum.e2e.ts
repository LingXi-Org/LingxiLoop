import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'
import { semanticEvidence } from './evidence'

test.describe('Course forum', { ...memberSession(), tags: ['web', 'learning', 'forum'] }, () => {
  test('forum follows course URLs, reload and history at mobile and desktop widths', async ({ app, screen, browser }) => {
    await app.open('/?project=e2e-classroom&view=forum')
    await expect(screen.getByRole('heading', '论坛', { exact: true })).toBeVisible()
    await expect(screen.getByRole('button', '自由讨论', { exact: true })).toBeVisible()
    await screen.getByRole('navigation', '工作区与功能').getByRole('button', '学习概览', { exact: true }).tap()
    await browser.back()
    await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
    await browser.reload()
    await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
    await browser.setViewport({ width: 390, height: 844 })
    await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await semanticEvidence(screen, browser, 'forum-mobile')
    await browser.setViewport({ width: 1440, height: 1000 })
    await semanticEvidence(screen, browser, 'forum-desktop')
  })
  test('publish a discussion without case or featured controls', { skip: mutationPermission.skip }, async ({ app, screen, browser }) => {
    const title = testName('Forum discussion')
    await app.open('/?project=e2e-classroom&view=forum')
    const composer = screen.getByRole('region', '发布学习论坛内容')
    await composer.getByLabel('内容正文').fill(title + '\nA repeatable forum discussion.')
    await expect(composer.getByRole('button', '作品案例', { exact: true })).toHaveCount(0)
    await composer.getByRole('button', '发布', { exact: true }).tap()
    const card = browser.locator('article').filter({ hasText: title })
    await expect(card).toBeVisible()
    await card.getByRole('button', `管理：${title}`, { exact: true }).tap()
    await expect(screen.getByRole('menuitem', '精选', { exact: true })).toHaveCount(0)
    await browser.keyboard.press('Escape')
    await browser.reload()
    await screen.getByLabel('搜索学习论坛').fill(title)
    await expect(card).toContainText('自由讨论')
    await semanticEvidence(screen, browser, 'forum-discussion')
  })
})
