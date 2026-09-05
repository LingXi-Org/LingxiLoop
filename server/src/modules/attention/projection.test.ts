import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../../db/queryable.js'
import type { AttentionSourceEvent } from './contracts.js'
import { projectAttentionEvent } from './projection.js'
import { TEACHER_ATTENTION_RULES_V1 } from './rules.js'

function event(input: Partial<AttentionSourceEvent> = {}): AttentionSourceEvent {
  return {
    sequence: '41',
    company_id: 'company-1',
    project_id: 'project-1',
    event_type: 'LEARNING_CASE.DETECTED',
    actor_id: 'teacher-1',
    payload: { caseId: 'case-1' },
    case_id: 'case-1',
    learner_user_id: 'student-1',
    knowledge_unit_id: 'unit-1',
    ...input,
  }
}

test('Attention projection filters to teachers and applies the versioned deterministic rule', async () => {
  const writes: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async <_T>(text: string, params: readonly unknown[] = []): Promise<any> => {
      if (text.includes('SELECT user_id FROM project_memberships')) {
        return { rows: [{ user_id: 'teacher-1' }, { user_id: 'teacher-2' }], rowCount: 2 }
      }
      writes.push({ text, params })
      return { rows: [], rowCount: 1 }
    },
  }

  await projectAttentionEvent(db, event(), TEACHER_ATTENTION_RULES_V1)

  const itemWrites = writes.filter((write) => write.text.includes('INSERT INTO attention_items'))
  assert.equal(itemWrites.length, 2)
  assert.deepEqual(itemWrites.map((write) => write.params.slice(3, 12)), [
    ['teacher-1', 'case-1', 'student-1', 'unit-1', 'CASE_DETECTED', '41', 'teacher-attention.v1', 100, 30],
    ['teacher-2', 'case-1', 'student-1', 'unit-1', 'CASE_DETECTED', '41', 'teacher-attention.v1', 100, 30],
  ])
  assert.match(writes.at(-1)?.text ?? '', /INSERT INTO attention_projection_events/)
})

test('resolved Case events acknowledge the acting teacher then resolve every open item', async () => {
  const statements: string[] = []
  const db: Queryable = {
    query: async <_T>(text: string): Promise<any> => {
      statements.push(text)
      return { rows: [], rowCount: 1 }
    },
  }
  await projectAttentionEvent(db, event({
    event_type: 'LEARNING_CASE.ACTION_APPLIED',
    payload: { kind: 'REASSESS', result: 'APPLIED', toStatus: 'RESOLVED' },
  }), TEACHER_ATTENTION_RULES_V1)

  assert.equal(statements.some((text) => text.includes("status='ACKNOWLEDGED'")), true)
  assert.equal(statements.some((text) => text.includes("status='RESOLVED'")), true)
  assert.match(statements.at(-1) ?? '', /INSERT INTO attention_projection_events/)
})
