import assert from 'node:assert/strict'
import test from 'node:test'
import {
  STARTER_BLOUB_PROFILES,
  STARTER_PERSONA_ROLES,
  WORKING_STATE_POOL,
  getBloubIdentity,
  getBloubState,
  getStarterPersonaKey,
  getWorkingEpochSeed,
  pickWorkingStateSequence,
} from './agentVisualState'
import { SEQUENCE } from './bloub/states'

test('starter Bloub identities stay stable across tenant id suffixes', () => {
  for (const [key, expected] of Object.entries(STARTER_BLOUB_PROFILES)) {
    const role = STARTER_PERSONA_ROLES[key as keyof typeof STARTER_PERSONA_ROLES]
    assert.deepEqual(getBloubIdentity({ id: key, role }), {
      shape: expected.shape,
      color: expected.color,
      expression: expected.expression,
    })
    assert.deepEqual(getBloubIdentity({ id: `${key}-a1b2`, role }), {
      shape: expected.shape,
      color: expected.color,
      expression: expected.expression,
    })
  }
})

test('starter identities use distinct shapes, colors, and expressions', () => {
  const profiles = Object.values(STARTER_BLOUB_PROFILES)
  assert.equal(new Set(profiles.map((profile) => profile.shape)).size, profiles.length)
  assert.equal(new Set(profiles.map((profile) => profile.color)).size, profiles.length)
  assert.equal(new Set(profiles.map((profile) => profile.expression)).size, profiles.length)
})

test('starter working and thinking states consume twelve unique poses', () => {
  const states = Object.entries(STARTER_BLOUB_PROFILES).flatMap(([key, profile]) => {
    const role = STARTER_PERSONA_ROLES[key as keyof typeof STARTER_PERSONA_ROLES]
    assert.equal(getBloubState({ id: `${key}-tenant`, role }, 'working'), profile.working)
    assert.equal(getBloubState({ id: `${key}-tenant`, role }, 'thinking'), profile.thinking)
    return [profile.working, profile.thinking]
  })
  assert.equal(new Set(states).size, 12)
})

test('shared and custom-agent status mappings retain their defaults', () => {
  const custom = { id: 'custom-helper' }
  assert.equal(getBloubState(custom, 'avail'), 'idle')
  assert.equal(getBloubState(custom, 'working'), 'orbit')
  assert.equal(getBloubState(custom, 'thinking'), 'thinking')
  assert.equal(getBloubState(custom, 'waiting'), 'notify')
  assert.equal(getBloubState(custom, 'resting'), 'sleep')
  assert.equal(getBloubState(custom, 'unknown'), 'idle')
  assert.equal(getStarterPersonaKey({ id: 'nova-custom' }), null)
})

test('working montage uses the complete upstream 14-state catalogue', () => {
  assert.deepEqual(WORKING_STATE_POOL, SEQUENCE)
  assert.equal(WORKING_STATE_POOL.length, 14)
  assert.equal(new Set(WORKING_STATE_POOL).size, 14)
  assert.equal(WORKING_STATE_POOL.includes('swirl'), false)
})

test('working montage reseeds its start without changing upstream order or repeating a state', () => {
  const a = pickWorkingStateSequence(42)
  const b = pickWorkingStateSequence(42)
  assert.deepEqual(a, b, 'same work epoch must reproduce the same montage')
  assert.equal(a.length, WORKING_STATE_POOL.length)
  assert.equal(new Set(a).size, WORKING_STATE_POOL.length, 'one pass must not repeat a state')

  for (let index = 1; index < a.length; index += 1) {
    const previous = WORKING_STATE_POOL.indexOf(a[index - 1]!)
    assert.equal(a[index], WORKING_STATE_POOL[(previous + 1) % WORKING_STATE_POOL.length])
  }

  const c = pickWorkingStateSequence(43)
  assert.notDeepEqual(a, c, 'a different seed should select a different montage start')
  assert.deepEqual([...c].sort(), [...WORKING_STATE_POOL].sort())
})

test('pickWorkingStateSequence clamps count to the pool size', () => {
  const full = pickWorkingStateSequence(1, 99)
  assert.equal(full.length, WORKING_STATE_POOL.length)
  assert.equal(new Set(full).size, WORKING_STATE_POOL.length)

  const one = pickWorkingStateSequence(1, 0)
  assert.equal(one.length, 1)
})

test('working epoch seed is stable within a round and changes with time or round', () => {
  const current = getWorkingEpochSeed('nova', '2026-08-25T09:00:00.000Z:1')
  assert.equal(current, getWorkingEpochSeed('nova', '2026-08-25T09:00:00.000Z:1'))
  assert.notEqual(current, getWorkingEpochSeed('nova', '2026-08-25T09:01:00.000Z:1'))
  assert.notEqual(current, getWorkingEpochSeed('nova', '2026-08-25T09:00:00.000Z:2'))
})
