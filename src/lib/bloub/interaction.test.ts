import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BotEngine } from './engine'
import { sampleStaticPointerFrame } from './interaction'
import { EXPRESSION_BY_ID } from './expressions'
import { SHAPE_BY_ID } from './skins'

test('static pointer feedback keeps the identity pose and stops at explicit samples', () => {
  const engine = new BotEngine(100, 'idle', SHAPE_BY_ID.get('triangle')!.radii, EXPRESSION_BY_ID.get('curieux')!)
  const base = sampleStaticPointerFrame(engine, 'idle', 0.9, null)
  const hover = sampleStaticPointerFrame(engine, 'idle', 0.9, { yaw: 40, pitch: -25, mix: 0.86, spin: 0, wander: 0.16 })
  assert.equal(hover.bodyPath, base.bodyPath)
  assert.notDeepEqual(hover.eyes, base.eyes)
  const leave = sampleStaticPointerFrame(engine, 'idle', 0.9, null)
  assert.deepEqual(leave, base, 'leaving restores the same frozen phase, independent of the shared clock')
  assert.doesNotMatch(JSON.stringify(hover), /NaN|Infinity/)
})
