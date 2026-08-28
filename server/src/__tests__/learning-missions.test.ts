import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  findLearningMission,
  listLearningMissions,
  updateLearningMissionCoordinator,
} from '../modules/learning/repository.js'

function queryable(
  handler: (text: string, params: readonly unknown[] | undefined) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params) => {
      const result = handler(text, params)
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 } as never
    },
  }
}

const missionRow = {
  id: 'mission-1', course_id: 'course-1', learner_id: 'learner-1', conversation_id: 'room-1',
  trigger_client_msg_no: 'message-1', goal: 'Understand leases', success_criteria: 'Explain fencing',
  status: 'active', mission_kind: 'study', coordinator_agent_id: 'nova',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}

test('mission lookup binds mission and step reads to the same tenant and course', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return text.includes('FROM learning_mission_steps') ? { rows: [{
      id: 'step-1', mission_id: 'mission-1', type: 'check', description: 'Explain',
      success_criteria: 'Correct invariant', objective_id: null, status: 'open', position: 0,
      outcome: null, completion_report_id: null, completion_attempt_id: null,
    }] } : { rows: [missionRow] }
  })

  const mission = await findLearningMission(db, 'company-1', 'course-1', 'mission-1')

  assert.deepEqual(calls[0]?.params, ['company-1','course-1','mission-1'])
  assert.deepEqual(calls[1]?.params, ['company-1','course-1',['mission-1']])
  assert.match(calls[1]?.text ?? '', /mission\.company_id=\$1 AND mission\.course_id=\$2/)
  assert.equal(mission?.steps[0]?.id, 'step-1')
})

test('mission list batches steps and preserves learner visibility scope', async () => {
  let calls = 0
  const db = queryable((text, params) => {
    calls++
    if (text.includes('FROM learning_mission_steps')) return { rows: [] }
    assert.deepEqual(params, ['company-1','course-1',false,'learner-1'])
    return { rows: [missionRow] }
  })

  const missions = await listLearningMissions(db, {
    companyId: 'company-1', courseId: 'course-1', userId: 'learner-1', includeAllLearners: false,
  })

  assert.equal(calls, 2)
  assert.equal(missions[0]?.learnerId, 'learner-1')
})

test('coordinator update atomically authorizes teacher and eligible room agent', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rowCount: 1 }
  })

  const updated = await updateLearningMissionCoordinator(db, {
    companyId: 'company-1', courseId: 'course-1', missionId: 'mission-1',
    teacherId: 'teacher-1', agentId: 'nova',
  })

  assert.equal(updated, true)
  assert.deepEqual(values, ['company-1','course-1','mission-1','teacher-1','nova'])
  assert.match(statement, /conversation\.members \? agent\.id/)
  assert.match(statement, /teacher\.user_id=\$4 AND teacher\.role='teacher'/)
})
