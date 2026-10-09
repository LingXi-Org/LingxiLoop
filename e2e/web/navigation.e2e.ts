import { test } from '@e2e-dev/web'
import { credentials, expect } from 'e2e'
import { memberSession, mutationPermission, testName } from './support'

const classroom = '/?project=e2e-classroom&view=conversations'
const room = `${classroom}&conversation=e2e-study-room`
const second = '/?project=e2e-navigation-classroom&view=conversations&conversation=e2e-navigation-room'

test.describe('Workspace URL navigation', { ...memberSession(), tags: ['web', 'navigation'] }, () => {
  test('explicit project and conversation survive reload and override a cached project', async ({ app, browser, screen }) => {
    await app.open(second)
    await expect(screen.getByRole('button', '切换工作区：E2E Navigation Classroom')).toBeVisible()
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await app.open(room)
    await expect(screen.getByRole('button', '切换工作区：E2E Classroom')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => location.search)).toBe('?project=e2e-classroom&view=conversations&conversation=e2e-study-room')
    await browser.reload()
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
  })

  test('module navigation and browser history restore the selected conversation', async ({ app, browser, screen }) => {
    await app.open(room)
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await screen.getByRole('navigation', '工作区与功能').getByRole('button', '资料').tap()
    await expect.poll(() => browser.evaluate(() => location.search)).toBe('?project=e2e-classroom&view=library')
    await browser.back()
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('conversation'))).toBe('e2e-study-room')
    await browser.forward()
    await expect(browser.locator('[data-ui-page="library"]')).toBeVisible()
    await browser.reload()
    await expect(browser.locator('[data-ui-page="library"]')).toBeVisible()
  })

  test('an explicit conversation list stays unselected, including on mobile', async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 390, height: 844 })
    await app.open(classroom)
    await expect(screen.getByLabel('搜索会话和消息')).toBeVisible()
    await expect(browser.locator('[data-mobile-conversation-page="list"]')).toBeVisible()
    await expect(browser.locator('[contenteditable="true"]')).toBeHidden()
    await app.open(room)
    await expect(browser.locator('[data-mobile-conversation-page="chat"]')).toBeVisible()
    await browser.reload()
    await expect(browser.locator('[data-mobile-conversation-page="chat"]')).toBeVisible()
    await screen.getByRole('button', '返回会话列表').tap()
    await expect(browser.locator('[data-mobile-conversation-page="list"]')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).has('conversation'))).toBe(false)
  })

  test('one successful project switch adds one history entry and restores across projects', async ({ app, browser, screen }) => {
    await app.open(room)
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    const before = await browser.evaluate(() => history.length)
    await screen.getByRole('button', /^切换工作区/).tap()
    await screen.getByRole('menuitem').filter({ hasText: 'E2E Navigation Classroom' }).tap()
    await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('project'))).toBe('e2e-navigation-classroom')
    expect(await browser.evaluate(() => history.length)).toBe(before + 1)
    await browser.back()
    await expect(screen.getByRole('button', '切换工作区：E2E Classroom')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('conversation'))).toBe('e2e-study-room')
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
  })

  test('missing conversations and inaccessible projects explain the failure without opening another chat', async ({ app, browser, screen }) => {
    await app.open(`${classroom}&conversation=e2e-no-access`)
    await expect(screen.getByRole('alert')).toContainText('该对话不存在或无权访问')
    await expect(browser.locator('[contenteditable="true"]')).toBeHidden()
    await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).has('conversation'))).toBe(false)
    await app.open('/?project=e2e-no-access&view=conversations')
    await expect(screen.getByRole('alert')).toContainText('该工作区不存在或无权访问')
    await expect(browser.locator('[contenteditable="true"]')).toBeHidden()
  })

  test('the last destination wins when history changes during project loading', async ({ app, browser, screen }) => {
    await app.open(room)
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await browser.evaluate(() => {
      history.pushState(null, '', '/?project=e2e-navigation-classroom&view=conversations&conversation=e2e-navigation-room')
      dispatchEvent(new PopStateEvent('popstate'))
      history.pushState(null, '', '/?project=e2e-classroom&view=library')
      dispatchEvent(new PopStateEvent('popstate'))
      return null
    })
    await expect(screen.getByRole('button', '切换工作区：E2E Classroom')).toBeVisible()
    await expect(browser.locator('[data-ui-page="library"]')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => location.search)).toBe('?project=e2e-classroom&view=library')
  })

  test('a network failure keeps the destination and retry restores it', async ({ app, browser, screen }) => {
    // Abort a real request to exercise transport failure; no response data is fabricated.
    await browser.route('**/api/projects', (request) => request.abort())
    await app.open(room)
    await expect(screen.getByRole('alert')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => location.search)).toBe('?project=e2e-classroom&view=conversations&conversation=e2e-study-room')
    await expect(browser.locator('[contenteditable="true"]')).toBeHidden()
    await browser.unroute('**/api/projects')
    await screen.getByRole('alert').getByRole('button', '重试').tap()
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('conversation'))).toBe('e2e-study-room')
  })

  test('an older project-list refresh cannot replace a newer cached destination', async ({ app, browser, screen }) => {
    await app.open(room)
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    const refreshed = browser.waitForResponse('**/api/projects')
    await browser.evaluate(() => {
      history.pushState(null, '', '/?project=e2e-missing-project&view=conversations')
      dispatchEvent(new PopStateEvent('popstate'))
      history.pushState(null, '', '/?project=e2e-classroom&view=library')
      dispatchEvent(new PopStateEvent('popstate'))
      return null
    })
    await refreshed
    await expect(browser.locator('[data-ui-page="library"]')).toBeVisible()
    await expect(screen.getByRole('button', '切换工作区：E2E Classroom')).toBeVisible()
    await expect.poll(() => browser.evaluate(() => JSON.parse(sessionStorage.getItem('lingxiloop.activeKnowledgeWorkspace') ?? 'null')?.projectId ?? null)).toBe('e2e-classroom')
  })
})

test('a student management deep link waits for authorization then explains the fallback', { ...memberSession('student'), tags: ['web', 'navigation', 'authorization'] }, async ({ app, browser, screen }) => {
  await app.open('/?project=e2e-classroom&view=course-members')
  await expect(screen.getByRole('alert')).toContainText('你没有此页面的访问权限')
  await expect(browser.locator('[data-ui-page="learning"]')).toBeVisible()
  await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('view'))).toBe('learning')
  await expect(screen.getByRole('button', '课程管理')).toBeHidden()
})

test('sign in keeps a safe internal conversation destination', { skip: memberSession().skip, tags: ['web', 'navigation', 'auth'] }, async ({ app, screen, browser }) => {
  await app.open(room)
  const user = credentials.user('member')
  await screen.getByLabel('邮箱').fill(user.username)
  await screen.getByLabel('密码').fill(user.password)
  await expect(screen.getByRole('button', '登录')).toBeEnabled({ timeout: 45_000 })
  await screen.getByRole('button', '登录').tap()
  await expect(browser.locator('[contenteditable="true"]')).toBeVisible({ timeout: 45_000 })
  await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('conversation'))).toBe('e2e-study-room')
})

for (const phase of ['creating', 'opening'] as const) {
  test(`course creation respects newer navigation while ${phase}`, { ...memberSession(), ...mutationPermission, tags: ['web', 'navigation', 'mutations'] }, async ({ app, screen, browser }) => {
    await app.open(room)
    await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
    await screen.getByRole('navigation', '工作区与功能').getByRole('button', 'Agent').tap()
    await expect(browser.locator('[data-ui-page="agents"]')).toBeVisible()
    let release = () => {}
    let requestPending = false
    const gate = new Promise<void>((resolve) => { release = resolve })
    const pattern = phase === 'creating' ? '**/api/courses' : '**/api/projects/*/open'
    await browser.route(pattern, async (request) => {
      if (request.request.method !== 'POST' || request.request.url.includes('/projects/e2e-classroom/open')) {
        await request.continue()
        return
      }
      requestPending = true
      // Delay the real write/open request; it still reaches the ordinary server.
      await gate
      await request.continue()
    })
    try {
      await screen.getByRole('button', /^切换工作区/).tap()
      await screen.getByRole('menuitem', '新建课程').tap()
      const dialog = screen.getByRole('dialog', '新建课程')
      await dialog.getByLabel('课程名称').fill(testName(`navigation ${phase}`))
      await dialog.getByRole('button', '创建课程').tap()
      await expect.poll(() => requestPending).toBe(true)
      await browser.back()
      await expect.poll(() => browser.evaluate(() => location.search)).toBe('?project=e2e-classroom&view=conversations&conversation=e2e-study-room')
      release()
      await expect(dialog.getByRole('button', '重试打开课程')).toBeEnabled()
      await dialog.getByRole('button', '取消').tap()
      await expect(browser.locator('[contenteditable="true"]')).toBeVisible()
      await expect(screen.getByRole('button', '切换工作区：E2E Classroom')).toBeVisible()
      await expect.poll(() => browser.evaluate(() => location.search)).toBe('?project=e2e-classroom&view=conversations&conversation=e2e-study-room')
    } finally { release() }
  })
}

test('selecting an authorized workspace after an invalid deep link starts live updates', { ...memberSession(), ...mutationPermission, tags: ['web', 'navigation', 'mutations'] }, async ({ app, screen, browser }) => {
  await app.open('/?project=e2e-no-access&view=conversations')
  await expect(screen.getByRole('alert')).toContainText('该工作区不存在或无权访问')
  await screen.getByRole('button', /^切换工作区/).tap()
  await screen.getByRole('menuitem').filter({ hasText: 'E2E Navigation Classroom' }).tap()
  await expect.poll(() => browser.evaluate(() => new URLSearchParams(location.search).get('project'))).toBe('e2e-navigation-classroom')
  const originalTitle = await browser.evaluate(async () => {
    const response = await fetch('/api/im/channels', { credentials: 'include', headers: { 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-navigation-classroom' } })
    if (!response.ok) throw new Error('Cannot read disposable conversation fixture')
    const channels = await response.json() as { id: string; title: string }[]
    return channels.find((channel) => channel.id === 'e2e-navigation-room')?.title ?? null
  })
  expect(originalTitle).not.toBeNull()
  const renamed = testName('live navigation')
  const changeTitle = (title: string) => browser.evaluate(async (value) => {
    const response = await fetch('/api/conversations/e2e-navigation-room/title', {
      method: 'POST', credentials: 'include',
      headers: { 'content-type': 'application/json', 'x-company-id': 'e2e-school', 'x-project-id': 'e2e-navigation-classroom' },
      body: JSON.stringify({ title: value }),
    })
    return response.status
  }, title)
  try {
    expect(await changeTitle(renamed)).toBe(200)
    // This server-side change must arrive through the live subscription, without reload.
    await expect(browser.locator('[data-slot="sidebar"] [role="button"]').filter({ hasText: renamed })).toBeVisible()
  } finally {
    if (originalTitle) expect(await changeTitle(originalTitle)).toBe(200)
  }
})
