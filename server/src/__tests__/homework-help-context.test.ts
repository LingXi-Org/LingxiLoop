import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { z } from 'zod'
import type { Queryable } from '../db/queryable.js'
import { homeworkHelpRules } from '../modules/learning/homework-help.js'

const teacherRequirements = '先解释地址数量，再让学生独立计算本题；只用类似例子。'
const teacherFeedback = '请补充广播地址的判断理由。'
let bound = true, readable = true, learner = 'student', helpReads = 0
const state = { learner_id: 'student', assessment_id: 'now', evidence_revision: 2, return_epoch: 1, answer_revision: 99 }
const db = { query: async (sql: string) => {
  if (sql.includes('FROM homework_learner_state s')) return { rows: bound ? [{ homework_id: 'task', course_id: 'course', learner_id: learner, agent_id: 'tutor', channel_id: 'room' }] : [] }
  if (sql.includes('FROM context_threads')) return { rows: [] }
  assert.match(sql, /FROM homework_assessments/); helpReads++
  return { rows: [2, 1].map(revision => ({ id: revision === 2 ? 'now' : 'previous', evidence_revision: revision, return_epoch: 1, status: 'READY', message_ids: [`work-${revision}`],
    result: { criteria: [{ criterion: '解释地址数量', met: false }], evidence: [{ messageId: `work-${revision}`, excerpt: '32' }] },
    evidence: [{ messageId: `work-${revision}`, role: 'user', text: '32', sequence: revision * 10, materials: [] }] })) }
} } as unknown as Queryable
mock.module('../db/pool.js', { namedExports: { pool: db } })
mock.module('../agent-runtime/identity.js', { namedExports: { productConversationId: () => 'room' } })
mock.module('../agents/tools.js', { namedExports: { audienceHumanIds: async () => ['student'], authorizeAudienceRead: async () => {},
  compareResource: () => ({}), nativeContext: (value: unknown) => value, nativeTool: () => ({}) } })
mock.module('../modules/learning/homework-application.js', { namedExports: { HomeworkApplication: class {} } })
mock.module('../modules/learning/forum-evidence.js', { namedExports: { conversationReferencesSchema: z.array(z.unknown()) } })
mock.module('../modules/learning/homework-repository.js', { namedExports: {
  homeworkScope: async () => ({}), homeworkRow: async () => ({ company_id: 'school', id: 'task', title: '子网', instructions: teacherRequirements, criteria: ['解释地址数量'], links: [], attachments: [], status: 'PUBLISHED' }),
  homeworkState: async () => state, studentHomeworkView: async () => ({ status: 'RETURNED', criteria: [{ criterion: '解释地址数量', met: false }], unlocked: false, hasLearningRecord: true, canSubmit: true, feedback: teacherFeedback }),
} })
mock.module('../modules/learning/homework-reporting.js', { namedExports: { learnerHomeworkRead: async () => ({}), teacherHomeworkDraftReceipt: () => ({}), teacherHomeworkOverview: async () => ({}) } })
mock.module('../modules/learning/teacher-agent-application.js', { namedExports: { resolveTeacherScope: async () => ({}) } })
mock.module('../modules/learning/homework-effects.js', { namedExports: { homeworkEvidenceAvailable: async () => readable } })
const { loadHomeworkTurnContext } = await import('../modules/learning/homework-tools.js')
const work = { id: 'turn', companyId: 'school', authorizationUserId: 'student', agentId: 'tutor', channelId: 'room', triggerClientMsgNo: 'question', reason: 'message' as const }

test('the real authorized homework context carries adaptive help and preserves teacher task/feedback without changing learning status', async () => {
  const context = await loadHomeworkTurnContext(work, db, true)
  assert.equal(context?.help?.defaultDepth, 'explanation')
  assert.equal(context?.help?.criterionIndex, 0)
  assert.equal(context?.homework.instructions, teacherRequirements)
  assert.equal(context?.progress.feedback, teacherFeedback)
  assert.equal(context?.progress.unlocked, false)
  assert.equal(context?.progress.canSubmit, true)
  assert.equal(state.answer_revision, 99)
  assert.equal(helpReads, 1)
  assert.match(homeworkHelpRules(context?.help), /teacher requirements and current feedback/)
  readable = false
  assert.equal((await loadHomeworkTurnContext(work, db, true))?.help?.basis, 'unknown')
  readable = true
})

test('capability checks and ordinary chat do not read assessment history or add a tutoring rule', async () => {
  const before = helpReads
  assert.equal((await loadHomeworkTurnContext(work, db))?.help, undefined)
  assert.equal(helpReads, before)
  bound = false
  const ordinary = await loadHomeworkTurnContext(work, db, true)
  assert.equal(ordinary, null)
  assert.equal(homeworkHelpRules(ordinary), '')
  assert.equal(helpReads, before)
  bound = true
  learner = 'another-student'
  await assert.rejects(loadHomeworkTurnContext(work, db, true), /another learner/)
  assert.equal(helpReads, before)
  learner = 'student'
})
