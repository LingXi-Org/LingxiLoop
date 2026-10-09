import { test, type Browser } from '@e2e-dev/web'
import { expect } from 'e2e'
import { writeFile } from 'node:fs/promises'

// Written before the real-API browser harness. Failures: unsaved local changes,
// refresh replay, duplicate clicks becoming two durable messages, and hidden model calls.
async function backend(browser: Browser) {
  return browser.evaluate(async () => {
    const manifest = await (await fetch('/__ui_live/manifest?case=projectile')).json()
    const headers = { 'x-company-id': manifest.companyId, 'x-project-id': manifest.projectId }
    const { uiId, messageId, revision, sourceHash } = manifest.lesson
    const query = new URLSearchParams({ messageId, revision: String(revision), sourceHash })
    const state = await fetch(`/api/im/channels/${manifest.channelId}/ui/${uiId}/state?${query}`, { headers })
    const history = await fetch(`/api/im/channels/${manifest.channelId}/messages?limit=100`, { headers })
    if (!state.ok || !history.ok) throw new Error('Real state or IM history API rejected the request')
    const messages = await history.json()
    return { state: await state.json(), stats: await (await fetch('/__ui_live/stats?case=projectile')).json(),
      durableMessages: messages.length,
      actions: messages.filter((item: { payload: { metadata: { custom: { uiInteraction?: unknown } } } }) => item.payload.metadata.custom.uiInteraction)
        .map((item: { clientMsgNo: string; payload: { metadata: { custom: { uiInteraction: { state: Record<string, unknown> } } } } }) =>
          ({ nonce: item.clientMsgNo, state: item.payload.metadata.custom.uiInteraction.state })) }
  })
}

test.describe('Real WuKong interactive UI transport', { tags: ['web', 'interactive-ui-wukong'], timeout: 120_000,
  ...(process.env.LINGXIOS_REAL_WUKONG === '1' ? {} : { skip: 'Requires the isolated real-WuKong API harness; no model worker.' }),
}, () => {
  test('real personal state survives reload and double clicks produce one durable action', async ({ app, browser, screen }) => {
    await browser.setViewport({ width: 390, height: 844 })
    await app.open('/e2e/interactive-ui-live.html?case=projectile')
    await expect(screen.getByText('已就绪', { exact: true })).toBeVisible()
    const slider = screen.getByRole('slider', '角度')
    await expect(slider).toBeEnabled()
    const before = await backend(browser)
    expect(before.stats.modelCalls).toBe(0)
    await slider.focus()
    for (let index = 0; index < 10; index++) await browser.keyboard.press('ArrowRight')
    const angle = Number(await slider.getAttribute('aria-valuenow'))
    expect(angle).not.toBe(before.state.state.$angle)
    await expect.poll(async () => (await backend(browser)).state.state.$angle).toBe(angle)
    const saved = await backend(browser)
    expect(saved.stats.actions).toBe(before.stats.actions)
    expect(saved.stats.modelCalls).toBe(0)
    await browser.reload()
    await expect(slider).toHaveAttribute('aria-valuenow', String(angle))
    expect((await backend(browser)).stats.actions).toBe(before.stats.actions)
    await app.screenshot('real-wukong-state-restored-390')
    await expect(screen.getByRole('button', '检查预测')).toBeEnabled()
    await browser.evaluate(() => {
      const button = [...document.querySelectorAll('[data-interactive-ui] button')].find(item => item.textContent === '检查预测') as HTMLButtonElement
      if (!button) throw new Error('Authorized action is missing')
      button.click(); button.click()
      return true
    })
    await expect(screen.getByText('已提交', { exact: true })).toBeVisible()
    await expect.poll(async () => (await backend(browser)).stats.actions).toBe(before.stats.actions + 1)
    const submitted = await backend(browser)
    expect(submitted.durableMessages).toBe(before.durableMessages + 1)
    expect(submitted.actions.length).toBe(before.actions.length + 1)
    expect(new Set(submitted.actions.map((item: { nonce: string }) => item.nonce)).size).toBe(submitted.actions.length)
    expect(submitted.actions.at(-1)?.state).toEqual({ $angle: angle })
    expect(submitted.stats.modelCalls).toBe(0)
    await browser.reload()
    await expect(slider).toHaveAttribute('aria-valuenow', String(angle))
    expect((await backend(browser)).stats.actions).toBe(submitted.stats.actions)
    await app.screenshot('real-wukong-single-durable-action-390')
    await writeFile('artifacts/interactive-ui/wukong/browser-checks.json', JSON.stringify({ passed: true,
      realDatabase: true, realWuKong: true, realStateAndActionApi: true, modelCalls: 0,
      source: 'Deterministic committed lesson; no model worker', savedAngle: angle,
      localActionDelta: saved.stats.actions - before.stats.actions,
      explicitActionDelta: submitted.stats.actions - before.stats.actions,
      durableMessageDelta: submitted.durableMessages - before.durableMessages,
      stateReloads: { attempted: 2, restored: 2 },
    }, null, 2))
  })
})
