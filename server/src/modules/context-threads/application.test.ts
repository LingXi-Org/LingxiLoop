import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../../db/queryable.js'
import type { ImChannelProfile } from '../../im/types.js'
import { ContextThreadApplicationError, ContextThreadsApplication } from './application.js'

const scope = { companyId: 'company-1', projectId: 'project-1', userId: 'teacher-1' }

interface ParticipantFixture {
  kind: 'agent' | 'human'
  name: string
  activeStudent?: boolean
}

class FakeDb implements Queryable {
  participants = new Map<string, ParticipantFixture>([
    ['teacher-1', { kind: 'human', name: 'Teacher' }],
    ['student-1', { kind: 'human', name: 'Student', activeStudent: true }],
    ['agent-1', { kind: 'agent', name: 'Tutor' }],
  ])
  cases = new Map([['case-1', 'student-1']])
  thread: Record<string, unknown> | null = null
  participantIds: string[] = []
  eventPayloads: Array<Record<string, unknown>> = []

  async query<_T>(text: string, params: readonly unknown[] = []): Promise<any> {
    if (text.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 }
    if (text.includes('FROM participants participant')) {
      const id = String(params[1])
      const participant = this.participants.get(id)
      return { rows: participant ? [{
        id,
        kind: participant.kind,
        name: participant.name,
        departed_at: null,
      }] : [], rowCount: participant ? 1 : 0 }
    }
    if (text.includes('FROM learning_cases')) {
      const matches = this.cases.get(String(params[2])) === String(params[3])
      return { rows: matches ? [{ '?column?': 1 }] : [], rowCount: matches ? 1 : 0 }
    }
    if (text.includes('FROM context_threads thread')) {
      const matches = this.thread
        && this.thread.context_type === params[2]
        && this.thread.context_id === params[3]
      return {
        rows: matches ? [{ ...this.thread, participant_ids: this.participantIds }] : [],
        rowCount: matches ? 1 : 0,
      }
    }
    if (text.includes('INSERT INTO conversations') || text.includes('INSERT INTO im_channel_bindings')) {
      return { rows: [], rowCount: 1 }
    }
    if (text.includes('INSERT INTO context_threads')) {
      this.thread = {
        id: params[0],
        channel_id: params[5],
        context_type: params[3],
        context_id: params[4],
        created_by: params[6],
      }
      return { rows: [], rowCount: 1 }
    }
    if (text.includes('INSERT INTO context_thread_participants')) {
      this.participantIds.push(String(params[3]))
      return { rows: [], rowCount: 1 }
    }
    if (text.includes('SELECT * FROM domain_events')) return { rows: [], rowCount: 0 }
    if (text.includes('INSERT INTO domain_events')) {
      const payload = JSON.parse(String(params[10])) as Record<string, unknown>
      this.eventPayloads.push(payload)
      return { rows: [{
        id: params[0], company_id: params[1], project_id: params[2],
        aggregate_type: params[3], aggregate_id: params[4], sequence: 1,
        aggregate_sequence: 1, event_type: params[5], schema_version: params[6],
        idempotency_key: params[7], actor_type: params[8], actor_id: params[9],
        payload, occurred_at: new Date('2026-01-01T00:00:00Z'),
      }], rowCount: 1 }
    }
    throw new Error(`unexpected query: ${text}`)
  }
}

function harness(db = new FakeDb()) {
  const synced: ImChannelProfile[] = []
  const permissions: string[] = []
  const application = new ContextThreadsApplication({
    transaction: (work) => work(db),
    assertCanManageLearning: async () => { permissions.push('manage') },
    assertCanWriteConversation: async () => { permissions.push('write') },
    isActiveProjectStudent: async (_queryable, _scope, studentId) => (
      db.participants.get(studentId)?.activeStudent === true
    ),
    syncChannel: async (profile) => { synced.push(profile) },
  })
  return { application, db, synced, permissions }
}

test('teacher takeover creates one same-Project Student thread and communication event', async () => {
  const { application, db, synced, permissions } = harness()
  const result = await application.createTeacherThread(scope, {
    contextType: 'TEACHER_TAKEOVER', studentId: 'student-1',
  })

  assert.equal(result.created, true)
  assert.equal(result.contextId, 'student-1')
  assert.deepEqual(result.participantIds, ['teacher-1', 'student-1'])
  assert.deepEqual(permissions, ['manage'])
  assert.equal(synced.length, 1)
  assert.deepEqual(db.eventPayloads, [{
    contextType: 'TEACHER_TAKEOVER', subjectParticipantId: 'student-1',
  }])
})

test('teacher thread rejects a human without an active same-Project Student membership', async () => {
  const { application, db, synced } = harness()
  db.participants.set('other-1', {
    kind: 'human', name: 'Other',
  })

  await assert.rejects(
    application.createTeacherThread(scope, {
      contextType: 'TEACHER_TAKEOVER', studentId: 'other-1',
    }),
    (error) => error instanceof ContextThreadApplicationError && error.code === 'invalid_student',
  )
  assert.equal(synced.length, 0)
})

test('intervention thread requires the case to belong to the selected Student', async () => {
  const { application } = harness()
  await assert.rejects(
    application.createTeacherThread(scope, {
      contextType: 'INTERVENTION', studentId: 'student-1', caseId: 'case-other',
    }),
    (error) => error instanceof ContextThreadApplicationError && error.code === 'not_found',
  )
})

test('an exact retry reuses the authoritative thread without another event or WuKong sync', async () => {
  const { application, db, synced } = harness()
  const input = { contextType: 'TEACHER_TAKEOVER' as const, studentId: 'student-1' }
  const first = await application.createTeacherThread(scope, input)
  const replay = await application.createTeacherThread(scope, input)

  assert.deepEqual(replay, { ...first, created: false })
  assert.equal(db.eventPayloads.length, 1)
  assert.equal(synced.length, 1)
})

test('learning thread only accepts an active Agent participant', async () => {
  const { application, permissions } = harness()
  const result = await application.createLearningThread(scope, 'agent-1')
  assert.equal(result.contextType, 'LEARNING')
  assert.deepEqual(permissions, ['write'])

  await assert.rejects(
    application.createLearningThread(scope, 'student-1'),
    (error) => error instanceof ContextThreadApplicationError && error.code === 'invalid_agent',
  )
})
