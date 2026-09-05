import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../../db/queryable.js'
import { teacherBriefingDashboard } from './dashboard.js'
import { teacherBriefingIdentity } from './identity.js'
import { TEACHER_BRIEFING_POLICY_V1 } from './policy.js'
import {
  claimTeacherBriefings,
  markTeacherBriefingSent,
  recordMeaningfulProjectVisit,
} from './repository.js'

test('teacher briefing dashboard is four token-colored Tool UI stats with real history', () => {
  const dashboard = teacherBriefingDashboard({
    id: 'briefing-1', company_id: 'company-1', project_id: 'project-1', teacher_user_id: 'teacher-1',
    context_thread_id: 'thread-1', client_msg_no: 'briefing-1', summary: '总结',
    statistics: { eventCount: 18, attentionCount: 3, A: 10, B: 8 },
    window_start_sequence: '120', window_end_sequence: '184', channel_id: 'channel-1', agent_id: 'agent-1',
    attention_item_ids: ['attention-1'], lease_token: 'lease-1',
  }, [{ eventCount: 12, attentionCount: 4, A: 12 }])

  assert.deepEqual(dashboard.stats.map((stat) => ({
    label: stat.label, value: stat.value, data: stat.sparkline.data, color: stat.sparkline.color,
  })), [
    { label: '学习更新', value: 18, data: [12, 18], color: 'var(--chart-1)' },
    { label: '需要关注', value: 3, data: [4, 3], color: 'var(--chart-2)' },
    { label: '正常进展', value: 15, data: [8, 15], color: 'var(--chart-3)' },
    { label: '更新类型', value: 2, data: [1, 2], color: 'var(--chart-4)' },
  ])
})

test('the same meaningful visit converges on one Briefing and stable WuKong client message ID', () => {
  const input = {
    companyId: 'company-1', projectId: 'project-1', teacherUserId: 'teacher-1', meaningfulVisitVersion: 4,
  }
  assert.deepEqual(teacherBriefingIdentity(input), teacherBriefingIdentity(input))
  assert.notDeepEqual(
    teacherBriefingIdentity(input),
    teacherBriefingIdentity({ ...input, meaningfulVisitVersion: 5 }),
  )
  assert.ok(teacherBriefingIdentity(input).clientMsgNo.length <= 80)
})

test('Project refresh updates visitedAt but advances meaningful visit version only after the policy interval', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = {
    query: async <_T>(text: string, params: readonly unknown[] = []): Promise<any> => {
      calls.push({ text, params })
      return { rows: [], rowCount: 1 }
    },
  }
  await recordMeaningfulProjectVisit(db, {
    companyId: 'company-1', projectId: 'project-1', userId: 'teacher-1', briefingEligible: true,
    eventSequence: 42, policy: TEACHER_BRIEFING_POLICY_V1,
  })

  assert.match(calls[0]?.text ?? '', /visited_at<=NOW\(\)-\(\$7::int\*INTERVAL '1 minute'\)/)
  assert.match(calls[0]?.text ?? '', /meaningful_visit_version=project_visits\.meaningful_visit_version\+CASE/)
  assert.deepEqual(calls[0]?.params.slice(3), [42, 'teacher-briefing.v1', true, 30])
})

test('Briefing delivery advances the event watermark only after the fenced SENT update succeeds', async () => {
  const statements: string[] = []
  const db: Queryable = {
    query: async <_T>(text: string): Promise<any> => {
      statements.push(text)
      if (text.includes('UPDATE teacher_briefings')) return {
        rows: [{
          company_id: 'company-1', project_id: 'project-1', teacher_user_id: 'teacher-1',
          window_end_sequence: '42',
        }],
        rowCount: 1,
      }
      return { rows: [], rowCount: 1 }
    },
  }
  await markTeacherBriefingSent(db, {
    id: 'briefing-1', leaseToken: 'lease-1', messageId: 'message-1', messageSequence: 9,
  })

  assert.match(statements[0] ?? '', /status='SENT'.*lease_token=\$2/s)
  assert.match(statements[1] ?? '', /event_sequence_watermark=GREATEST/)
})

test('an expired fifth-attempt lease is reclaimed without incrementing beyond the retry bound', async () => {
  let statement = ''
  const db: Queryable = {
    query: async <_T>(text: string): Promise<any> => {
      statement = text
      return { rows: [], rowCount: 0 }
    },
  }
  await claimTeacherBriefings(db, new Date('2026-09-01T00:00:00Z'), 'lease-2')

  assert.match(statement, /status='SENDING' AND attempts<=5/)
  assert.match(statement, /CASE WHEN briefing\.status='SENDING'[\s\S]*THEN briefing\.attempts ELSE briefing\.attempts\+1 END/)
})
