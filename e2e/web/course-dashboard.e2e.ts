import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission } from './support'

for (const role of ['member', 'student'] as const) {
  test(`${role} course overview retains charts and authorized settings`, { ...memberSession(role), tags: ['web', 'course-dashboard'], timeout: 180_000 }, async ({ app, browser, screen }) => {
    await app.open('/?view=learning')
    const dashboard = browser.locator(`[data-testid="${role === 'member' ? 'teacher' : 'learner'}-overview-dashboard"]`)
    await expect(dashboard).toBeVisible({ timeout: 60_000 })
    await expect(dashboard).toContainText('课程内容')
    await expect(dashboard).not.toContainText('学习任务')
    await expect(dashboard).not.toContainText('目标掌握')
    await browser.locator('button[aria-label^="查看课程内容"]').tap()
    await expect(screen.getByRole('dialog')).toBeVisible()
    await browser.keyboard.press('Escape')
    await browser.setViewport({ width: 390, height: 844 })
    await expect(dashboard).toBeVisible()
    expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await browser.setViewport({ width: 1440, height: 960 })
    await expect(browser.locator('[data-testid="workspace-bottom-navigation"] [data-workspace-view="learning"]')).toBeVisible()
    await expect(browser.locator('nav [data-workspace-view="course-members"], nav [data-workspace-view="course-status"]')).toHaveCount(0)
    expect(await browser.evaluate(() => {
      const overview = document.querySelector('[data-workspace-view="learning"]')!.getBoundingClientRect()
      const forum = document.querySelector('[data-workspace-view="forum"]')!.getBoundingClientRect()
      return overview.top > forum.bottom && document.querySelector('[data-workspace-view="forum"] svg')!.innerHTML !== document.querySelector('[data-workspace-view="conversations"] svg')!.innerHTML
    })).toBe(true)
    if (role === 'member') {
      await screen.getByRole('button', '课程设置', { exact: true }).tap()
      await expect(browser.locator('#course-settings-name')).toBeVisible()
      await expect(browser.locator('[data-ui-page="courses"]')).not.toContainText('学习目标')
      await screen.getByRole('tab', '成员与邀请', { exact: true }).tap()
      await expect(browser.locator('[data-ui-page="course-members"]')).toContainText('邀请')
      await screen.getByRole('tab', '课程状态', { exact: true }).tap()
      await expect(browser.locator('[data-ui-page="course-status"]')).toBeVisible()
      await expect(screen.getByRole('heading', '课程设置', { exact: true })).toBeVisible()
      await expect(browser.locator('[data-workspace-view="courses"][aria-current="page"]')).toBeVisible()
      await browser.setViewport({ width: 390, height: 844 })
      await expect(screen.getByRole('tab', '课程状态', { exact: true })).toBeVisible()
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await screen.getByRole('tab', '基本资料', { exact: true }).tap()
      await expect(browser.locator('#course-settings-name')).toBeVisible()
    } else {
      await expect(screen.getByRole('button', '课程设置', { exact: true })).toHaveCount(0)
      await app.open('/?view=courses')
      await expect(dashboard).toBeVisible({ timeout: 60_000 })
      await expect(browser.locator('#course-settings-name')).toHaveCount(0)
    }
  })
}

test('teacher can save retained course profile', { ...memberSession(), ...mutationPermission, tags: ['web','course-dashboard'], timeout: 180_000 }, async ({ app, browser, screen }) => {
  await app.open('/?view=courses')
  await expect(browser.locator('#course-settings-name')).toBeVisible({ timeout: 60_000 })
  await screen.getByRole('button','保存基本资料',{exact:true}).tap()
  await screen.getByRole('button','保存更改',{exact:true}).tap()
  await expect(screen.getByText('课程设置已保存',{exact:true})).toBeVisible()
})
