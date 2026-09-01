import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import {
  bindLearningCourseRoom,
  loadLearningContext,
  proposeLearningEvaluation,
  recordLearningAttempt,
  reviewProjectLearningEvaluation,
  setLearningCourseMembership,
  startLearningMission,
} from '../modules/learning/application.js'
import {
  completeLearningMissionRecord,
  countPendingLearningEvaluations,
  findLearningMission,
  findLearningRoomState,
  listLearningMissions,
  learningStateContext,
  lockLearningMission,
  updateLearningMissionCoordinator,
  updateLearningMissionStepRecord,
  verifyIndependentLearningReport,
} from '../modules/learning/repository.js'

function queryable(
  handler: (text: string, params: readonly unknown[] | undefined) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params) => {
      const result = accessFixture(text, params) ?? handler(text, params)
      return { rows: result.rows ?? [], rowCount: result.rowCount ?? result.rows?.length ?? 0 } as never
    },
  }
}

function accessFixture(
  text: string,
  params: readonly unknown[] | undefined,
): { rows: unknown[]; rowCount?: number } | null {
  if (/SELECT id,email,email_verified_at,deleted_at,suspended_at FROM users/.test(text)) {
    return { rows: [{
      id: params?.[0], email: `${params?.[0]}@example.com`, email_verified_at: new Date(),
      deleted_at: null, suspended_at: null,
    }] }
  }
  if (/NULL::text AS resource_status FROM courses WHERE id=\$1/.test(text)) {
    return { rows: [{
      company_id: 'company-1', project_id: 'project-1', created_by: 'teacher-1',
      conversation_members: null, leader_id: null, resource_status: null,
    }] }
  }
  if (/SELECT id,company_id,kind,plan_id,status FROM projects/.test(text)) {
    const personal = params?.[0] === 'personal-project'
    return { rows: [{
      id: personal ? 'personal-project' : 'project-1', company_id: 'company-1',
      kind: personal ? 'PERSONAL_LEARNING' : 'TEACHING', plan_id: null, status: 'ACTIVE',
    }] }
  }
  if (/NULL::text AS leader_id,status AS resource_status FROM projects WHERE id=\$1/.test(text)) {
    const personal = params?.[0] === 'personal-project'
    return { rows: [{
      company_id: 'company-1', project_id: personal ? 'personal-project' : 'project-1',
      created_by: personal ? 'personal-owner' : 'teacher-1', conversation_members: null,
      leader_id: null, resource_status: 'ACTIVE',
    }] }
  }
  if (/SELECT id,type,status,plan_id FROM companies/.test(text)) {
    return { rows: [{ id: 'company-1', type: 'PERSONAL', status: 'ACTIVE', plan_id: 'plan-1' }] }
  }
  if (/SELECT role,status FROM company_memberships/.test(text)) {
    return { rows: [{ role: 'MEMBER', status: 'ACTIVE' }] }
  }
  if (/SELECT role,status FROM project_memberships/.test(text)) {
    const userId = String(params?.[2] ?? '')
    const projectId = String(params?.[1] ?? '')
    return { rows: [{
      role: projectId === 'personal-project' ? 'OWNER'
        : userId.includes('teacher') ? 'TEACHER' : 'STUDENT',
      status: 'ACTIVE',
    }] }
  }
  if (/SELECT id,code,status FROM plans/.test(text)) {
    return { rows: [{ id: 'plan-1', code: 'PERSONAL_FREE', status: 'ACTIVE' }] }
  }
  if (/FROM plan_entitlements/.test(text)) {
    return { rows: [
      { code: 'project.core', value: true },
      { code: 'learning.core', value: true },
    ] }
  }
  return null
}

const missionRow = {
  id: 'mission-1', project_id: 'project-1', learner_id: 'learner-1', conversation_id: 'room-1',
  trigger_client_msg_no: 'message-1', goal: 'Understand leases', success_criteria: 'Explain fencing',
  status: 'ACTIVE', kind: 'STUDY', coordinator_agent_id: 'nova',
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
}

test('mission lookup binds mission and step reads to the same tenant and project', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return text.includes('FROM learning_mission_steps') ? { rows: [{
      id: 'step-1', mission_id: 'mission-1', kind: 'CHECK', description: 'Explain',
      success_criteria: 'Correct invariant', knowledge_unit_id: null, status: 'OPEN', position: 0,
      outcome: null, completion_evidence_id: null, completion_attempt_id: null,
    }] } : { rows: [missionRow] }
  })

  const mission = await findLearningMission(db, 'company-1', 'project-1', 'mission-1')

  assert.deepEqual(calls[0]?.params, ['company-1','project-1','mission-1'])
  assert.deepEqual(calls[1]?.params, ['company-1','project-1',['mission-1']])
  assert.match(calls[1]?.text ?? '', /step\.company_id=\$1 AND step\.project_id=\$2/)
  assert.equal(mission?.steps[0]?.id, 'step-1')
})

test('mission list batches steps and preserves learner visibility scope', async () => {
  let calls = 0
  const db = queryable((text, params) => {
    calls++
    if (text.includes('FROM learning_mission_steps')) return { rows: [] }
    assert.deepEqual(params, ['company-1','project-1',false,'learner-1'])
    return { rows: [missionRow] }
  })

  const missions = await listLearningMissions(db, {
    companyId: 'company-1', projectId: 'project-1', userId: 'learner-1', includeAllLearners: false,
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
    companyId: 'company-1', projectId: 'project-1', missionId: 'mission-1',
    agentId: 'nova',
  })

  assert.equal(updated, true)
  assert.deepEqual(values, ['company-1','project-1','mission-1','nova'])
  assert.match(statement, /conversation\.members \? agent\.id/)
  assert.doesNotMatch(statement, /project_memberships|manager\.role/)
})

test('runtime room resolution and mission lock retain tenant, project and conversation predicates', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    if (text.includes('FROM conversations conversation')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1',
      project_kind: 'TEACHING', project_title: 'Course', project_status: 'ACTIVE', purpose: 'study',
    }] }
    return { rows: [{ exists: 1 }] }
  })

  const room = await findLearningRoomState(db, { companyId: 'company-1', channelId: 'room-1' })
  const locked = await lockLearningMission(db, {
    companyId: 'company-1', channelId: 'room-1', projectId: 'project-1', missionId: 'mission-1',
    statuses: ['ACTIVE','PAUSED'],
  })

  assert.equal(room?.courseId, 'course-1')
  assert.equal(locked, true)
  assert.deepEqual(calls[0]?.params, ['room-1','company-1'])
  assert.match(calls[0]?.text ?? '', /project\.kind IN \('TEACHING','INSTITUTIONAL_COURSE'\)/)
  assert.deepEqual(calls[1]?.params, ['company-1','project-1','room-1','mission-1',['ACTIVE','PAUSED']])
  assert.match(calls[1]?.text ?? '', /company_id=\$1 AND project_id=\$2 AND conversation_id=\$3/)
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
    companyId: 'company-1', projectId: 'project-1', channelId: 'room-1', missionId: 'mission-1',
    stepId: 'step-1', status: 'COMPLETED', outcome: 'verified', attemptId: 'attempt-1',
  })

  assert.equal(updated, true)
  assert.deepEqual(values?.slice(0, 6), ['company-1','project-1','room-1','mission-1','step-1','COMPLETED'])
  assert.match(statement, /step\.company_id=\$1 AND step\.project_id=\$2/)
  assert.match(statement, /attempt\.learner_id=mission\.learner_id/)
})

test('mission completion updates only active or paused state', async () => {
  let statement = ''
  const db = queryable((text) => {
    statement = text
    return { rowCount: 1 }
  })

  assert.equal(await completeLearningMissionRecord(db, {
    companyId: 'company-1', projectId: 'project-1', missionId: 'mission-1',
  }), true)
  assert.match(statement, /status IN \('ACTIVE','PAUSED'\)/)
})

test('Personal mission start needs no Course and publishes the committed project Mission', async () => {
  const statements: string[] = []
  const db = queryable((text) => {
    statements.push(text)
    if (text.includes('FROM conversations conversation')) return { rows: [{
      company_id: 'company-1', course_id: null, project_id: 'personal-project',
      project_kind: 'PERSONAL_LEARNING', project_title: 'My Learning', project_status: 'ACTIVE', purpose: 'study',
    }] }
    if (text.includes('FROM im_channel_bindings')) return { rows: [{ channel_type: 2 }] }
    if (text.includes('FROM project_memberships')) return { rows: [{ role: 'learner' }] }
    if (text.includes('FROM participants participant')) return { rows: [{ id: 'nova' }] }
    if (text.includes('INSERT INTO learning_missions')) return { rows: [{ id: 'mission-1', inserted: true }] }
    if (text.includes('INSERT INTO agent_work_items')) return { rowCount: 1 }
    if (text.includes('FROM learning_missions mission')) return { rows: [{
      ...missionRow, project_id: 'personal-project',
    }] }
    if (text.includes('FROM learning_mission_steps')) return { rows: [] }
    throw new Error(`unexpected query: ${text}`)
  })
  const published: Array<{ missionId: string; projectId: string; courseId?: string }> = []
  const metrics: string[] = []

  const mission = await startLearningMission(db, async (work) => work(db), {
    syncMessages: async () => [{
      clientMsgNo: 'message-1', fromUid: 'learner-1', authoredByAgent: false,
    }],
    publishMission: async ({ mission: committed, projectId, courseId }) => {
      published.push({ missionId: committed.id, projectId, ...(courseId ? { courseId } : {}) })
    },
    metric: (name) => { metrics.push(name) },
  }, {
    workId: 'work-1', companyId: 'company-1', channelId: 'room-1', agentId: 'agent-1',
    triggerClientMsgNo: 'message-1', goal: 'Understand leases', successCriteria: 'Explain fencing',
  })

  assert.equal(mission.id, 'mission-1')
  assert.deepEqual(published, [{ missionId: 'mission-1', projectId: 'personal-project' }])
  assert.deepEqual(metrics, ['learning.mission.created'])
  assert.equal(statements.filter((text) => text.includes('INSERT INTO learning_missions')).length, 1)
  assert.equal(statements.filter((text) => text.includes('INSERT INTO agent_work_items')).length, 1)
})

test('Agent OS attempt recording binds message evidence to one project learner', async () => {
  let insertedValues: readonly unknown[] | undefined
  let evidenceRow: Record<string, unknown> | undefined
  const db = queryable((text, params) => {
    if (text.includes('FROM conversations conversation')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1',
      project_kind: 'TEACHING', project_title: 'Course', project_status: 'ACTIVE', purpose: 'study',
    }] }
    if (text.includes('FROM im_channel_bindings')) return { rows: [{ channel_type: 2 }] }
    if (text.includes('FROM project_memberships')) return { rows: [{ role: 'learner' }] }
    if (text.includes('SELECT * FROM evidence_records')) {
      return { rows: evidenceRow ? [evidenceRow] : [] }
    }
    if (text.includes('INSERT INTO evidence_records')) {
      evidenceRow = {
        id: String(params?.[0]), company_id: 'company-1', project_id: 'project-1',
        level: 'L1', derivation: 'OBSERVED', kind: 'HOST_REFERENCES',
        subject_user_id: 'learner-1', data: JSON.parse(String(params?.[7])) as Record<string, unknown>,
        created_by_type: 'AGENT', created_by_id: 'agent-1',
        created_at: '2026-08-30T01:00:00.000Z',
      }
      return { rows: [evidenceRow] }
    }
    if (text.includes('INSERT INTO learning_attempts')) {
      insertedValues = params
      return { rowCount: 1 }
    }
    if (text.includes('SELECT 1 FROM learning_attempts')) return { rows: [{ '?column?': 1 }] }
    if (text.includes('INSERT INTO evidence_links')) return { rowCount: 1 }
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
    activityId: 'activity-1', evidenceClientMsgNos: ['message-1'], assistance: 'HINT',
  })

  assert.equal(attempt.learnerId, 'learner-1')
  assert.deepEqual(insertedValues?.slice(1, 8), [
    'company-1','project-1','room-1','learner-1','activity-1',null,'HINT',
  ])
  assert.deepEqual(evidenceRow?.data, {
    conversationId: 'room-1', clientMsgNos: ['message-1'], documents: [], canvasFrames: [],
  })
  assert.deepEqual(metrics, ['learning.attempt.accepted'])
})

test('learning turn context binds state and active mission reads to the room project', async () => {
  const db = queryable((text, params) => {
    if (text.includes('FROM conversations conversation')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1',
      project_kind: 'TEACHING', project_title: 'Course', project_status: 'ACTIVE', purpose: 'study',
    }] }
    if (text.includes('FROM project_memberships')) return { rows: [{ role: 'learner' }] }
    if (text.includes('FROM learning_knowledge_units unit')) return { rows: [{
      id: 'unit-1', project_id: 'project-1', title: 'Leases', success_criteria: 'Explain fencing',
      target_level: 3, position: 0, status: 'PUBLISHED', prerequisite_knowledge_unit_ids: [],
    }] }
    if (text.includes('FROM learning_states state')) {
      assert.deepEqual(params, ['company-1','project-1','learner-1'])
      return { rows: [{
        knowledge_unit_id: 'unit-1', level: 2, status: 'LEARNING', next_review_at: null,
      }] }
    }
    if (text.includes('SELECT mission.id FROM learning_missions')) {
      assert.deepEqual(params, ['company-1','project-1','learner-1','room-1'])
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
  assert.equal(context?.knowledgeUnits[0]?.level, 2)
  assert.equal(context?.project.id, 'project-1')
  assert.equal(context?.pendingTeacherReviews, 0)
})

test('Personal project context needs no Course and hard-bounds every model-visible collection', async () => {
  const long = 'x'.repeat(12_000)
  const units = Array.from({ length: 25 }, (_, index) => ({
    id: `unit-${index}-${long}`,
    project_id: 'personal-project',
    title: long,
    success_criteria: long,
    target_level: 3,
    position: index,
    status: 'PUBLISHED',
    prerequisite_knowledge_unit_ids: Array.from({ length: 20 }, (__, prerequisite) => (
      `prerequisite-${prerequisite}-${long}`
    )),
  }))
  const steps = Array.from({ length: 20 }, (_, index) => ({
    id: `step-${index}-${long}`,
    mission_id: 'mission-personal',
    kind: index % 2 ? 'CHECK' : 'REFLECT',
    description: long,
    success_criteria: long,
    knowledge_unit_id: `unit-${index}-${long}`,
    status: 'OPEN',
    position: index,
    outcome: long,
    completion_evidence_id: `evidence-${long}`,
    completion_attempt_id: `attempt-${long}`,
  }))
  const db = queryable((text) => {
    if (text.includes('FROM conversations conversation')) return { rows: [{
      company_id: 'company-1', course_id: null, project_id: 'personal-project',
      project_kind: 'PERSONAL_LEARNING', project_title: long, project_status: 'ACTIVE', purpose: 'study',
    }] }
    if (text.includes('FROM learning_knowledge_units unit')) return { rows: units }
    if (text.includes('FROM learning_states state')) return { rows: [] }
    if (text.includes('SELECT mission.id FROM learning_missions')) return { rows: [{ id: 'mission-personal' }] }
    if (text.includes('FROM learning_mission_steps')) return { rows: steps }
    if (text.includes('FROM learning_missions mission')) return { rows: [{
      ...missionRow,
      id: 'mission-personal',
      project_id: 'personal-project',
      goal: long,
      success_criteria: long,
      trigger_client_msg_no: long,
      coordinator_agent_id: long,
    }] }
    throw new Error(`unexpected query: ${text}`)
  })

  const context = await loadLearningContext(db, {
    syncMessages: async () => { throw new Error('explicit actor must not sync messages') },
  }, {
    companyId: 'company-1', channelId: 'personal-room', agentId: 'nova',
    triggerClientMsgNo: 'message-1', actorId: 'personal-owner',
  })

  assert.equal(context?.courseId, undefined)
  assert.equal(context?.actorRole, 'learner')
  assert.equal(context?.knowledgeUnits.length, 10)
  assert.equal(context?.knowledgeUnits[0]?.title.length, 160)
  assert.equal(context?.knowledgeUnits[0]?.successCriteria.length, 320)
  assert.equal(context?.knowledgeUnits[0]?.prerequisiteKnowledgeUnitIds.length, 6)
  assert.equal(context?.activeMission?.steps.length, 10)
  assert.equal(context?.activeMission?.goal.length, 400)
  assert.ok(JSON.stringify(context).length < 32_000)
})

test('agent evaluation proposal commits its project state after the evaluation ledger row', async () => {
  const statements: string[] = []
  const db = queryable((text) => {
    statements.push(text)
    if (text.includes('FROM conversations conversation')) return { rows: [{
      company_id: 'company-1', course_id: 'course-1', project_id: 'project-1',
      project_kind: 'TEACHING', project_title: 'Course', project_status: 'ACTIVE', purpose: 'study',
    }] }
    if (text.includes('FROM learning_attempts attempt') && text.includes('activity.evaluation_mode')) return { rows: [{
      learner_id: 'learner-1', assistance: 'NONE', activity_id: 'activity-1',
      activity_type: 'PRACTICE', evaluation_mode: 'AGENT_FORMATIVE', target_level: 2,
      knowledge_unit_ids: ['unit-1'],
    }] }
    if (text.includes('SELECT state.level FROM learning_states')) return { rows: [] }
    if (text.includes('INSERT INTO learning_evaluations')) return { rowCount: 1 }
    if (text.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (text.includes('FROM learning_states state') && text.includes('FOR UPDATE')) return { rows: [] }
    if (text.includes('SELECT DISTINCT CASE')) return { rows: [] }
    if (text.includes('SELECT CASE') && text.includes('AS evidence_key')) {
      return { rows: [{ evidence_key: 'ACTIVITY:activity-1' }] }
    }
    if (text.includes('INSERT INTO learning_states')) return { rowCount: 1 }
    if (text.includes("UPDATE learning_attempts SET status='EVALUATED'")) return { rowCount: 1 }
    throw new Error(`unexpected query: ${text}`)
  })
  const metrics: string[] = []

  const result = await proposeLearningEvaluation(db, async (work) => work(db), (name) => {
    metrics.push(name)
  }, {
    companyId: 'company-1', channelId: 'room-1', agentId: 'agent-1', attemptId: 'attempt-1',
    demonstratedLevel: 2, confidence: 0.9,
  })

  assert.equal(result.status, 'ACCEPTED')
  assert.equal(result.decisions.length, 1)
  assert.ok(statements.findIndex((text) => text.includes('INSERT INTO learning_evaluations'))
    < statements.findIndex((text) => text.includes('INSERT INTO learning_states')))
  assert.ok(statements.some((text) => text.includes("UPDATE learning_attempts SET status='EVALUATED'")))
  assert.ok(statements.every((text) => !text.includes('learning_mastery')))
  assert.ok(metrics.includes('learning.evaluation.proposed'))
})

test('independent Canvas verification resolves canonical Evidence IDs in one Project', async () => {
  let statement = ''
  let values: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    statement = text
    values = params
    return { rows: [{
      source_report_id: 'report-source', source_author: 'builder', verifier_author: 'verifier',
      verifies_report_id: 'report-source', verdict: 'supported',
    }] }
  })

  const verdict = await verifyIndependentLearningReport(db, {
    companyId: 'company-1', projectId: 'project-1',
    sourceEvidenceId: 'evidence-source', verifierEvidenceId: 'evidence-verifier',
  })

  assert.equal(verdict, 'supported')
  assert.deepEqual(values, ['evidence-source', 'evidence-verifier', 'company-1', 'project-1'])
  assert.match(statement, /source\.evidence_id=source_evidence\.id/)
  assert.match(statement, /verifier\.evidence_id=verifier_evidence\.id/)
})

test('Personal owner can reject a project evaluation and still finalize the attempt', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    if (text.includes('FROM learning_evaluations evaluation') && text.includes('FOR UPDATE')) return { rows: [{
      attempt_id: 'attempt-1', demonstrated_level: 2, confidence: 0.8, learner_id: 'learner-1',
      assistance: 'NONE', activity_type: 'PRACTICE', target_level: 2, knowledge_unit_ids: ['unit-1'],
    }] }
    if (text.includes('UPDATE learning_evaluations evaluation')) return { rowCount: 1 }
    if (text.includes("UPDATE learning_attempts SET status='EVALUATED'")) return { rowCount: 1 }
    throw new Error(`unexpected query: ${text}`)
  })

  await reviewProjectLearningEvaluation(db, async (work) => work(db), () => undefined, {
    companyId: 'company-1', projectId: 'personal-project', evaluationId: 'evaluation-1',
    reviewerId: 'personal-owner', decision: 'reject', reason: 'Evidence does not satisfy the rubric',
  })

  const review = calls.find((call) => call.text.includes('UPDATE learning_evaluations evaluation'))
  assert.deepEqual(review?.params, [
    'company-1','personal-project','evaluation-1','REJECTED','Evidence does not satisfy the rubric','personal-owner',
  ])
  assert.ok(calls.some((call) => call.text.includes("UPDATE learning_attempts SET status='EVALUATED'")))
  assert.ok(calls.every((call) => !call.text.includes('INSERT INTO learning_states')))
  assert.ok(calls.every((call) => !call.text.includes('learning_mastery')))
})

test('learning state and pending review reads carry explicit tenant and project scope', async () => {
  const calls: Array<{ text: string; params: readonly unknown[] | undefined }> = []
  const db = queryable((text, params) => {
    calls.push({ text, params })
    return { rows: [] }
  })

  await learningStateContext(db, {
    companyId: 'company-1', projectId: 'project-1', userId: 'learner-1',
  })
  await countPendingLearningEvaluations(db, 'company-1', 'project-1')

  assert.deepEqual(calls[0]?.params, ['company-1','project-1','learner-1'])
  assert.match(calls[0]?.text ?? '', /state\.company_id=\$1 AND state\.project_id=\$2 AND state\.user_id=\$3/)
  assert.deepEqual(calls[1]?.params, ['company-1','project-1'])
  assert.match(calls[1]?.text ?? '', /evaluation\.company_id=\$1 AND evaluation\.project_id=\$2/)
})

test('membership management refuses to remove the final tenant-scoped teacher', async () => {
  const db = queryable((text) => {
    if (text.includes('FROM courses course JOIN projects project')) return { rows: [{
      company_id: 'company-1', company_role: 'member', course_role: 'teacher',
      project_id: 'project-1', status: 'ACTIVE',
    }] }
    if (text.includes('SELECT project_id FROM courses')) return { rows: [{ project_id: 'project-1' }] }
    if (text.includes('SELECT 1 FROM company_memberships')) return { rows: [{ exists: 1 }] }
    if (text.includes('SELECT role FROM project_memberships')) return { rows: [{ role: 'TEACHER' }] }
    if (text.includes('SELECT COUNT(*)::int AS count FROM project_memberships')) return { rows: [{ count: 1 }] }
    throw new Error(`unexpected query: ${text}`)
  })

  await assert.rejects(() => setLearningCourseMembership(db, async (work) => work(db), {
    companyId: 'company-1', courseId: 'course-1', managerId: 'teacher-1',
    userId: 'teacher-1', role: 'teacher', enabled: false,
  }), /cannot remove the final course teacher/)
})

test('room binding authorizes the manager and persists one tenant-scoped project room', async () => {
  let bindingValues: readonly unknown[] | undefined
  const db = queryable((text, params) => {
    if (text.includes('FROM courses course JOIN projects project')) return { rows: [{
      company_id: 'company-1', company_role: 'member', course_role: 'teacher',
      project_id: 'project-1', status: 'ACTIVE',
    }] }
    if (text.includes('INSERT INTO learning_course_rooms')) {
      bindingValues = params
      return { rowCount: 1 }
    }
    throw new Error(`unexpected query: ${text}`)
  })

  await bindLearningCourseRoom(db, {
    companyId: 'company-1', courseId: 'course-1', managerId: 'teacher-1',
    conversationId: 'room-1', purpose: 'lab', enabled: true,
  })

  assert.deepEqual(bindingValues, ['company-1','course-1','room-1','lab','teacher-1'])
})
