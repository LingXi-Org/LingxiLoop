import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  loadLearningContext,
  proposeLearningEvaluation,
  recordLearningAttempt,
  reviewLearningEvaluation,
  startLearningMission,
} from '../modules/learning/application.js'
import {
  completeLearningMissionRecord,
  findLearningMission,
  findLearningRoomState,
  listLearningMissions,
  lockLearningMission,
  updateLearningMissionStepRecord,
  updateLearningMissionCoordinator,
  listLearningEvidenceRecords,
  listPendingLearningEvaluationRecords,
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

test('mission start validates human learner evidence and publishes the committed mission', async () => {
  const statements: string[] = []
  const db = queryable((text) => {
    statements.push(text)
    if (text.includes('FROM courses course') && text.includes('learning_course_rooms')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1', title: 'Course',
      status: 'active', purpose: 'study',
    }] }
    if (text.includes('FROM im_channel_bindings')) return { rows: [{ channel_type: 2 }] }
    if (text.includes('FROM course_members')) return { rows: [{ role: 'learner' }] }
    if (text.includes('FROM participants participant')) return { rows: [{ id: 'nova' }] }
    if (text.includes('INSERT INTO learning_missions')) return { rows: [{ id: 'mission-1', inserted: true }] }
    if (text.includes('INSERT INTO agent_work_items')) return { rowCount: 1 }
    if (text.includes('FROM learning_missions mission')) return { rows: [missionRow] }
    if (text.includes('FROM learning_mission_steps')) return { rows: [] }
    throw new Error(`unexpected query: ${text}`)
  })
  const published: string[] = []
  const metrics: string[] = []

  const mission = await startLearningMission(db, async (work) => work(db), {
    syncMessages: async () => [{
      clientMsgNo: 'message-1', fromUid: 'learner-1', authoredByAgent: false,
    }],
    publishMission: async ({ mission: committed }) => { published.push(committed.id) },
    metric: (name) => { metrics.push(name) },
  }, {
    workId: 'work-1', companyId: 'company-1', channelId: 'room-1', agentId: 'agent-1',
    triggerClientMsgNo: 'message-1', goal: 'Understand leases', successCriteria: 'Explain fencing',
  })

  assert.equal(mission.id, 'mission-1')
  assert.deepEqual(published, ['mission-1'])
  assert.deepEqual(metrics, ['learning.mission.created'])
  assert.equal(statements.filter((text) => text.includes('INSERT INTO learning_missions')).length, 1)
  assert.equal(statements.filter((text) => text.includes('INSERT INTO agent_work_items')).length, 1)
})

test('Agent OS attempt recording binds message evidence to one course learner', async () => {
  let insertedValues: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    if (text.includes('FROM courses course') && text.includes('learning_course_rooms')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1', title: 'Course',
      status: 'active', purpose: 'study',
    }] }
    if (text.includes('FROM im_channel_bindings')) return { rows: [{ channel_type: 2 }] }
    if (text.includes('FROM course_members')) return { rows: [{ role: 'learner' }] }
    if (text.includes('INSERT INTO learning_attempts')) {
      insertedValues = params
      return { rowCount: 1 }
    }
    throw new Error(`unexpected query: ${text}`)
  })
  const metrics: string[] = []

  const attempt = await recordLearningAttempt(db, async (work) => work(db), {
    syncMessages: async () => [{
      clientMsgNo: 'message-1', fromUid: 'learner-1', authoredByAgent: false,
    }],
    metric: (name) => { metrics.push(name) },
  }, {
    companyId: 'company-1', channelId: 'room-1', agentId: 'agent-1',
    activityId: 'activity-1', evidenceClientMsgNos: ['message-1'], assistance: 'hint',
  })

  assert.equal(attempt.learnerId, 'learner-1')
  assert.deepEqual(insertedValues?.slice(1, 8), [
    'course-1','company-1','room-1','learner-1','activity-1',null,'hint',
  ])
  assert.deepEqual(metrics, ['learning.attempt.accepted'])
})

test('learning turn context binds mastery and active mission reads to the room tenant', async () => {
  const db = queryable((text, params) => {
    if (text.includes('FROM courses course') && text.includes('learning_course_rooms')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1', title: 'Course',
      status: 'active', purpose: 'study',
    }] }
    if (text.includes('FROM course_members')) return { rows: [{ role: 'learner' }] }
    if (text.includes('FROM learning_objectives objective')) return { rows: [{
      id: 'objective-1', course_id: 'course-1', title: 'Leases', success_criteria: 'Explain fencing',
      target_level: 3, position: 0, status: 'published', prerequisite_ids: [],
    }] }
    if (text.includes('FROM learning_mastery mastery')) {
      assert.deepEqual(params, ['company-1','course-1','learner-1'])
      return { rows: [{
        objective_id: 'objective-1', level: 2, status: 'learning', next_review_at: null,
      }] }
    }
    if (text.includes('SELECT mission.id FROM learning_missions')) {
      assert.deepEqual(params, ['company-1','course-1','learner-1','room-1'])
      return { rows: [] }
    }
    throw new Error(`unexpected query: ${text}`)
  })

  const context = await loadLearningContext(db, {
    syncMessages: async () => { throw new Error('explicit actor must not sync messages') },
  }, {
    companyId: 'company-1', channelId: 'room-1', agentId: 'agent-1',
    triggerClientMsgNo: 'message-1', actorId: 'learner-1',
  })

  assert.equal(context?.learnerId, 'learner-1')
  assert.equal(context?.objectives[0]?.masteryLevel, 2)
  assert.equal(context?.pendingTeacherReviews, 0)
})

test('agent evaluation proposal commits the ledger row before returning accepted mastery', async () => {
  const statements: string[] = []
  const db = queryable((text) => {
    statements.push(text)
    if (text.includes('FROM courses course') && text.includes('learning_course_rooms')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1', title: 'Course',
      status: 'active', purpose: 'study',
    }] }
    if (text.includes('FROM learning_attempts attempt') && text.includes('activity.evaluation_mode')) return { rows: [{
      learner_id: 'learner-1', assistance: 'none', activity_id: 'activity-1',
      activity_type: 'practice', evaluation_mode: 'agent_formative', target_level: 2,
      objective_ids: ['objective-1'],
    }] }
    if (text.includes('SELECT mastery.level FROM learning_mastery')) return { rows: [] }
    if (text.includes('INSERT INTO learning_evaluations')) return { rowCount: 1 }
    if (text.includes('SELECT DISTINCT COALESCE')) return { rows: [] }
    if (text.includes('SELECT COALESCE(attempt.activity_id')) return { rows: [{ evidence_key: 'activity-1' }] }
    if (text.includes('FROM learning_mastery mastery') && text.includes('FOR UPDATE')) return { rows: [] }
    if (text.includes('INSERT INTO learning_mastery')) return { rowCount: 1 }
    if (text.includes('INSERT INTO learning_mastery_events')) return { rowCount: 1 }
    if (text.includes("UPDATE learning_attempts SET status='evaluated'")) return { rowCount: 1 }
    throw new Error(`unexpected query: ${text}`)
  })
  const metrics: string[] = []

  const result = await proposeLearningEvaluation(db, async (work) => work(db), (name) => {
    metrics.push(name)
  }, {
    companyId: 'company-1', channelId: 'room-1', agentId: 'agent-1', attemptId: 'attempt-1',
    demonstratedLevel: 2, confidence: 0.9,
  })

  assert.equal(result.status, 'accepted')
  assert.equal(result.decisions.length, 1)
  assert.ok(statements.findIndex((text) => text.includes('INSERT INTO learning_evaluations'))
    < statements.findIndex((text) => text.includes('INSERT INTO learning_mastery')))
  assert.ok(metrics.includes('learning.evaluation.proposed'))
})

test('teacher override reviews and projects mastery in one tenant-scoped transaction', async () => {
  const statements: string[] = []
  const db = queryable((text) => {
    statements.push(text)
    if (text.includes('FROM course_members')) return { rows: [{ role: 'teacher' }] }
    if (text.includes('FROM learning_evaluations evaluation') && text.includes('FOR UPDATE')) return { rows: [{
      attempt_id: 'attempt-1', demonstrated_level: 3, confidence: 0.8, learner_id: 'learner-1',
      assistance: 'none', activity_type: 'project', target_level: 3, objective_ids: ['objective-1'],
    }] }
    if (text.includes('UPDATE learning_evaluations evaluation')) return { rowCount: 1 }
    if (text.includes('FROM learning_mastery mastery') && text.includes('FOR UPDATE')) return { rows: [{
      level: 2, independent_evidence_count: 1, review_interval_days: 3,
    }] }
    if (text.includes('INSERT INTO learning_mastery')) return { rowCount: 1 }
    if (text.includes('INSERT INTO learning_mastery_events')) return { rowCount: 1 }
    if (text.includes("UPDATE learning_attempts SET status='evaluated'")) return { rowCount: 1 }
    throw new Error(`unexpected query: ${text}`)
  })

  await reviewLearningEvaluation(db, async (work) => work(db), () => undefined, {
    companyId: 'company-1', courseId: 'course-1', evaluationId: 'evaluation-1',
    teacherId: 'teacher-1', decision: 'accept', overrideLevel: 4, reason: 'Verified project transfer',
  })

  assert.ok(statements.findIndex((text) => text.includes('UPDATE learning_evaluations evaluation'))
    < statements.findIndex((text) => text.includes('INSERT INTO learning_mastery')))
  assert.ok(statements.some((text) => text.includes("kind,reason,actor_id")))
  assert.ok(statements.some((text) => text.includes("UPDATE learning_attempts SET status='evaluated'")))
})

test('evidence and pending review reads carry explicit tenant and course scope', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return { rows: [] }
  })

  await listLearningEvidenceRecords(db, {
    companyId: 'company-1', courseId: 'course-1', learnerId: 'learner-1',
  })
  await listPendingLearningEvaluationRecords(db, 'company-1', 'course-1')

  assert.deepEqual(calls[0]?.params, ['company-1','course-1','learner-1'])
  assert.match(calls[0]?.text ?? '', /attempt\.company_id=\$1 AND attempt\.course_id=\$2/)
  assert.deepEqual(calls[1]?.params, ['company-1','course-1'])
  assert.match(calls[1]?.text ?? '', /attempt\.company_id=\$1 AND attempt\.course_id=\$2/)
})
