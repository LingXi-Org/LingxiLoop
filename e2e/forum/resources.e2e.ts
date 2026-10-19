import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// #121/#187: no parallel resource aggregation or case publication in the forum.
// Existing submission/file/provenance journeys remain in browser.e2e.ts and the server suite.
test('forum offers only assignments and discussions on desktop and mobile', async ({ app, screen, browser }) => {
  await app.open('/')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  await app.open('/?project=e2e-classroom&view=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
  for (const width of [1440, 390]) {
    await browser.setViewport({ width, height: 900 })
    if (width === 390) await screen.getByRole('button', '打开学习论坛导航').tap()
    const sections = screen.getByRole('navigation', '学习论坛版块')
    await expect(sections.getByRole('button')).toHaveCount(3)
    for (const label of ['全部内容', '作业', '自由讨论']) {
      await expect(sections.getByRole('button', label, { exact: true })).toBeVisible()
    }
    for (const label of ['资料', '作品案例', '官方案例', '精选']) {
      await expect(sections.getByRole('button', label, { exact: true })).toHaveCount(0)
    }
    await app.screenshot(`forum-scope-navigation-${width}`)
    await sections.getByRole('button', '作业', { exact: true }).tap()
    await expect(browser.locator('article[aria-label="Forum homework"]')).toBeVisible()
    await expect(screen.getByRole('heading', '课程资料库', { exact: true })).toHaveCount(0)
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await browser.reload()
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
  const composer = screen.getByRole('region', '发布学习论坛内容')
  await composer.getByRole('button', '展开发布框').tap()
  await expect(composer.getByRole('group', '发布类型').getByRole('button')).toHaveCount(2)
  await expect(composer.getByRole('button', '自由讨论', { exact: true })).toBeVisible()
  await expect(composer.getByRole('button', '正式作业', { exact: true })).toBeVisible()
  await app.screenshot('forum-scope-composer-mobile')
})
