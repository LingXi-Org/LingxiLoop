import { nativePaste } from '../content-editor/native'
import { fileURLToPath } from 'node:url'
import { test } from '@e2e-dev/web'
import { expect } from 'e2e'

// Real forum/profile/upload HTTP routes and disposable PostgreSQL. Account avatars
// below are explicitly labelled test graphics uploaded through the profile API.
test('compact inline editor preserves drafts and binds every avatar to its account', async ({ app, browser, screen }) => {
  const composer = () => screen.getByRole('region', '发布学习论坛内容')
  const editor = () => composer().getByLabel('内容正文')
  const expandEditor=async()=>{
    if(await composer().getAttribute('data-forum-composer-expanded')==='false') await composer().getByRole('button','展开发布框',{exact:true}).tap()
    await editor().focus()
  }
  const openAs = async (role: string) => {
    await app.open('/')
    await browser.evaluate(async role => {
      localStorage.setItem('lingxiloop-theme', 'light')
      return (await fetch(`/api/fixture-role/${role}`)).ok
    }, role)
    await app.open('/?project=e2e-classroom&view=forum')
    await expect(screen.getByLabel('搜索学习论坛')).toBeVisible({ timeout: 120000 })
    await expect(browser.locator('article[aria-label="Forum homework"]')).toBeVisible()
  }
  const saveAvatar = async (label: string, color: string) => browser.evaluate(async ({ label, color }) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = color; ctx.fillRect(0, 0, 96, 96)
    ctx.fillStyle = 'white'; ctx.font = 'bold 20px sans-serif'; ctx.fillText('TEST', 20, 35); ctx.fillText(label, 30, 70)
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'))
    const headers = { 'Content-Type': 'application/json', 'x-company-id': 'e2e-school' }
    const presign = await fetch('/api/uploads/presign', { method: 'POST', headers, body: JSON.stringify({ name: 'account-avatar.png', mime: 'image/png', size: blob.size }) })
    if (!presign.ok) throw new Error(`presign ${presign.status}`)
    const upload = await presign.json()
    const put = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob })
    if (!put.ok) throw new Error(`upload ${put.status}`)
    const saved = await fetch('/api/me/avatar', { method: 'PUT', headers, body: JSON.stringify({ key: upload.key }) })
    if (!saved.ok) throw new Error(`avatar ${saved.status}`)
    return (await saved.json()).avatarUrl as string
  }, { label, color })
  const avatar = (id: string) => composer().getByRole('img', `Forum ${id}的头像`, { exact: true })
  const geometry = async () => {
    await expect(browser.locator('[data-memo-card]').first()).toBeVisible()
    return browser.evaluate(() => {
    const section = document.querySelector('[aria-label="发布学习论坛内容"]')!.getBoundingClientRect()
    const card = document.querySelector('[data-memo-card]')!.getBoundingClientRect()
    return { height: section.height, cardTop: card.top, overflow: document.documentElement.scrollWidth > innerWidth,
      font: parseFloat(getComputedStyle(document.querySelector('.bn-editor')!).fontSize) }
    })
  }
  await openAs('teacher')
  const teacherAvatar = await saveAvatar('T', '#285a9a')
  await browser.reload()
  await expect(avatar('teacher')).toHaveAttribute('src', teacherAvatar)
  for (const width of [1440, 390]) {
    await browser.setViewport({ width, height: 844 })
    const bounds = await geometry()
    console.info('issue163 compact geometry', { width, ...bounds })
    expect(bounds.height).toBeLessThanOrEqual(110); expect(bounds.cardTop).toBeLessThan(700)
    expect(bounds.overflow).toBe(false); expect(bounds.font).toBeGreaterThanOrEqual(16)
    await expect(composer().getByRole('button', '添加材料')).toBeHidden()
    await app.screenshot(`issue163-compact-light-${width}`)
  }
  await browser.setViewport({ width: 1440, height: 1000 })
  await expandEditor()
  await expect(composer().getByRole('button', '添加材料')).toBeVisible()
  await nativePaste(browser,screen,'内容正文','教师讨论草稿\n' + '长文本保持内部滚动。\n'.repeat(180))
  expect(await browser.evaluate(() => {
    const el = document.querySelector('[aria-label="发布学习论坛内容"] .bn-editor')!
    return el.scrollHeight > el.clientHeight && el.clientHeight <= 300
  })).toBe(true)
  await composer().getByLabel('附件', { exact: true }).setInputFiles([fileURLToPath(new URL('./diagram.png', import.meta.url))])
  await expect(composer().getByRole('button', '移除附件：diagram.png')).toBeVisible()
  await app.screenshot('issue163-expanded-long-text-and-attachment')
  await composer().getByRole('button', '收起发布框', { exact: true }).tap()
  expect((await geometry()).height).toBeLessThanOrEqual(110)
  await composer().getByRole('button', '展开发布框', { exact: true }).focus()
  await browser.keyboard.press('Enter')
  await expandEditor()
  await browser.keyboard.press('Control+Home')
  await expect(editor()).toContainText('教师讨论草稿')
  await expect(composer().getByRole('button', '移除附件：diagram.png')).toBeVisible()
  await composer().getByRole('button', '正式作业', { exact: true }).tap()
  await screen.getByLabel('作业标题').fill('Issue163 教师作业')
  await editor().fill('教师作业正文')
  await composer().getByRole('button', '自由讨论', { exact: true }).tap()
  await expect(editor()).toContainText('教师讨论草稿')
  await composer().getByRole('button', '材料 1', { exact: true }).tap()
  await expect(composer().getByRole('button', '移除附件：diagram.png')).toBeVisible()
  await browser.reload()
  await expect(editor()).toContainText('教师讨论草稿')
  await expandEditor()
  await composer().getByRole('button', '材料 1', { exact: true }).tap()
  await expect(composer().getByRole('button', '移除附件：diagram.png')).toBeVisible()
  await browser.evaluate(async () => (await fetch('/api/fixture-fail-next-post', { method: 'POST' })).ok)
  await composer().getByRole('button', '发布', { exact: true }).tap()
  await expect(composer().getByRole('alert')).toBeVisible()
  await expect(editor()).toContainText('教师讨论草稿')
  await composer().getByRole('button', '收起发布框', { exact: true }).tap()
  await composer().getByRole('button', '展开发布框', { exact: true }).tap()
  await expect(composer().getByRole('button', '移除附件：diagram.png')).toBeVisible()
  await editor().fill('Issue163 教师讨论')
  await composer().getByRole('button', '发布', { exact: true }).tap()
  const teacherCard = browser.locator('article[aria-label="Issue163 教师讨论"]')
  await expect(teacherCard).toBeVisible()
  await expect(teacherCard.getByRole('img', 'Forum teacher的头像', { exact: true })).toHaveAttribute('src', teacherAvatar)
  await composer().getByRole('button', '展开发布框', { exact: true }).tap()
  await composer().getByRole('button', '正式作业', { exact: true }).tap()
  await expect(screen.getByLabel('作业标题')).toHaveValue('Issue163 教师作业')
  await composer().getByRole('button', '发布作业', { exact: true }).tap()
  await expect(browser.locator('article[aria-label="Issue163 教师作业"]')).toBeVisible()
  await openAs('student')
  const studentAvatar = await saveAvatar('S', '#806226')
  expect(studentAvatar).not.toBe(teacherAvatar)
  await browser.reload()
  await expect(avatar('student')).toHaveAttribute('src', studentAvatar)
  await expandEditor()
  await editor().fill('Issue163 学生讨论')
  await composer().getByRole('button', '发布', { exact: true }).tap()
  const studentCard = browser.locator('article[aria-label="Issue163 学生讨论"]')
  await expect(studentCard.getByRole('img', 'Forum student的头像', { exact: true })).toHaveAttribute('src', studentAvatar)
  await expect(teacherCard.getByRole('img', 'Forum teacher的头像', { exact: true })).toHaveAttribute('src', teacherAvatar)
  await browser.setViewport({ width: 1440, height: 1000 })
  await app.screenshot('issue163-multiple-account-avatars')
  await teacherCard.getByRole('button', '评论', { exact: true }).tap()
  await screen.getByRole('button', '写评论', { exact: true }).tap()
  await screen.getByLabel('发表评论').fill('Issue163 学生评论')
  await screen.getByRole('button', '发送评论', { exact: true }).tap()
  const comment = browser.locator('article[aria-label="Forum student的评论"]')
  await expect(comment.getByRole('img', 'Forum student的头像', { exact: true })).toHaveAttribute('src', studentAvatar)
  await app.screenshot('issue163-post-and-comment-avatars')
  const updatedAvatar = await saveAvatar('S2', '#39794b')
  await browser.reload()
  await expect(comment.getByRole('img', 'Forum student的头像', { exact: true })).toHaveAttribute('src', updatedAvatar)
  await app.screenshot('issue163-updated-account-avatar')
  await screen.getByRole('link', '返回学习论坛', { exact: true }).tap()
  await expect(avatar('student')).toHaveAttribute('src', updatedAvatar)
  await expect(studentCard.getByRole('img', 'Forum student的头像', { exact: true })).toHaveAttribute('src', updatedAvatar)
  await browser.route(`**${updatedAvatar}`, route => route.abort())
  await browser.reload()
  await expect(composer().getByRole('img', 'Forum student未设置头像或头像加载失败', { exact: true })).toBeVisible()
  await app.screenshot('issue163-failed-avatar-placeholder')
  await browser.unroute(`**${updatedAvatar}`)
  await openAs('teacher')
  await screen.getByRole('link', 'Memos 学习报告详情', { exact: true }).tap()
  await screen.getByLabel('按学生姓名检索').fill('Forum student')
  const learnerAvatar = browser.locator('[data-memo-detail] article[aria-label="Forum student"]').getByRole('img', 'Forum student的头像', { exact: true })
  await expect(learnerAvatar).toHaveAttribute('src', updatedAvatar)
  await browser.evaluate(async () => (await fetch('/api/fixture-role/student')).ok)
  const refreshedAvatar = await saveAvatar('S3', '#684798')
  await browser.evaluate(async () => (await fetch('/api/fixture-role/teacher')).ok)
  // Observe the existing shared roster's 60-second background refresh without
  // reloading the forum or directly mutating any frontend store.
  await expect(learnerAvatar).toHaveAttribute('src', refreshedAvatar, { timeout: 90000 })
  await app.screenshot('issue163-account-avatar-roster-refresh')
  await openAs('peer')
  await expect(composer().getByRole('img', 'Forum peer未设置头像或头像加载失败', { exact: true })).toBeVisible()
  await expandEditor()
  await editor().fill('窄屏键盘草稿')
  await composer().getByRole('button', '收起发布框', { exact: true }).tap()
  await expandEditor()
  await expect(editor()).toContainText('窄屏键盘草稿')
  await browser.setViewport({ width: 390, height: 844 })
  await expandEditor()
  await expect(composer().getByRole('button', '收起发布框', { exact: true })).toBeVisible()
  // Let the actual ThemeProvider restore both class/data-theme and color-scheme.
  // Changing only the class can capture mixed light/dark styles mid-transition.
  await browser.evaluate(() => { localStorage.setItem('lingxiloop-theme', 'dark'); return true })
  await browser.reload()
  await expandEditor()
  await expect(composer().getByRole('button', '收起发布框', { exact: true })).toBeVisible()
  await expect(editor()).toContainText('窄屏键盘草稿')
  await expect(browser.locator('[data-memo-card]').first()).toBeVisible()
  const darkThemeSnapshot = () => browser.evaluate(() => {
    const root=document.documentElement
    const section=document.querySelector('[aria-label="发布学习论坛内容"]')!
    const card=document.querySelector('[data-memo-card]')!
    const toolbar=document.querySelector('[data-forum-focus-canvas] button[type="submit"]')!
    const probe=document.createElement('span')
    probe.style.backgroundColor='var(--card)';probe.style.color='var(--primary-foreground)'
    document.body.append(probe)
    const expectedBackground=getComputedStyle(probe).backgroundColor
    section.append(probe)
    probe.style.backgroundColor='var(--background)'
    const expected=getComputedStyle(probe)
    const state={
      theme:root.dataset.theme ?? '',darkClass:root.classList.contains('dark'),lightClass:root.classList.contains('light'),
      storedTheme:localStorage.getItem('lingxiloop-theme'),colorScheme:getComputedStyle(root).colorScheme,
      expanded:section.getAttribute('data-forum-composer-expanded'),
      composerBackground:getComputedStyle(section).backgroundColor,cardBackground:getComputedStyle(card).backgroundColor,
      toolbarColor:getComputedStyle(toolbar).color,expectedBackground,expectedComposerBackground:expected.backgroundColor,expectedForeground:expected.color,
      transitions:document.getAnimations().filter(animation=>animation instanceof CSSTransition&&animation.playState==='running').length,
    }
    probe.remove()
    return {...state,ready:state.theme==='dark'&&state.darkClass&&!state.lightClass&&state.storedTheme==='dark'&&state.colorScheme==='dark'
      &&state.composerBackground===state.expectedComposerBackground&&state.cardBackground===state.expectedBackground
      &&state.toolbarColor===state.expectedForeground&&state.transitions===0}
  })
  const verifyDarkTheme = async (phase: 'expanded'|'compact') => {
    await expect.poll(async () => (await darkThemeSnapshot()).ready).toBe(true)
    await browser.evaluate(async () => {
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())))
      return true
    })
    const state=await darkThemeSnapshot()
    expect(state.ready).toBe(true)
    expect(state.expanded).toBe(String(phase==='expanded'))
    console.info('issue163 dark theme '+JSON.stringify({phase,...state}))
  }
  await verifyDarkTheme('expanded')
  await app.screenshot('issue163-expanded-dark-mobile')
  await composer().getByRole('button', '收起发布框', { exact: true }).tap()
  await composer().getByRole('button', '展开发布框', { exact: true }).focus()
  await browser.keyboard.press('ArrowRight')
  expect(await browser.evaluate(() => {
    const style=getComputedStyle(document.activeElement!)
    return style.boxShadow !== 'none' || style.outlineStyle !== 'none'
  })).toBe(true)
  expect((await geometry()).overflow).toBe(false)
  await verifyDarkTheme('compact')
  await app.screenshot('issue163-compact-dark-keyboard')
  await browser.keyboard.press('Enter')
  await expect(editor()).toContainText('窄屏键盘草稿')
})
