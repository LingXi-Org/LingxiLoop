import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { loadHomeworkHelpState } from '../modules/learning/homework-help-state.js'

const hw = { company_id: 'school', id: 'task', criteria: ['计算地址数量'] }
const state = { learner_id: 'student', assessment_id: 'now', evidence_revision: 4, return_epoch: 2 }
const row = (id: string, revision: number, messageId: string, sequence: number) => ({
  id, evidence_revision: revision, return_epoch: 2, status: 'READY', message_ids: [messageId],
  result: { criteria: [{ criterion: hw.criteria[0], met: false, independent: false, feedback: '' }], completion: '', assistance: '', independence: '', weaknesses: [], evidence: [{ messageId, excerpt: '32' }] },
  evidence: [{ messageId, role: 'user', text: '32', sequence, materials: [{ source: 'existing-ref', hash: 'sha256:fixed', text: 'student notes' }] }],
})

test('the bounded reader scopes existing assessments and checks attachment availability before summarizing new work', async () => {
  const queries: { sql: string; params: readonly unknown[] }[] = []
  const db = { query: async (sql: string, params: readonly unknown[]) => {
    queries.push({ sql, params }); return { rows: [row('now', 4, 'work-2', 20), row('before', 3, 'work-1', 10)] }
  } } as unknown as Queryable
  let reads = 0
  const plan = await loadHomeworkHelpState(db, hw, state, async materials => { reads++; assert.equal(materials[0]?.source, 'existing-ref'); return true })
  assert.equal(plan.defaultDepth, 'explanation')
  assert.equal(reads, 2)
  assert.equal(queries.length, 1)
  assert.match(queries[0]!.sql, /company_id=\$1 AND homework_id=\$2 AND learner_id=\$3/)
  assert.match(queries[0]!.sql, /return_epoch=\$4/)
  assert.match(queries[0]!.sql, /status='READY'/)
  assert.match(queries[0]!.sql, /LIMIT 2/)
  assert.deepEqual(queries[0]!.params, ['school', 'task', 'student', 2, 4])
  assert.doesNotMatch(JSON.stringify(plan), /student notes|existing-ref|work-2|32|effort|model/i)
  assert.equal((await loadHomeworkHelpState(db, hw, state, async () => false)).basis, 'unknown')
})

test('no assessment schedules no read or assessment; a pending current assessment cannot reuse an older READY result', async () => {
  const noRead = { query: async () => { throw new Error('unexpected read') } } as unknown as Queryable
  assert.equal((await loadHomeworkHelpState(noRead, hw, { ...state, assessment_id: null }, async () => true)).basis, 'unknown')
  const db = { query: async () => ({ rows: [row('old', 3, 'work-1', 10)] }) } as unknown as Queryable
  assert.equal((await loadHomeworkHelpState(db, hw, state, async () => true)).basis, 'unknown')
})
