import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { runtimeObjectCandidates } from './retire-generated-decks.mjs'

test('runtime cleanup preserves identical shared bytes and scopes candidates by tenant, agent and run', () => {
  const artifact = { path: 'presentations/deck.html', sha256: 'a'.repeat(64), source: { ref: 'presentation:deck' } }
  const scope = { tenant_id: 'tenant', agent_id: 'agent', work_id: 'run' }
  const key = `artifacts/${createHash('sha256').update(JSON.stringify(['tenant','agent','run'])).digest('hex')}/${artifact.sha256}`
  assert.deepEqual(runtimeObjectCandidates([{ ...scope, payload: { envelope: { artifacts: [artifact] } } }]), { candidates: [key], retained: [] })
  const result = runtimeObjectCandidates([
    { ...scope, payload: [artifact] },
    { ...scope, payload: [{ ...artifact, path: 'uploads/lesson.pptx', source: { ref: 'document:lesson' } }] },
    { ...scope, work_id: 'other-run', payload: [artifact] },
  ])
  assert.deepEqual(result.retained, [key])
  assert.deepEqual(runtimeObjectCandidates([{ ...scope, payload: [{ ...artifact, source: { ref: 'document:lesson' } }] }]).retained, [key], 'a shared reference remains protected after the generated manifest was migrated away')
  assert.equal(result.candidates.length, 1)
  assert.notEqual(result.candidates[0], key)
})
