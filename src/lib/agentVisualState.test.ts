import assert from 'node:assert/strict'
import test from 'node:test'
import {
  STARTER_BLOUB_PROFILES,
  STARTER_PERSONA_ROLES,
  WORKING_STATE_POOL,
  getBloubIdentity,
  getBloubState,
  getStarterPersonaKey,
  pickWorkingStateSequence,
} from './agentVisualState'

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

test('pickWorkingStateSequence is deterministic per seed, draws distinct poses from the pool', () => {
  const a = pickWorkingStateSequence(42, 3)
  const b = pickWorkingStateSequence(42, 3)
  assert.deepEqual(a, b, 'same seed must reproduce the same sequence')
  assert.equal(a.length, 3)
  assert.equal(new Set(a).size, 3, 'no repeats within one sequence')
  for (const id of a) assert.ok(WORKING_STATE_POOL.includes(id))

  const c = pickWorkingStateSequence(7, 3)
  assert.notDeepEqual(a, c, 'a different seed should (almost always) pick a different order/subset')
})

test('pickWorkingStateSequence clamps count to the pool size', () => {
  const full = pickWorkingStateSequence(1, 99)
  assert.equal(full.length, WORKING_STATE_POOL.length)
  assert.equal(new Set(full).size, WORKING_STATE_POOL.length)

  const one = pickWorkingStateSequence(1, 0)
  assert.equal(one.length, 1)
})
