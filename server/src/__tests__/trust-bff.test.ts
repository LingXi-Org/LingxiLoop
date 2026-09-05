import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { canonicalJson } from '../modules/trust/canonical-json.js'

const application = readFileSync(new URL('../modules/trust/application.ts', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../modules/trust/repository.ts', import.meta.url), 'utf8')
const router = readFileSync(new URL('../modules/trust/router.ts', import.meta.url), 'utf8')

test('Trust BFF exposes only the bounded product surfaces', () => {
  for (const path of ['context', 'kpis', 'evidence-chain', 'snapshots']) {
    assert.match(router, new RegExp(`/trust/projects/:projectId/${path}`))
  }
  assert.doesNotMatch(repository, /observation|expectations|prompt_version|model|token|latency|tool_calls|agent_host_actions/)
  assert.match(router, /DEMO_DATA[\s\S]*no explicitly versioned Trust demo dataset is registered/)
  assert.match(router, /SIGNED_SNAPSHOT data is available only through the snapshot endpoint/)
})

test('every Trust KPI is Evidence-backed and includes the complete reporting contract', () => {
  assert.match(repository, /kind='TRUST_KPI'/)
  for (const field of [
    'value', 'threshold', 'numerator', 'denominator', 'window', 'source', 'dataset', 'release', 'updatedAt', 'evidenceId',
  ]) assert.match(repository, new RegExp(`\\b${field}\\b`), field)
  assert.match(application, /maximumLevel: context\.audienceLevel/)
  assert.doesNotMatch(application, /maximumLevel: 'L4'/)
})

test('Trust access caps Teachers at L2 and Education leaders at L3', () => {
  assert.match(application, /action: 'company:read'/)
  assert.match(application, /company\.type === 'EDUCATION'/)
  assert.match(application, /action: 'trust:read_l3_company'/)
  assert.match(application, /action: 'trust:read_l3_project'/)
  assert.match(application, /action: 'trust:read_l2'/)
  assert.match(application, /audienceLevel: educationLeader \? 'L3'.*'L2'/)
})

test('signed snapshots use canonical JSON, hash, signature and immutable Evidence identity', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}')
  assert.equal(canonicalJson({ 'ä': 1, z: 2 }), '{"z":2,"ä":1}')
  assert.equal(
    canonicalJson({ at: new Date('2026-08-30T00:00:00.000Z') }),
    '{"at":"2026-08-30T00:00:00.000Z"}',
  )
  assert.match(application, /canonicalJson[\s\S]*sha256[\s\S]*sign\(canonical\)/)
  assert.match(application, /TRUST_SNAPSHOT\.CREATED/)
  assert.match(application, /createEvidenceRecordInTransaction/)
  assert.match(application, /payloadHash !== snapshot\.payload_hash[\s\S]*verify/)
})
