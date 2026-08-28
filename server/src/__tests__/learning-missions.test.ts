import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  completeLearningMissionRecord,
  findLearningMission,
  findLearningRoomState,
  listLearningMissions,
  lockLearningMission,
  updateLearningMissionStepRecord,
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

test('runtime room resolution and mission lock retain tenant, course and conversation predicates', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    if (text.includes('FROM courses course')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1', title: 'Course',
      status: 'active', purpose: 'study',
    }] }
    return { rows: [{ exists: 1 }] }
  })

  const room = await findLearningRoomState(db, { companyId: 'company-1', channelId: 'room-1' })
  const locked = await lockLearningMission(db, {
    companyId: 'company-1', channelId: 'room-1', courseId: 'course-1', missionId: 'mission-1',
    statuses: ['active','paused'],
  })

  assert.equal(room?.courseId, 'course-1')
  assert.equal(locked, true)
  assert.deepEqual(calls[0]?.params, ['room-1','company-1'])
  assert.deepEqual(calls[1]?.params, ['company-1','course-1','room-1','mission-1',['active','paused']])
  assert.match(calls[1]?.text ?? '', /company_id=\$1 AND course_id=\$2 AND conversation_id=\$3/)
})

test('step completion binds evidence to the mission tenant and learner', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rowCount: 1 }
  })

  const updated = await updateLearningMissionStepRecord(db, {
    companyId: 'company-1', courseId: 'course-1', channelId: 'room-1', missionId: 'mission-1',
    stepId: 'step-1', status: 'completed', outcome: 'verified', attemptId: 'attempt-1',
  })

  assert.equal(updated, true)
  assert.deepEqual(values?.slice(0, 6), ['company-1','course-1','room-1','mission-1','step-1','completed'])
  assert.match(statement, /mission\.company_id=\$1 AND mission\.course_id=\$2 AND mission\.conversation_id=\$3/)
  assert.match(statement, /attempt\.learner_id=mission\.learner_id/)
})

test('mission completion updates only active or paused state', async () => {
  let statement = ''
  const db = queryable((text) => {
    statement = text
    return { rowCount: 1 }
  })

  assert.equal(await completeLearningMissionRecord(db, 'mission-1'), true)
  assert.match(statement, /status IN \('active','paused'\)/)
})
