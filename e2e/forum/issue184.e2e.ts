import { nativeLink, nativePaste } from '../content-editor/native'
import { fileURLToPath } from 'node:url'
import { test, type Browser } from '@e2e-dev/web'
import { expect, type App, type Screen } from 'e2e'

const forumUrl = '/?project=e2e-classroom&view=forum'
const file = (name: string) => fileURLToPath(new URL(name, import.meta.url))
const bodyLink = 'https://example.org/issue184/body'
const materialLink = 'https://example.org/issue184/reference'

async function openAs(app: App, browser: Browser, screen: Screen, role = 'teacher', theme = 'light') {
  await app.open('/')
  expect(await browser.evaluate(async ({ role, theme }) => {
    localStorage.setItem('lingxiloop-theme', theme)
    return (await fetch(`/api/fixture-role/${role}`)).ok
  }, { role, theme })).toBe(true)
  await app.open(forumUrl)
  await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
  await expect(screen.getByRole('region', '发布学习论坛内容')).toBeVisible()
  await screen.getByRole('button','展开发布框',{exact:true}).tap()
}

async function fixture(browser: Browser, path: string) {
  expect(await browser.evaluate(async path => (await fetch(path, { method: 'POST' })).ok, path)).toBe(true)
}

async function settledTheme(browser: Browser, theme: string) {
  await expect.poll(() => browser.evaluate(theme => {
    const root = document.documentElement
    return root.dataset.theme === theme && root.classList.contains(theme)
      && getComputedStyle(root).colorScheme === theme
      && document.getAnimations().every(animation => !(animation instanceof CSSTransition) || animation.playState !== 'running')
  }, theme)).toBe(true)
}

async function savedPost(browser: Browser, title: string) {
  return browser.evaluate(async title => {
    const response = await fetch(`/api/courses/e2e-course/forum?kind=all&offset=0&search=${encodeURIComponent(title)}`, { headers: { 'x-company-id': 'e2e-school' } })
    if (!response.ok) throw new Error(`forum read ${response.status}`)
    const data = await response.json()
    return (data.items.find((item: { title: string }) => item.title === title) ?? null) as {
      title: string; kind: string; body: string; links: string[]; attachments: { name: string }[]; tags: string[]; sourceId: string | null; dueAt: string | null; authorId: string
    } | null
  }, title)
}

test('issue184 materials, body links, upload states, drafts and publish retry use real forum routes', async ({ app, browser, screen }) => {
  const composer = () => screen.getByRole('region', '发布学习论坛内容')
  const editor = () => composer().getByLabel('内容正文')
  const tray = () => composer().getByRole('region', '材料托盘')
  const materials = (count: number) => composer().getByRole('button', `材料 ${count}`, { exact: true })
  await openAs(app, browser, screen)
  await editor().focus()
  await nativePaste(browser,screen,'内容正文','Issue184 材料与草稿\n\n独立正文链接与参考材料。')
  await expect(materials(0)).toHaveAttribute('aria-expanded', 'false')
  await expect(tray()).toBeHidden()

  // The menu is reached by keyboard; uploaded bytes go through the real presign
  // and PUT routes into the fixture's isolated object storage.
  await composer().getByRole('button', '添加材料', { exact: true }).focus()
  await browser.keyboard.press('Enter')
  await expect(screen.getByRole('menuitem', '上传文件或图片')).toBeVisible()
  await expect(screen.getByRole('menuitem', '附加参考链接')).toBeVisible()
  await browser.keyboard.press('Escape')
  await fixture(browser, '/api/fixture-attachment-upload/hold')
  await composer().getByLabel('附件', { exact: true }).setInputFiles([file('./submission.txt')])
  await expect(composer().getByRole('button', '上传中…', { exact: true })).toBeDisabled()
  await expect(composer().getByText('正在上传 submission.txt', { exact: false })).toBeVisible()
  await app.screenshot('issue184-upload-pending')
  await fixture(browser, '/api/fixture-attachment-upload/pass')
  await expect(materials(1)).toHaveAttribute('aria-expanded', 'true')
  await expect(tray().getByRole('link', 'submission.txt', { exact: false })).toBeVisible()
  await fixture(browser, '/api/fixture-attachment-upload/fail')
  await composer().getByLabel('附件', { exact: true }).setInputFiles([file('./diagram.png')])
  await expect(composer().getByRole('alert')).toBeVisible()
  await expect(materials(1)).toBeVisible()
  await expect(editor()).toContainText('独立正文链接')
  await app.screenshot('issue184-upload-failed-preserves-file')
  await composer().getByRole('button', '重试上传', { exact: true }).tap()
  await expect(materials(2)).toBeVisible()
  await expect(tray().getByRole('link', 'diagram.png', { exact: false })).toBeVisible()

  await composer().getByRole('button', '添加材料', { exact: true }).tap()
  await screen.getByRole('menuitem', '附加参考链接').tap()
  const reference = screen.getByRole('group', '附加参考链接')
  await reference.getByLabel('链接地址').fill(materialLink)
  await reference.getByRole('button', '取消', { exact: true }).focus()
  await browser.keyboard.press('Enter')
  await expect(reference).toHaveCount(0)
  await expect(materials(2)).toBeVisible()
  await composer().getByRole('button', '添加材料', { exact: true }).tap()
  await screen.getByRole('menuitem', '附加参考链接').tap()
  await expect(reference.getByLabel('链接地址')).toHaveAttribute('maxlength', '2048')
  await reference.getByLabel('链接地址').fill(materialLink)
  await reference.getByLabel('链接地址').press('Enter')
  await expect(materials(3)).toBeVisible()
  await expect(composer()).toContainText('2 个文件 · 1 个链接')
  await expect(editor()).not.toContainText(materialLink)

  await editor().focus()
  await browser.keyboard.press('Control+End')
  await nativeLink(browser,screen,'内容正文',bodyLink)
  // Enter in the upstream link form must not submit the enclosing business form.
  await expect(composer()).toHaveAttribute('data-forum-composer-expanded', 'true')
  await expect(editor()).toContainText(bodyLink)
  await expect(materials(3)).toBeVisible()
  await tray().getByRole('button', '插入正文：diagram.png', { exact: true }).tap()
  const preview = browser.locator('[aria-label="内容正文"]')
  await expect(preview.getByRole('link')).toHaveAttribute('href', bodyLink)
  await expect(preview.getByRole('img', 'diagram.png', { exact: true })).toBeVisible()
  await expect.poll(() => browser.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('[aria-label="内容正文"] img')
    return Boolean(image?.complete && image.naturalWidth > 0)
  })).toBe(true)
  await app.screenshot('issue184-body-preview-and-materials')

  await browser.locator('[data-forum-focus-canvas] summary').tap()
  await composer().getByLabel('标签', { exact: true }).fill('专注画布,参考资料')
  await composer().getByLabel('引用作业资料').tap()
  await screen.getByRole('option', 'Historical public resource', { exact: true }).tap()
  await composer().getByRole('button', '收起发布框', { exact: true }).tap()
  await browser.reload()
  await composer().getByRole('button','展开发布框',{exact:true}).tap()
  await editor().focus()
  await expect(editor()).toContainText('Issue184 材料与草稿')
  await expect(editor()).toContainText(bodyLink)
  await expect(materials(3)).toHaveAttribute('aria-expanded', 'false')
  await materials(3).tap()
  await expect(tray().getByRole('link', 'submission.txt', { exact: false })).toBeVisible()
  await expect(tray().getByRole('link', materialLink, { exact: false })).toBeVisible()
  await browser.locator('[data-forum-focus-canvas] summary').tap()
  await expect(composer().getByLabel('标签', { exact: true })).toHaveValue('专注画布,参考资料')
  await expect(composer().getByLabel('引用作业资料')).toContainText('Historical public resource')
  await app.screenshot('issue184-restored-draft')
  await tray().getByRole('button', '移除附件：submission.txt', { exact: true }).tap()
  await expect(materials(2)).toBeVisible()
  await expect(composer()).toContainText('1 个文件 · 1 个链接')
  await tray().getByRole('button', `移除参考链接：${materialLink}`, { exact: true }).tap()
  await expect(materials(1)).toBeVisible()
  await expect(editor()).toContainText(bodyLink)
  await composer().getByRole('button', '添加材料', { exact: true }).tap()
  await screen.getByRole('menuitem', '附加参考链接').tap()
  await reference.getByLabel('链接地址').fill(materialLink)
  await reference.getByRole('button', '添加到材料', { exact: true }).tap()

  await fixture(browser, '/api/fixture-fail-next-post')
  await composer().getByRole('button', '发布', { exact: true }).tap()
  await expect(composer().getByRole('alert')).toBeVisible()
  await expect(editor()).toContainText(bodyLink)
  await expect(materials(2)).toBeVisible()
  await app.screenshot('issue184-publish-failed-preserves-draft')
  await editor().focus()
  await browser.keyboard.press('Control+Enter')
  await expect(composer()).toHaveAttribute('data-forum-composer-expanded', 'true')
  await browser.keyboard.press('Control+Shift+Enter')
  await expect(browser.locator('article[aria-label="Issue184 材料与草稿"]')).toBeVisible()
  const post = await savedPost(browser, 'Issue184 材料与草稿')
  expect(post?.links).toEqual([materialLink])
  expect(post?.body).toContain(bodyLink)
  expect(post?.body).not.toContain(materialLink)
  expect(post?.attachments.map(item => item.name)).toEqual(['diagram.png'])
  expect(post?.tags).toEqual(['专注画布', '参考资料'])
  expect(post?.sourceId).toBe('forum-resource')
  expect(post?.authorId).toBe('forum-teacher')
  await browser.reload()
  await composer().getByRole('button','展开发布框',{exact:true}).tap()
  await editor().focus()
  await expect(editor()).toHaveText('')
  expect(await browser.evaluate(() => localStorage.getItem('lingxiloop.forum.draft:e2e-school:forum-teacher:post:e2e-course:share'))).toBeNull()
  await expect(materials(0)).toBeVisible()
  await expect(composer().getByRole('button', '发布', { exact: true })).toBeDisabled()
  await app.screenshot('issue184-published-draft-cleared')
})

test('issue184 responsive focus canvas: compact, editor, closed/open materials, focus mode and both themes', async ({ app, browser, screen }) => {
  const composer = () => screen.getByRole('region', '发布学习论坛内容')
  const editor = () => composer().getByLabel('内容正文')
  await openAs(app, browser, screen, 'peer')
  await expect(composer().getByRole('img', 'Forum peer未设置头像或头像加载失败', { exact: true })).toBeVisible()
  await editor().fill('截图材料草稿')
  await composer().getByLabel('附件', { exact: true }).setInputFiles([file('./diagram.png')])
  await expect(composer().getByRole('button', '材料 1', { exact: true })).toBeVisible()
  await composer().getByRole('button', '收起发布框', { exact: true }).tap()
  for (const theme of ['light', 'dark']) {
    await browser.evaluate(theme => { localStorage.setItem('lingxiloop-theme', theme); return true }, theme)
    await browser.reload()
    await settledTheme(browser, theme)
    for (const width of [1440, 390]) {
      await browser.setViewport({ width, height: 960 })
      await expect(composer()).toHaveAttribute('data-forum-composer-expanded', 'false')
      const compact = await browser.evaluate(() => {
        const section = document.querySelector('[data-forum-focus-canvas]')!
        return { height: section.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      expect(compact.height).toBeLessThanOrEqual(110)
      expect(compact.overflow).toBe(false)
      await expect(composer().getByRole('button', '添加材料', { exact: true })).toBeHidden()
      await app.screenshot(`issue184-${theme}-${width}-compact`)
      await composer().getByRole('button', '展开发布框', { exact: true }).focus()
      await browser.keyboard.press('Enter')
      await nativePaste(browser,screen,'内容正文','Issue184 可复核画布\n\n正文、工具栏和材料按阅读顺序排列。')
      await expect(composer().getByRole('button', '材料 1', { exact: true })).toHaveAttribute('aria-expanded', 'false')
      const geometry = await browser.evaluate(() => {
        const section = document.querySelector('[data-forum-focus-canvas]')!
        const editor = section.querySelector('.bn-editor')!
        const material = section.querySelector('[data-forum-material-bar]')!
        const extras = section.querySelector('summary')!
        const publish = section.querySelector('button[type="submit"]')!
        const rects = [editor, material, extras, publish].map(node => node.getBoundingClientRect())
        const bounds = section.getBoundingClientRect()
        const controls = [...section.querySelectorAll('button,input,summary')].filter(node => node.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !node.classList.contains('sr-only'))
        return { ordered: rects.every((rect, index) => index === 0 || rect.top >= rects[index - 1].bottom - 1),
          overflow: document.documentElement.scrollWidth > innerWidth,
          outside: controls.filter(node => { const rect = node.getBoundingClientRect(); return rect.left < bounds.left - 1 || rect.right > bounds.right + 1 }).map(node => ({ label: node.getAttribute('aria-label') ?? node.textContent, rect: node.getBoundingClientRect().toJSON() })),
          surface: getComputedStyle(section).backgroundColor, expectedSurface: getComputedStyle(document.querySelector('[data-ui-page="forum"]')!).backgroundColor, material: getComputedStyle(material).backgroundColor,
          primary: getComputedStyle(publish).backgroundColor, bodyHeight: editor.clientHeight }
      })
      expect(geometry.ordered).toBe(true)
      expect(geometry.overflow).toBe(false)
      expect(geometry.outside).toEqual([])
      expect(geometry.surface).not.toBe('rgba(0, 0, 0, 0)')
      expect(geometry.primary).not.toBe(geometry.surface)
      await expect(screen.getByText('/ 课程讨论', { exact: true })).toHaveCount(0)
      await expect(screen.getByText('发布内容', { exact: true })).toHaveCount(0)
      await app.screenshot(`issue184-${theme}-${width}-editor-materials-closed`)
      await composer().getByRole('button', '材料 1', { exact: true }).tap()
      await expect(composer().getByRole('region', '材料托盘')).toBeVisible()
      await app.screenshot(`issue184-${theme}-${width}-editor-materials-open`)
      await composer().getByRole('button', '材料 1', { exact: true }).tap()
      await nativePaste(browser,screen,'内容正文','Issue184 长正文\n' + '长正文保留内部滚动，不撑高整个页面。\n'.repeat(180))
      const normalHeight = await browser.evaluate(() => {
        const el = document.querySelector('[data-forum-focus-canvas] .bn-editor')!
        return { height: el.clientHeight, scroll: el.scrollHeight }
      })
      expect(normalHeight.height).toBeLessThanOrEqual(300)
      expect(normalHeight.scroll).toBeGreaterThan(normalHeight.height)
      await composer().getByRole('button', '专注模式', { exact: true }).tap()
      await expect(composer()).toHaveAttribute('data-forum-composer-focus', 'true')
      const focused = await browser.evaluate(() => {
        const section = document.querySelector('[data-forum-focus-canvas]')!
        const body = section.querySelector('.bn-editor')!.getBoundingClientRect()
        const bounds = section.getBoundingClientRect()
        return { body: body.height, authorGap: body.top - bounds.top, bottom: bounds.bottom, overflow: document.documentElement.scrollWidth > innerWidth }
      })
      expect(focused.body).toBeGreaterThan(normalHeight.height)
      expect(focused.authorGap).toBeLessThan(180)
      expect(focused.bottom).toBeLessThanOrEqual(960)
      expect(focused.overflow).toBe(false)
      await app.screenshot(`issue184-${theme}-${width}-focus-long-body`)
      // Portal menus must remain above the focus canvas, including after its
      // internal scrolling reveals controls near the bottom on narrow screens.
      await composer().getByRole('button', '添加材料', { exact: true }).tap()
      await expect(screen.getByRole('menuitem', '附加参考链接')).toBeVisible()
      expect(await browser.evaluate(() => {
        const item = [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent?.includes('附加参考链接'))!
        const rect = item.getBoundingClientRect()
        return item.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
      })).toBe(true)
      await expect.poll(() => browser.evaluate(() => document.getAnimations()
        .filter(animation => animation.playState === 'running' && animation.effect?.getTiming().iterations !== Infinity).length)).toBe(0)
      await app.screenshot(`issue184-${theme}-${width}-focus-material-menu`)
      await browser.keyboard.press('Escape')
      await expect(screen.getByRole('menuitem', '附加参考链接')).toBeHidden()
      await expect(composer()).toHaveAttribute('data-forum-composer-focus', 'true')
      await editor().focus()
      await browser.keyboard.press('Control+End')
      await browser.keyboard.press('Enter')
      await browser.keyboard.press('/')
      await browser.keyboard.type('h2')
      await expect(screen.getByRole('option',/^二级标题/).first()).toBeVisible()
      await browser.keyboard.press('Escape')
      await expect(composer()).toHaveAttribute('data-forum-composer-focus', 'true')
      await browser.locator('[data-forum-focus-canvas] summary').tap()
      await composer().getByLabel('引用作业资料').tap()
      const source = screen.getByRole('option', 'Historical public resource', { exact: true })
      await expect(source).toBeVisible()
      await browser.keyboard.press('Escape')
      await expect(source).toBeHidden()
      await expect(composer()).toHaveAttribute('data-forum-composer-focus', 'true')
      await composer().getByLabel('引用作业资料').tap()
      await expect(source).toBeVisible()
      expect(await browser.evaluate(() => {
        const option = [...document.querySelectorAll('[role="option"]')].find(node => node.textContent?.includes('Historical public resource'))!
        const rect = option.getBoundingClientRect()
        return option.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
      })).toBe(true)
      await source.tap()
      await expect(composer().getByLabel('引用作业资料')).toContainText('Historical public resource')
      await browser.locator('[data-forum-focus-canvas] summary').tap()
      await composer().getByRole('button', '退出专注模式', { exact: true }).focus()
      await browser.keyboard.press('Escape')
      await expect(composer()).toHaveAttribute('data-forum-composer-focus', 'false')
      await composer().getByRole('button', '收起发布框', { exact: true }).tap()
      await expect(composer().getByRole('button', '展开发布框', { exact: true })).toBeFocused()
      await browser.keyboard.press('ArrowRight')
      expect(await browser.evaluate(() => {
        const style = getComputedStyle(document.activeElement!)
        return style.boxShadow !== 'none' || style.outlineStyle !== 'none'
      })).toBe(true)
      await app.screenshot(`issue184-${theme}-${width}-collapsed-keyboard`)
    }
  }
})

test('issue184 formal assignment fields survive mode switches and student permission stays enforced', async ({ app, browser, screen }) => {
  const composer = () => screen.getByRole('region', '发布学习论坛内容')
  const editor = () => composer().getByLabel('内容正文')
  await openAs(app, browser, screen)
  await editor().fill('教师自由讨论独立草稿')
  await composer().getByRole('button', '正式作业', { exact: true }).tap()
  await expect(composer().getByRole('button', '发布作业', { exact: true })).toBeDisabled()
  await composer().getByLabel('作业标题').fill('Issue184 正式作业字段')
  await editor().fill('说明推导过程并引用课程资料。')
  await browser.locator('[data-forum-focus-canvas] summary').tap()
  await composer().getByLabel('截止时间', { exact: true }).fill('2030-12-20T18:30')
  await composer().getByLabel('标签', { exact: true }).fill('独立完成')
  await composer().getByLabel('引用作业资料').tap()
  await screen.getByRole('option', 'Historical public resource', { exact: true }).tap()
  await composer().getByRole('button', '自由讨论', { exact: true }).tap()
  await expect(editor()).toContainText('教师自由讨论独立草稿')
  await composer().getByRole('button', '正式作业', { exact: true }).tap()
  await expect(composer().getByLabel('作业标题')).toHaveValue('Issue184 正式作业字段')
  await expect(editor()).toContainText('说明推导过程')
  await browser.locator('[data-forum-focus-canvas] summary').tap()
  await expect(composer().getByLabel('截止时间', { exact: true })).toHaveValue('2030-12-20T18:30')
  await expect(composer().getByLabel('标签', { exact: true })).toHaveValue('独立完成')
  await expect(composer().getByLabel('引用作业资料')).toContainText('Historical public resource')
  await app.screenshot('issue184-assignment-preserved-fields')
  await composer().getByRole('button', '发布作业', { exact: true }).tap()
  await expect(browser.locator('article[aria-label="Issue184 正式作业字段"]')).toBeVisible()
  const post = await savedPost(browser, 'Issue184 正式作业字段')
  expect(post?.kind).toBe('assignment')
  expect(post?.tags).toEqual(['独立完成'])
  expect(post?.sourceId).toBe('forum-resource')
  expect(post?.dueAt).toBe('2030-12-20T10:30:00.000Z')
  await openAs(app, browser, screen, 'student')
  await editor().fill('Issue184 学生自由讨论')
  await expect(composer().getByRole('button', '正式作业', { exact: true })).toHaveCount(0)
  await expect(editor()).not.toContainText('教师自由讨论独立草稿')
  const denied = await browser.evaluate(async () => (await fetch('/api/courses/e2e-course/forum', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-company-id': 'e2e-school' },
    body: JSON.stringify({ kind: 'assignment', title: 'Issue184 denied assignment', body: 'Student cannot assign', links: [], attachments: [], tags: [] }),
  })).status)
  expect(denied).toBe(403)
  await composer().getByRole('button', '发布', { exact: true }).tap()
  await expect(browser.locator('article[aria-label="Issue184 学生自由讨论"]')).toBeVisible()
  expect((await savedPost(browser, 'Issue184 学生自由讨论'))?.authorId).toBe('forum-student')
  await app.screenshot('issue184-student-discussion-permission')
})
