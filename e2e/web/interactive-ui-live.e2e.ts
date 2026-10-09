import { test, type Browser } from '@e2e-dev/web'
import { expect } from 'e2e'
import { writeFile } from 'node:fs/promises'
import { interactiveCases } from '../interactive-ui-cases'
import type { NativeMessage } from '../../src/lib/nativeMessage'
import { OPENUI_COMPONENT } from '../../src/lib/interactive-ui/catalog'
import { openUiEnvelopeSchema, type OpenUiEnvelope, type UiStateResponse } from '../../src/lib/interactive-ui/protocol'
import { parseLessonSource } from '../../src/lib/interactive-ui/source'

interface LiveContext {
  manifest: { companyId: string; projectId: string; channelId: string; runs: { runId: string }[]; ready: boolean }
  history: { payload: NativeMessage }[]
}
async function readContext(browser: Browser, caseId: string): Promise<LiveContext> {
  return browser.evaluate(async caseId => {
    const manifest = await (await fetch(`/__ui_live/manifest?case=${encodeURIComponent(caseId)}`)).json()
    const response = await fetch(`/api/im/channels/${manifest.channelId}/messages?limit=100`, {
      headers: { 'x-company-id': manifest.companyId, 'x-project-id': manifest.projectId },
    })
    if (!response.ok) throw new Error(`Live history rejected: ${response.status}`)
    return { manifest, history: await response.json() }
  }, caseId)
}
function lessons(context: LiveContext): OpenUiEnvelope[] {
  return context.history.flatMap(item => item.payload.role !== 'assistant' ? [] : item.payload.content.flatMap(part => {
    if (part.type !== 'generative-ui') return []
    return (Array.isArray(part.spec.root) ? part.spec.root : [part.spec.root]).flatMap(root =>
      typeof root === 'object' && root.component === OPENUI_COMPONENT ? [openUiEnvelopeSchema.parse(root.props)] : [])
  }))
}
function controlLabel(lesson: OpenUiEnvelope, key: string): string {
  const pending: unknown[] = [parseLessonSource(lesson.source).root]
  while (pending.length) {
    const item = pending.pop()
    if (!item || typeof item !== 'object') continue
    const props = Reflect.get(item, 'props') as Record<string, unknown> | undefined
    if (props?.name === key.slice(1) && typeof props.label === 'string') return props.label
    pending.push(...Object.values(item))
  }
  throw new Error(`Control label missing: ${key}`)
}
async function readState(browser: Browser, context: LiveContext, lesson: OpenUiEnvelope): Promise<UiStateResponse> {
  return browser.evaluate(async input => {
    const { companyId, projectId, channelId } = input.manifest
    const { uiId, messageId, revision, sourceHash } = input.lesson
    const query = new URLSearchParams({ messageId, revision: String(revision), sourceHash })
    const response = await fetch(`/api/im/channels/${channelId}/ui/${uiId}/state?${query}`, {
      headers: { 'x-company-id': companyId, 'x-project-id': projectId },
    })
    if (!response.ok) throw new Error(`Live personal state rejected: ${response.status}`)
    return response.json()
  }, { manifest: context.manifest, lesson })
}
async function waitForNewAnswer(browser: Browser, caseId: string, before: LiveContext): Promise<LiveContext> {
  const priorAnswers = new Set(before.history.filter(item => item.payload.role === 'assistant').map(item => item.payload.id))
  let current = before
  await expect.poll(async () => {
    current = await readContext(browser, caseId)
    return current.manifest.ready && current.manifest.runs.length > before.manifest.runs.length
      && current.history.some(item => item.payload.role === 'assistant' && !priorAnswers.has(item.payload.id))
  }, { timeout: 240_000 }).toBe(true)
  return current
}

// Written before the live harness: missing UI, local drags invoking the model,
// duplicate actions, refresh replay, state regression and fabricated usage cannot pass.
test.describe('Product live interactive learning', { tags: ['web', 'interactive-ui-live'], timeout: 300_000,
  ...(process.env.LINGXIOS_LIVE_UI === '1' ? {} : { skip: 'Explicit isolated live-model entry point only.' }),
}, () => {
  for (const scenario of interactiveCases) {
    test(`real model composition: ${scenario.id}`, async ({ app, browser, screen }) => {
      await browser.setViewport({ width: 390, height: 844 })
      await app.open(`/e2e/interactive-ui-live.html?case=${scenario.id}`)
      await expect(screen.getByText('已就绪', { exact: true })).toBeVisible()
      if (scenario.component) {
        await expect(browser.locator('[data-interactive-ui]').first()).toBeVisible()
        expect(await browser.locator('[data-native-part="generative-ui"]').count()).toBeGreaterThan(0)
      } else expect(await browser.locator('[data-interactive-ui]').count()).toBe(0)
      expect(await browser.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await app.screenshot(`live-${scenario.id}-390`)
    })
  }

  test('continuous exploration makes no model/action calls and survives reload', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui-live.html?case=projectile')
    await expect(screen.getByText('已就绪', { exact: true })).toBeVisible()
    const context = await readContext(browser, 'projectile')
    const lesson = lessons(context).find(item => item.fields.some(field => field.semantic.includes('ProjectilePlot.angle')))!
    expect(Boolean(lesson)).toBe(true)
    const angle = lesson.fields.find(field => field.semantic.includes('ProjectilePlot.angle'))!
    const slider = screen.getByRole('slider', controlLabel(lesson, angle.key))
    await expect(slider).toBeEnabled()
    const before = await browser.evaluate(async () => (await fetch('/__ui_live/stats?case=projectile')).json()) as { modelCalls: number; actions: number }
    let writes = 0
    await browser.route(/\/ui\/[^/]+\/state$/, async route => { if (route.request.method === 'PUT') writes++; await route.continue() })
    await slider.focus()
    for (let index = 0; index < 10; index++) await browser.keyboard.press('ArrowRight')
    const value = await slider.getAttribute('aria-valuenow')
    await expect.poll(() => writes).toBeGreaterThan(0)
    await expect.poll(async () => (await readState(browser, context, lesson)).state[angle.key]).toBe(Number(value))
    const after = await browser.evaluate(async () => (await fetch('/__ui_live/stats?case=projectile')).json()) as { modelCalls: number; actions: number }
    expect(after.modelCalls).toBe(before.modelCalls); expect(after.actions).toBe(before.actions)
    await browser.reload()
    await expect(slider).toHaveAttribute('aria-valuenow', value!)
    await writeFile('artifacts/interactive-ui/live/exploration.json', JSON.stringify({ measuredAt: new Date().toISOString(), before, after,
      modelCallsDelta: after.modelCalls - before.modelCalls, actionsDelta: after.actions - before.actions, restored: true }, null, 2))
    await app.screenshot('live-restored-personal-parameters')
  })

  test('natural-language revisions preserve compatible state, reset changed meaning, and remove controls', { timeout: 900_000 }, async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui-live.html?case=projectile')
    await expect(screen.getByText('已就绪', { exact: true })).toBeVisible()
    const initial = await readContext(browser, 'projectile')
    const first = lessons(initial).find(item => item.fields.some(field => field.semantic.includes('ProjectilePlot.angle')))!
    expect(Boolean(first)).toBe(true)
    const angle = first.fields.find(field => field.semantic.includes('ProjectilePlot.angle'))!
    const saved = await readState(browser, initial, first)
    const firstRoot = browser.locator(`[data-interactive-ui="${first.uiId}"][data-revision="${first.revision}"]`)
    await expect(firstRoot.getByRole('slider', controlLabel(first, angle.key))).toHaveAttribute('aria-valuenow', String(saved.state[angle.key]))

    await screen.getByLabel('追问').fill(`请修改刚才这张抛体交互讲解，沿用原讲解继续修订。保留所有已有参数变量、单位、语义和图中用途，尤其保留“${controlLabel(first, angle.key)}”的当前数值。新增一个名为“已经完成角度预测”的开关，记录我是否做过预测。再增加一个对照表说明等高无阻力时45度结论的适用条件，并明确角度用度、速度用m/s、重力用m/s²。`)
    await screen.getByRole('button', '发送追问').tap()
    const addedContext = await waitForNewAnswer(browser, 'projectile', initial)
    const added = lessons(addedContext).find(item => item.uiId === first.uiId && item.revision === first.revision + 1)!
    expect(Boolean(added)).toBe(true)
    const toggle = added.fields.find(field => field.type === 'boolean' && !first.fields.some(prior => prior.key === field.key))!
    expect(Boolean(toggle)).toBe(true)
    expect(added.source.includes('Table(')).toBe(true)
    const addedState = await readState(browser, addedContext, added)
    expect(addedState.state[angle.key]).toBe(saved.state[angle.key])
    expect(addedState.resetKeys.includes(angle.key)).toBe(false)
    const addedRoot = browser.locator(`[data-interactive-ui="${added.uiId}"][data-revision="${added.revision}"]`)
    await expect(addedRoot.getByRole('slider', controlLabel(added, angle.key))).toHaveAttribute('aria-valuenow', String(saved.state[angle.key]))
    await expect(addedRoot.getByRole('checkbox', controlLabel(added, toggle.key))).toBeEnabled()
    await expect(firstRoot.getByRole('slider', controlLabel(first, angle.key))).toBeDisabled()
    await app.screenshot('live-revision-added-toggle-preserved-state')

    await screen.getByLabel('追问').fill(`继续修改同一张讲解：把原“${controlLabel(added, angle.key)}”控件（变量名${angle.key}）改成“预测飞行时间”，保留这个变量名但明确改变含义，单位改成s、范围0到10、步长0.1、初始值2。它只记录我的时间预测，不再驱动抛射角。将轨迹图角度固定为45度，图计算的真实飞行时间供我对照；其他参数和刚才的预测开关都保留。所有文字同步说明角度固定45度，不把秒当作角度。`)
    await screen.getByRole('button', '发送追问').tap()
    const changedContext = await waitForNewAnswer(browser, 'projectile', addedContext)
    const changed = lessons(changedContext).find(item => item.uiId === first.uiId && item.revision === added.revision + 1)!
    expect(Boolean(changed)).toBe(true)
    const changedField = changed.fields.find(field => field.key === angle.key)!
    expect({ type: changedField.type, unit: changedField.unit, min: changedField.min, max: changedField.max, default: changedField.default })
      .toEqual({ type: 'number', unit: 's', min: 0, max: 10, default: 2 })
    expect(changedField.semantic).not.toBe(angle.semantic)
    const changedState = await readState(browser, changedContext, changed)
    expect(changedState.state[angle.key]).toBe(2)
    expect(changedState.resetKeys.includes(angle.key)).toBe(true)
    const changedRoot = browser.locator(`[data-interactive-ui="${changed.uiId}"][data-revision="${changed.revision}"]`)
    await expect(changedRoot.getByRole('slider', controlLabel(changed, angle.key))).toHaveAttribute('aria-valuenow', '2')
    await expect(changedRoot.getByText('部分参数的含义已更新，已恢复为新讲解的初始值。', { exact: true })).toBeVisible()
    await app.screenshot('live-revision-unit-meaning-reset')

    await screen.getByLabel('追问').fill(`继续修订同一张讲解：删除“预测飞行时间”控件及变量${angle.key}，也删除“已经完成角度预测”开关及其变量${toggle.key}。保留其他参数、45度固定抛体图和对照说明，清理这两个已删除控件的提示文字。`)
    await screen.getByRole('button', '发送追问').tap()
    const removedContext = await waitForNewAnswer(browser, 'projectile', changedContext)
    const removed = lessons(removedContext).find(item => item.uiId === first.uiId && item.revision === changed.revision + 1)!
    expect(Boolean(removed)).toBe(true)
    expect(removed.fields.some(field => field.key === angle.key || field.key === toggle.key)).toBe(false)
    const removedState = await readState(browser, removedContext, removed)
    expect(angle.key in removedState.state || toggle.key in removedState.state).toBe(false)
    const removedRoot = browser.locator(`[data-interactive-ui="${removed.uiId}"][data-revision="${removed.revision}"]`)
    await expect(removedRoot.getByRole('slider', controlLabel(changed, angle.key))).toHaveCount(0)
    await expect(removedRoot.getByRole('checkbox', controlLabel(added, toggle.key))).toHaveCount(0)
    await browser.reload()
    await expect(removedRoot).toBeVisible()
    await expect(removedRoot.getByRole('slider', controlLabel(changed, angle.key))).toHaveCount(0)
    await app.screenshot('live-revision-removed-controls-reloaded')
    await writeFile('artifacts/interactive-ui/live/revisions.json', JSON.stringify({ measuredAt: new Date().toISOString(), caseId: 'projectile', uiId: first.uiId,
      revisions: [first, added, changed, removed].map(item => ({ revision: item.revision, messageId: item.messageId, sourceHash: item.sourceHash, fields: item.fields })),
      compatible: { key: angle.key, before: saved.state[angle.key], after: addedState.state[angle.key] },
      incompatible: { key: angle.key, after: changedState.state[angle.key], resetKeys: changedState.resetKeys },
      removedKeys: [angle.key, toggle.key], finalState: removedState.state, runCount: removedContext.manifest.runs.length }, null, 2))
  })

  test('an incorrect prediction submits once and receives a new real model explanation', async ({ app, browser, screen }) => {
    await app.open('/e2e/interactive-ui-live.html?case=comparison')
    await expect(screen.getByText('已就绪', { exact: true })).toBeVisible()
    const context = await readContext(browser, 'comparison')
    const lesson = lessons(context).find(item => item.actions.some(action => action.kind === 'check-prediction')) ?? lessons(context)[0]
    const action = lesson.actions.find(item => item.kind === 'check-prediction') ?? lesson.actions[0]
    await screen.getByRole('textbox').first().fill('只要TCP保证数据完整到达，就不需要加密，也无法被监听。')
    const before = await browser.evaluate(async () => (await fetch('/__ui_live/stats?case=comparison')).json()) as { modelCalls: number; actions: number }
    await browser.evaluate(label => {
      const button = [...document.querySelectorAll('[data-interactive-ui] button')].find(item => item.textContent === label) as HTMLButtonElement
      if (!button) throw new Error('Authorized prediction action not found')
      button.click(); button.click()
      return true
    }, action.label)
    await expect.poll(async () => (await browser.evaluate(async () => (await fetch('/__ui_live/stats?case=comparison')).json()) as { actions: number }).actions).toBe(before.actions + 1)
    await expect.poll(async () => (await browser.evaluate(async () => (await fetch('/__ui_live/stats?case=comparison')).json()) as { modelCalls: number }).modelCalls, { timeout: 240_000 }).toBeGreaterThan(before.modelCalls)
    const answered = await waitForNewAnswer(browser, 'comparison', context)
    expect(answered.manifest.runs.length).toBe(context.manifest.runs.length + 1)
    await expect(screen.getByText('已就绪', { exact: true })).toBeVisible()
    await app.screenshot('live-prediction-correction')
  })
})
