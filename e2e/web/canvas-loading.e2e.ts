import { test } from '@e2e-dev/web'
import { expect } from 'e2e'
import { memberSession, mutationPermission } from './support'

// Regression: opening a known canvas must not send an unscoped list request,
// display a list error, or lose the canvas after closing/reloading the page.
test('canvas opens repeatedly without an unscoped list request or error', {
  ...memberSession(), ...mutationPermission, tags: ['web', 'canvas', 'canvas-loading', 'mutations'], timeout: 120_000,
}, async ({ app, screen, browser }) => {
  let canvasId: string | undefined
  const unscopedRequests: string[] = []
  await browser.route(/\/api\/canvases(?:\?|$)/, async route => {
    const url = new URL(route.request.url)
    if (!url.searchParams.get('conversationId')) unscopedRequests.push(url.pathname + url.search)
    await route.continue()
  })
  await app.open('/?project=e2e-classroom')
  await browser.locator('[data-slot="sidebar"] [role="button"]').first().tap()
  for (const attempt of [1, 2, 3]) {
    if (attempt === 3) {
      await browser.setViewport({ width: 390, height: 844 })
      await browser.reload()
    }
    await screen.getByRole('button', '打开画布预览').tap()
    const loaded = browser.waitForResponse(/\/api\/canvases\/[^/?]+$/)
    await screen.getByRole('button', /^打开完整画布：/).tap()
    const response = await loaded
    expect(response.status).toBe(200)
    const snapshot = await response.json<{ id: string }>()
    canvasId ??= snapshot.id
    expect(snapshot.id).toBe(canvasId)
    const canvas = browser.locator('[data-canvas-ui="root"]')
    await expect(canvas).toHaveAttribute('aria-busy', 'false')
    expect(unscopedRequests).toEqual([])
    await expect(canvas.getByRole('alert')).toHaveCount(0)
    await screen.getByRole('button', '返回对话').tap()
    await expect(canvas).toBeHidden()
  }
})

