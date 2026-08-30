import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { pool } from '../db/pool.js'
import { ensureSchemaOnce, resetAllTables, teardownAll } from './_helpers.js'

interface PersonalProjectFixture {
  companyId: string
  projectId: string
  userId: string
  conversationId: string
}

interface LearningGraph extends PersonalProjectFixture {
  knowledgeUnitId: string
  activityId: string
  missionId: string
  missionStepId: string
  attemptId: string
  evaluationId: string
  caseId: string
}

async function expectConstraint(
  query: Promise<unknown>,
  code: '23503' | '23505' | '23514',
  constraint: string,
): Promise<void> {
  await assert.rejects(query, (error: unknown) => {
    const databaseError = error as { code?: string; constraint?: string }
    assert.equal(databaseError.code, code)
    assert.equal(databaseError.constraint, constraint)
    return true
  })
}

async function seedPersonalProject(suffix: string): Promise<PersonalProjectFixture> {
  const userId = `user-${suffix}`
  const companyId = `company-${suffix}`
  const projectId = `project-${suffix}`
  const conversationId = `conversation-${suffix}`
  await pool.query(
    `INSERT INTO users(id,email,display_name) VALUES($1,$2,$3)`,
    [userId, `${userId}@test.local`, `Learner ${suffix}`],
  )
  await pool.query(
    `INSERT INTO companies(id,name,slug,type,personal_owner_user_id,plan_id)
     VALUES($1,$2,$1,'PERSONAL',$3,'plan-personal-free')`,
    [companyId, `Personal ${suffix}`, userId],
  )
  await pool.query(
    `INSERT INTO company_memberships(company_id,user_id,role) VALUES($1,$2,'OWNER')`,
    [companyId,userId],
  )
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,name,created_by,is_default)
     VALUES($1,$2,'PERSONAL_LEARNING',$3,$4,TRUE)`,
    [projectId,companyId,`Learning ${suffix}`,userId],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES($1,$2,$3,'OWNER')`,
    [companyId,projectId,userId],
  )
  await pool.query(
    `INSERT INTO conversations(id,kind,title,members,company_id,project_id)
     VALUES($1,'group',$2,'[]'::jsonb,$3,$4)`,
    [conversationId,`Learning ${suffix}`,companyId,projectId],
  )
  return { companyId,projectId,userId,conversationId }
}

async function seedAdditionalProject(
  fixture: PersonalProjectFixture,
  suffix: string,
): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `project-${suffix}`
  const conversationId = `conversation-${suffix}`
  await pool.query(
    `INSERT INTO projects(id,company_id,kind,name,created_by,is_default)
     VALUES($1,$2,'PERSONAL_LEARNING',$3,$4,FALSE)`,
    [projectId,fixture.companyId,`Learning ${suffix}`,fixture.userId],
  )
  await pool.query(
    `INSERT INTO project_memberships(company_id,project_id,user_id,role)
     VALUES($1,$2,$3,'OWNER')`,
    [fixture.companyId,projectId,fixture.userId],
  )
  await pool.query(
    `INSERT INTO conversations(id,kind,title,members,company_id,project_id)
     VALUES($1,'group',$2,'[]'::jsonb,$3,$4)`,
    [conversationId,`Learning ${suffix}`,fixture.companyId,projectId],
  )
  return { projectId,conversationId }
}

async function seedLearningGraph(suffix: string): Promise<LearningGraph> {
  const fixture = await seedPersonalProject(suffix)
  const knowledgeUnitId = `unit-${suffix}`
  const activityId = `activity-${suffix}`
  const missionId = `mission-${suffix}`
  const missionStepId = `step-${suffix}`
  const attemptId = `attempt-${suffix}`
  const evaluationId = `evaluation-${suffix}`
  const caseId = `case-${suffix}`

  await pool.query(
    `INSERT INTO learning_knowledge_units
       (id,company_id,project_id,title,success_criteria,status,created_by)
     VALUES($1,$2,$3,'Linear equations','Solve independently','PUBLISHED',$4)`,
    [knowledgeUnitId,fixture.companyId,fixture.projectId,fixture.userId],
  )
  await pool.query(
    `INSERT INTO learning_activities
       (id,company_id,project_id,title,instructions,kind,status,evaluation_mode,created_by)
     VALUES($1,$2,$3,'Equation practice','Show every step','PRACTICE','PUBLISHED','AGENT_FORMATIVE',$4)`,
    [activityId,fixture.companyId,fixture.projectId,fixture.userId],
  )
  await pool.query(
    `INSERT INTO learning_activity_knowledge_units(company_id,project_id,activity_id,knowledge_unit_id)
     VALUES($1,$2,$3,$4)`,
    [fixture.companyId,fixture.projectId,activityId,knowledgeUnitId],
  )
  await pool.query(
    `INSERT INTO learning_missions
       (id,company_id,project_id,learner_id,conversation_id,trigger_client_msg_no,
        goal,success_criteria,kind,status,created_by)
     VALUES($1,$2,$3,$4,$5,$6,'Learn equations','Complete the check','STUDY','ACTIVE',$4)`,
    [missionId,fixture.companyId,fixture.projectId,fixture.userId,fixture.conversationId,`trigger-${suffix}`],
  )
  await pool.query(
    `INSERT INTO learning_mission_steps
       (id,company_id,project_id,mission_id,kind,description,success_criteria,knowledge_unit_id)
     VALUES($1,$2,$3,$4,'PRACTICE','Solve one equation','Correct solution',$5)`,
    [missionStepId,fixture.companyId,fixture.projectId,missionId,knowledgeUnitId],
  )
  await pool.query(
    `INSERT INTO learning_attempts
       (id,company_id,project_id,learner_id,activity_id,assistance,evidence,client_submission_id)
     VALUES($1,$2,$3,$4,$5,'NONE','{"answer":"x=2"}'::jsonb,$6)`,
    [attemptId,fixture.companyId,fixture.projectId,fixture.userId,activityId,`submission-${suffix}`],
  )
  await pool.query(
    `INSERT INTO learning_evaluations
       (id,company_id,project_id,attempt_id,demonstrated_level,confidence,evaluator_id,evaluator_kind,status)
     VALUES($1,$2,$3,$4,3,0.95,$5,'TEACHER','ACCEPTED')`,
    [evaluationId,fixture.companyId,fixture.projectId,attemptId,fixture.userId],
  )
  await pool.query(
    `INSERT INTO learning_states
       (company_id,project_id,user_id,knowledge_unit_id,level,status,independent_evidence_count,last_evidence_at)
     VALUES($1,$2,$3,$4,3,'LEARNING',1,NOW())`,
    [fixture.companyId,fixture.projectId,fixture.userId,knowledgeUnitId],
  )
  await pool.query(
    `INSERT INTO learning_cases
       (id,company_id,project_id,user_id,knowledge_unit_id,status,reason,version)
     VALUES($1,$2,$3,$4,$5,'IN_PROGRESS','Repeated misconception',2)`,
    [caseId,fixture.companyId,fixture.projectId,fixture.userId,knowledgeUnitId],
  )
  await pool.query(
    `INSERT INTO learning_case_actions
       (id,company_id,project_id,case_id,user_id,knowledge_unit_id,kind,result,
        from_status,to_status,case_version,idempotency_key,actor_id,
        activity_id,mission_id,attempt_id,evaluation_id)
     VALUES($1,$2,$3,$4,$5,$6,'DIAGNOSE','APPLIED','DETECTED','IN_PROGRESS',2,$7,$5,$8,$9,$10,$11)`,
    [
      `action-${suffix}`,fixture.companyId,fixture.projectId,caseId,fixture.userId,knowledgeUnitId,
      `action-key-${suffix}`,activityId,missionId,attemptId,evaluationId,
    ],
  )
  return {
    ...fixture,
    knowledgeUnitId,
    activityId,
    missionId,
    missionStepId,
    attemptId,
    evaluationId,
    caseId,
  }
}

before(async () => { await ensureSchemaOnce() })
beforeEach(async () => { await resetAllTables() })
after(async () => { await teardownAll() })

test('[integration] Personal Project owns the complete learning foundation without a course', async () => {
  const graph = await seedLearningGraph('personal-foundation')
  const { rows } = await pool.query<{
    courses: number
    units: number
    activities: number
    missions: number
    attempts: number
    evaluations: number
    states: number
    cases: number
    actions: number
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM courses WHERE project_id=$1) AS courses,
       (SELECT COUNT(*)::int FROM learning_knowledge_units WHERE project_id=$1) AS units,
       (SELECT COUNT(*)::int FROM learning_activities WHERE project_id=$1) AS activities,
       (SELECT COUNT(*)::int FROM learning_missions WHERE project_id=$1) AS missions,
       (SELECT COUNT(*)::int FROM learning_attempts WHERE project_id=$1) AS attempts,
       (SELECT COUNT(*)::int FROM learning_evaluations WHERE project_id=$1) AS evaluations,
       (SELECT COUNT(*)::int FROM learning_states WHERE project_id=$1) AS states,
       (SELECT COUNT(*)::int FROM learning_cases WHERE project_id=$1) AS cases,
       (SELECT COUNT(*)::int FROM learning_case_actions WHERE project_id=$1) AS actions`,
    [graph.projectId],
  )
  assert.deepEqual(rows, [{
    courses: 0,
    units: 1,
    activities: 1,
    missions: 1,
    attempts: 1,
    evaluations: 1,
    states: 1,
    cases: 1,
    actions: 1,
  }])
})

test('[integration] same-company wrong-project learning links fail closed', async () => {
  const graph = await seedLearningGraph('scope-a')
  const other = await seedAdditionalProject(graph, 'scope-b')
  const otherUnitId = 'unit-scope-b'
  const otherActivityId = 'activity-scope-b'
  await pool.query(
    `INSERT INTO learning_knowledge_units
       (id,company_id,project_id,title,success_criteria,created_by)
     VALUES($1,$2,$3,'Other unit','Other success',$4)`,
    [otherUnitId,graph.companyId,other.projectId,graph.userId],
  )
  await pool.query(
    `INSERT INTO learning_activities
       (id,company_id,project_id,title,instructions,kind,created_by)
     VALUES($1,$2,$3,'Other activity','Other instructions','PRACTICE',$4)`,
    [otherActivityId,graph.companyId,other.projectId,graph.userId],
  )

  await expectConstraint(pool.query(
    `INSERT INTO learning_knowledge_unit_dependencies
       (company_id,project_id,knowledge_unit_id,prerequisite_knowledge_unit_id)
     VALUES($1,$2,$3,$4)`,
    [graph.companyId,graph.projectId,graph.knowledgeUnitId,otherUnitId],
  ), '23503', 'learning_knowledge_unit_dependencies_prerequisite_fkey')

  await expectConstraint(pool.query(
    `INSERT INTO learning_activity_knowledge_units(company_id,project_id,activity_id,knowledge_unit_id)
     VALUES($1,$2,$3,$4)`,
    [graph.companyId,graph.projectId,graph.activityId,otherUnitId],
  ), '23503', 'learning_activity_knowledge_units_unit_fkey')

  await expectConstraint(pool.query(
    `INSERT INTO learning_attempts
       (id,company_id,project_id,learner_id,activity_id,evidence)
     VALUES('wrong-project-attempt',$1,$2,$3,$4,'{}'::jsonb)`,
    [graph.companyId,other.projectId,graph.userId,graph.activityId],
  ), '23503', 'learning_attempts_activity_fkey')

  await expectConstraint(pool.query(
    `INSERT INTO learning_evaluations
       (id,company_id,project_id,attempt_id,demonstrated_level,confidence,evaluator_id,evaluator_kind)
     VALUES('wrong-project-evaluation',$1,$2,$3,2,0.8,$4,'TEACHER')`,
    [graph.companyId,other.projectId,graph.attemptId,graph.userId],
  ), '23503', 'learning_evaluations_attempt_fkey')

  await expectConstraint(pool.query(
    `INSERT INTO learning_case_actions
       (id,company_id,project_id,case_id,user_id,knowledge_unit_id,kind,result,
        from_status,to_status,case_version,idempotency_key,actor_id,activity_id)
     VALUES('wrong-project-action',$1,$2,$3,$4,$5,'INTERVENE','APPLIED',
            'IN_PROGRESS','IN_PROGRESS',3,'wrong-project-action-key',$4,$6)`,
    [graph.companyId,graph.projectId,graph.caseId,graph.userId,graph.knowledgeUnitId,otherActivityId],
  ), '23503', 'learning_case_actions_activity_fkey')
})

test('[integration] cross-tenant learning links, duplicate open cases and action retries are rejected', async () => {
  const graph = await seedLearningGraph('tenant-a')
  const other = await seedPersonalProject('tenant-b')

  await expectConstraint(pool.query(
    `INSERT INTO learning_attempts
       (id,company_id,project_id,learner_id,activity_id,evidence)
     VALUES('cross-tenant-attempt',$1,$2,$3,$4,'{}'::jsonb)`,
    [other.companyId,other.projectId,other.userId,graph.activityId],
  ), '23503', 'learning_attempts_activity_fkey')

  await expectConstraint(pool.query(
    `INSERT INTO learning_states(company_id,project_id,user_id,knowledge_unit_id)
     VALUES($1,$2,$3,$4)`,
    [graph.companyId,graph.projectId,other.userId,graph.knowledgeUnitId],
  ), '23503', 'learning_states_project_member_fkey')

  await expectConstraint(pool.query(
    `INSERT INTO learning_cases
       (id,company_id,project_id,user_id,knowledge_unit_id,status,reason)
     VALUES('duplicate-resolved-case',$1,$2,$3,$4,'RESOLVED','Still open until closed')`,
    [graph.companyId,graph.projectId,graph.userId,graph.knowledgeUnitId],
  ), '23505', 'uniq_learning_cases_open')

  await expectConstraint(pool.query(
    `INSERT INTO learning_case_actions
     (id,company_id,project_id,case_id,user_id,knowledge_unit_id,kind,result,
        from_status,to_status,case_version,idempotency_key,actor_id)
     VALUES('duplicate-action-key',$1,$2,$3,$4,$5,'DIAGNOSE','ALREADY_APPLIED',
            'IN_PROGRESS','IN_PROGRESS',2,$6,$4)`,
    [graph.companyId,graph.projectId,graph.caseId,graph.userId,graph.knowledgeUnitId,'action-key-tenant-a'],
  ), '23505', 'learning_case_actions_idempotency_key')

  await expectConstraint(pool.query(
    `INSERT INTO learning_case_actions
       (id,company_id,project_id,case_id,user_id,knowledge_unit_id,kind,result,
        from_status,to_status,case_version,idempotency_key,actor_id)
     VALUES('invalid-transition-action',$1,$2,$3,$4,$5,'REASSESS','INVALID',
            'IN_PROGRESS','RESOLVED',3,'invalid-transition-key',$4)`,
    [graph.companyId,graph.projectId,graph.caseId,graph.userId,graph.knowledgeUnitId],
  ), '23514', 'learning_case_actions_result_check')

  await expectConstraint(pool.query(
    `INSERT INTO learning_case_actions
       (id,company_id,project_id,case_id,user_id,knowledge_unit_id,kind,result,
        from_status,to_status,case_version,idempotency_key,actor_id)
     VALUES('unsupported-transition-action',$1,$2,$3,$4,$5,'CLOSE','APPLIED',
            'DETECTED','CLOSED',3,'unsupported-transition-key',$4)`,
    [graph.companyId,graph.projectId,graph.caseId,graph.userId,graph.knowledgeUnitId],
  ), '23514', 'learning_case_actions_transition_check')

  await pool.query(`UPDATE learning_cases SET status='CLOSED',closed_at=NOW() WHERE id=$1`, [graph.caseId])
  await pool.query(
    `INSERT INTO learning_cases
       (id,company_id,project_id,user_id,knowledge_unit_id,status,reason)
     VALUES('replacement-open-case',$1,$2,$3,$4,'DETECTED','New issue after explicit closure')`,
    [graph.companyId,graph.projectId,graph.userId,graph.knowledgeUnitId],
  )
  const { rows } = await pool.query<{ status: string }>(
    `SELECT status FROM learning_cases WHERE project_id=$1 ORDER BY created_at,id`,
    [graph.projectId],
  )
  assert.deepEqual(rows.map((row) => row.status).sort(), ['CLOSED','DETECTED'])
})
