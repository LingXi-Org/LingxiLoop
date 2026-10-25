import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

test('forum homepage mounts a composer only after a header action, retains drafts and uses the formal homework writer', async ({ app, browser, screen }) => {
  await app.open('/e2e/learning-pages/index.html?page=forum')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
  await expect(browser.locator('[data-forum-focus-canvas]')).toHaveCount(0)
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await screen.getByRole('menuitem', '发起讨论', { exact: true }).tap()
  await expect(screen.getByRole('dialog', '发起讨论', { exact: true })).toBeVisible()
  await screen.getByLabel('内容正文', { exact: true }).fill('原课程的讨论草稿')
  await browser.keyboard.press('Escape')
  await expect(screen.getByRole('dialog')).toHaveCount(0)
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await screen.getByRole('menuitem', '发起讨论', { exact: true }).tap()
  await expect(screen.getByLabel('内容正文', { exact: true })).toContainText('原课程的讨论草稿')
  await browser.evaluate(() => { document.getElementById('switch-course')!.click(); return true })
  await expect(screen.getByRole('dialog')).toHaveCount(0)
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await screen.getByRole('menuitem', '发起讨论', { exact: true }).tap()
  await expect(screen.getByLabel('内容正文', { exact: true })).not.toContainText('原课程')
  await screen.getByLabel('内容正文', { exact: true }).fill('当前课程讨论')
  await screen.getByRole('dialog').getByRole('button', '发布', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toHaveCount(0)
  await expect(screen.getByRole('link', '当前课程讨论', { exact: true })).toBeVisible()
  await screen.getByRole('button', '发布', { exact: true }).tap()
  await screen.getByRole('menuitem', '发布作业', { exact: true }).tap()
  await screen.getByLabel('作业标题', { exact: true }).fill('正式作业')
  await screen.getByLabel('作业要求', { exact: true }).fill('写出推理过程')
  await screen.getByLabel('验收标准', { exact: true }).fill('每一步有依据')
  await screen.getByRole('button', '保存并检查草稿', { exact: true }).tap()
  await screen.getByRole('button', '确认发布', { exact: true }).tap()
  await screen.getByRole('button', '在论坛查看作业', { exact: true }).tap()
  await expect(screen.getByRole('link', '正式作业', { exact: true })).toBeVisible()
  const writes = JSON.parse((await screen.getByLabel('请求证据').textContent())!).writes
  expect(writes.filter((write: { method: string }) => write.method === 'POST').length).toBe(2)
  expect(writes[0].path).toBe('/api/courses/course-b/forum')
  expect(writes[0].body.kind).toBe('share')
  expect(writes[1].path.endsWith('/draft')).toBe(true)
  expect(writes[2].path.endsWith('/publish')).toBe(true)
})

test('student only sees permitted discussion publishing and readonly users see no publication action', async ({ app, screen, browser }) => {
  await app.open('/e2e/learning-pages/index.html?page=forum&role=student')
  await expect(screen.getByRole('button', '发布讨论', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '发布作业', { exact: true })).toHaveCount(0)
  await expect(browser.locator('[data-forum-focus-canvas]')).toHaveCount(0)
  await screen.getByRole('button', '发布讨论', { exact: true }).tap()
  await expect(screen.getByRole('dialog')).toBeVisible()
  await app.open('/e2e/learning-pages/index.html?page=forum&role=readonly')
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible()
  await expect(screen.getByRole('button', '发布讨论', { exact: true })).toHaveCount(0)
  await app.open('/e2e/learning-pages/index.html?page=materials&role=student')
  await expect(screen.getByRole('heading', '课程资料', { exact: true })).toBeVisible()
  await expect(screen.getByRole('button', '上传到公共资料', { exact: true })).toHaveCount(0)
  await screen.getByRole('button', '我的资料', { exact: true }).tap()
  await expect(browser.locator('.learning-page-header').getByRole('button', '上传到我的资料', { exact: true })).toBeVisible()
})

for (const width of [390, 768, 1440]) test(`three real pages share header and navigation geometry at ${width}px`, async ({ app, browser }) => {
  await browser.setViewport({ width, height: 960 })
  const layouts = []
  for (const page of ['forum', 'materials', 'cases']) {
    await app.open(`/e2e/learning-pages/index.html?page=${page}&caseView=manage`)
    await expect(browser.locator('.learning-page-header h1')).toBeVisible()
    await expect(browser.locator('.learning-top-tabs button').first()).toBeVisible()
    layouts.push(await browser.evaluate(() => {
      const header = document.querySelector('.learning-page-header')!, tabs = document.querySelector('.learning-top-tabs')!
      const heading = header.querySelector('h1')!, rect = heading.getBoundingClientRect(), nav = tabs.getBoundingClientRect(), style = getComputedStyle(heading)
      return { left: rect.left, headerRight: header.getBoundingClientRect().right, top: rect.top, tabsTop: nav.top, tabsBottom: nav.bottom, font: style.fontSize, weight: style.fontWeight, overflow: document.documentElement.scrollWidth > innerWidth }
    }))
    await app.screenshot(`learning-${page}-${width}`)
    if (page === 'cases') {
      await browser.locator('.learning-top-tabs button').first().focus()
      await browser.keyboard.press('End')
      await expect(browser.locator('.learning-top-tabs button').last()).toHaveAttribute('aria-pressed', 'true')
      expect(await browser.evaluate(() => {
        const nav = document.querySelector('.learning-top-tabs')!, last = nav.lastElementChild!.getBoundingClientRect(), bounds = nav.getBoundingClientRect()
        return last.left >= bounds.left - 1 && last.right <= bounds.right + 1
      })).toBe(true)
    }
  }
  for (const layout of layouts) expect(layout).toEqual(layouts[0])
})
