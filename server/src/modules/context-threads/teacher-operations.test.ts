import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../../db/queryable.js'
import { bindTeacherOperationsContextThread } from './teacher-operations.js'

const args = {
  companyId: 'company-1', projectId: 'project-1', teacherId: 'teacher-1',
  agentId: 'agent-1', channelId: 'teacher-room-1',
}
const threadId = `ctx-${createHash('sha256')
  .update([args.companyId, args.projectId, 'TEACHER_OPERATIONS'].join('\0'))
  .digest('hex').slice(0, 24)}`

function replayDb(overrides: Record<string, unknown> = {}): Queryable {
  return {
    query: async <_T>(text: string): Promise<any> => {
      if (text.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 }
      if (text.includes('FROM context_threads thread')) return {
        rows: [{
          id: threadId,
          channel_id: args.channelId,
          context_type: 'TEACHER_OPERATIONS',
          context_id: args.projectId,
          created_by: args.teacherId,
          participant_ids: [args.agentId, args.teacherId],
          ...overrides,
        }],
        rowCount: 1,
      }
      throw new Error(`unexpected query: ${text}`)
    },
  }
}

test('Teacher operations ContextThread replay requires the same authority facts', async () => {
  assert.deepEqual(await bindTeacherOperationsContextThread(replayDb(), args), {
    id: threadId, channelId: args.channelId, created: false,
  })

  await assert.rejects(
    bindTeacherOperationsContextThread(replayDb({ channel_id: 'other-room' }), args),
    /does not match its authority/,
  )
})
