import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission } from './support'

// Failure cases are authored before the action implementation: duplicate clicks,
// a successful create followed by a failed refresh, and a stale workspace result.
test.describe('Agent action journeys', { ...memberSession(), ...mutationPermission, tags: ['web', 'agents', 'mutations'], timeout: 180_000 }, () => {
  for (const mobile of [false, true]) {
    test(`Agent opens its durable conversation${mobile ? ' on mobile' : ''}`, async ({ app, screen, browser }) => {
      if (mobile) await browser.setViewport({ width: 390, height: 844 })
      await app.open('/?view=agents')
      const action = browser.locator('[data-agent-action="conversation"]').first()
      await expect(action).toBeVisible()
      await action.tap()
      await expect(browser.locator('.chat-pane')).toBeVisible()
      const target = await browser.evaluate(() => new URL(location.href).searchParams.get('conversation'))
      expect(Boolean(target)).toBe(true)
      await browser.reload()
      await expect(browser.locator('.chat-pane')).toBeVisible()
      expect(await browser.evaluate(() => new URL(location.href).searchParams.get('conversation'))).toBe(target)
      if (mobile) await expect(screen.getByRole('button', '返回会话列表')).toBeVisible()
    })
  }

  test('repeated clicks create once and a refresh failure retries only the list', async ({ app, screen, browser }) => {
    await app.open('/?view=agents')
    const action = browser.locator('[data-agent-action="conversation"]').first()
    await expect(action).toBeVisible()
    let creates = 0
    let failed = false
    await browser.route(/\/api\/projects\/[^/]+\/conversations$/, async (route) => {
      if (route.request.method === 'POST') creates += 1
      await route.continue()
    })
    await browser.route(/\/api\/im\/channels$/, async (route) => {
      if (creates > 0 && !failed) {
        failed = true
        await route.abort()
      } else await route.continue()
    })
    await browser.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('[data-agent-action="conversation"]')!
      button.click(); button.click()
      return true
    })
    await expect(screen.getByRole('alert')).toContainText('对话已就绪')
    expect(creates).toBe(1)
    await browser.locator('[data-agent-action="conversation"]').filter({ hasText: '重试刷新' }).tap()
    await expect(browser.locator('.chat-pane')).toBeVisible()
    expect(creates).toBe(1)
  })

  test('managed teacher Agent opens its teaching workspace without creating a chat', async ({ app, screen, browser }) => {
    await app.open('/?project=e2e-navigation-classroom&view=agents')
    const action = browser.locator('[data-agent-action="teaching"]')
    await expect(browser.locator('[data-page="agents"]')).toBeVisible()
    await expect(action).toBeVisible()
    let creates = 0
    await browser.route(/\/api\/projects\/[^/]+\/(conversations|context-threads.*)$/, async (route) => {
      if (route.request.method === 'POST') creates += 1
      await route.continue()
    })
    await action.first().tap()
    await expect(browser.locator('[data-ui-page="learning"]')).toBeVisible()
    await expect(screen.getByRole('heading', '学习概览')).toBeVisible()
    expect(creates).toBe(0)
  })

  test('an old Agent request cannot navigate while another workspace is opening', async ({ app, screen, browser }) => {
    await app.open('/?view=agents')
    await expect(browser.locator('[data-agent-action="conversation"]').first()).toBeVisible()
    await screen.getByRole('button', /^切换工作区/).tap()
    const other = browser.locator('[role="menuitem"]:not([aria-current="true"]):has([data-slot="avatar"])').first()
    const choices = await other.count()
    test.skip(choices === 0, 'The disposable teacher account needs two authorized course workspaces.')
    await browser.keyboard.press('Escape')
    const originalProject = await browser.evaluate(() => new URL(location.href).searchParams.get('project'))
    await browser.evaluate(() => {
      const original = window.fetch.bind(window)
      const state = window as unknown as { releaseAgentRequest?: () => void; agentRequestWaiting?: boolean; releaseProjectRequest?: () => void; projectRequestWaiting?: boolean }
      window.fetch = async (...args) => {
        const response = await original(...args)
        if (/\/api\/projects\/[^/]+\/conversations$/.test(String(args[0])) && args[1]?.method === 'POST') {
          state.agentRequestWaiting = true
          await new Promise<void>((resolve) => { state.releaseAgentRequest = resolve })
          state.agentRequestWaiting = false
        }
        if (/\/api\/projects\/[^/]+\/open$/.test(String(args[0])) && args[1]?.method === 'POST') {
          state.projectRequestWaiting = true
          await new Promise<void>((resolve) => { state.releaseProjectRequest = resolve })
        }
        return response
      }
      return true
    })
    await browser.locator('[data-agent-action="conversation"]').first().tap()
    await expect.poll(() => browser.evaluate(() => Boolean((window as unknown as { agentRequestWaiting?: boolean }).agentRequestWaiting))).toBe(true)
    await screen.getByRole('button', /^切换工作区/).tap()
    await other.tap()
    await expect.poll(() => browser.evaluate(() => Boolean((window as unknown as { projectRequestWaiting?: boolean }).projectRequestWaiting))).toBe(true)
    await browser.evaluate(() => { (window as unknown as { releaseAgentRequest?: () => void }).releaseAgentRequest?.(); return true })
    await expect.poll(() => browser.evaluate(() => Boolean((window as unknown as { agentRequestWaiting?: boolean }).agentRequestWaiting))).toBe(false)
    await expect(browser.locator('[data-ui-page="agents"][aria-busy="true"]')).toBeVisible()
    await browser.evaluate(() => { (window as unknown as { releaseProjectRequest?: () => void }).releaseProjectRequest?.(); return true })
    await expect(browser.locator('[data-page="agents"]')).toBeVisible()
    expect(await browser.evaluate(() => new URL(location.href).searchParams.get('project'))).not.toBe(originalProject)
    expect(await browser.evaluate(() => new URL(location.href).searchParams.get('conversation'))).toBe(null)
  })
})
