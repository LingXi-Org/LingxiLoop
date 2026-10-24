import assert from 'node:assert/strict'
import test from 'node:test'
import { AppBridge } from '@modelcontextprotocol/ext-apps/app-bridge'
import { GEN_UI_STATE_CONTEXT_KEY as stateKey, GEN_UI_TWEAK_CONTEXT_KEY as tweakKey } from '../../shared/gen-ui'
import { publishGenUiContext } from './context'

test('complete GenUI notifications preserve preview through state ACK and restore the registered original', () => {
  const initial = { [stateKey]: 32, [tweakKey]: { changes: [] as number[] } }
  const changed = { ...initial, [tweakKey]: { changes: [48] } }
  const saved = { ...changed, [stateKey]: 48 }
  const original = { ...saved, [tweakKey]: { changes: [] as number[] } }
  const setup = () => {
    let rendered = 32, persisted = 32, restored = 32, preview: number | undefined
    const notifications: Record<string, unknown>[] = []
    const bridge = new AppBridge(null, { name: 'context-regression', version: '1' }, {}, { hostContext: initial })
    // Reproduce the pinned guest's missing-annotation=null behavior and the
    // author's saved-state restoration. The real SDK produces the partial diff.
    bridge.sendHostContextChange = async context => {
      notifications.push(context)
      if (Object.hasOwn(context, stateKey)) persisted = context[stateKey] as number
      const next = (context[tweakKey] as { changes?: number[] } | undefined)?.changes?.[0]
      if (preview !== undefined && next === undefined) rendered = 32
      if (next !== undefined) rendered = next
      preview = next
      if (persisted !== restored) { rendered = persisted; restored = persisted }
    }
    return { bridge, notifications, value: () => rendered }
  }
  const before = setup()
  for (const context of [changed, saved, original]) before.bridge.setHostContext(context)
  assert.equal(before.value(), 48, 'SDK state-only diff clears the active preview before the original request')
  assert.equal(Object.hasOwn(before.notifications[1], tweakKey), false)
  const after = setup()
  for (const context of [changed, saved, original]) publishGenUiContext(after.bridge, context, error => { throw error })
  assert.equal(after.value(), 32)
  assert.equal(after.notifications.every(context => Object.hasOwn(context, stateKey) && Object.hasOwn(context, tweakKey)), true)
})
