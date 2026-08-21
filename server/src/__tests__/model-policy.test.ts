import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enforceModelPolicy, realTaskModel, supportModel } from '../agents/model-policy.js'
import { env } from '../env.js'

const BIG = env.OPENAI_MODEL
const SMALL = env.OPENAI_MODEL_SUPPORT

test('real tasks may use the big model', () => {
  assert.equal(enforceModelPolicy(BIG, 'agent-turn'), BIG)
})

test('a non-real-task that tries the big model is caught and forced to support', () => {
  for (const purpose of ['compaction', 'steer-summary', 'completion-verify', 'inbox-triage', 'agenda', 'palette', 'gender'] as const) {
    assert.equal(enforceModelPolicy(BIG, purpose), SMALL, `${purpose} must be forced off the big model`)
  }
})

test('support-model calls pass through unchanged for every purpose', () => {
  assert.equal(enforceModelPolicy(SMALL, 'inbox-triage'), SMALL)
  assert.equal(enforceModelPolicy(SMALL, 'agent-turn'), SMALL)
})

test('helpers resolve the right tier', () => {
  assert.equal(supportModel(), SMALL)
  assert.equal(realTaskModel(null), BIG)
  assert.equal(realTaskModel('gpt-custom'), 'gpt-custom') // per-agent override wins
})
