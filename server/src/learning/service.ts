import { createHash, randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { wukongClient } from '../im/wukong.js'
import { inc } from '../metrics.js'
import { findLearningMission, listLearningObjectives } from '../modules/learning/repository.js'
import type { AgentWorkItem } from '../agent-os/types.js'
import type {
  LearningActivityType,
  LearningAssistance,
  LearningCourseSummary,
  LearningEvaluationMode,
  LearningMission,
  LearningRole,
  LearningRoomPurpose,
  LearningStepStatus,
  LearningStepType,
  LearningTurnContext,
  MasteryProjectionDecision,
} from './types.js'
import { projectMastery } from './mastery.js'
export { projectMastery } from './mastery.js'

function asText(value: unknown, name: string, maxLength = 10_000): string {
  const text = String(value ?? '').trim()
  if (!text) throw new Error(`${name} is required`)
  if (text.length > maxLength) throw new Error(`${name} exceeds ${maxLength} characters`)
  return text
}

const REVIEW_INTERVAL_BY_LEVEL = [1, 1, 3, 7, 21] as const

async function courseRole(db: Queryable, courseId: string, userId: string): Promise<LearningRole | undefined> {
  const { rows } = await db.query<{ role: LearningRole }>(
    `SELECT member.role
       FROM course_members member
       JOIN courses course ON course.id=member.course_id AND course.company_id=member.company_id
       JOIN company_members company_member
         ON company_member.company_id=member.company_id AND company_member.user_id=member.user_id
      WHERE member.course_id=$1 AND member.user_id=$2`,
    [courseId, userId],
  )
  return rows[0]?.role
}

export async function requireCourseRole(courseId: string, userId: string, role: LearningRole, db: Queryable = pool): Promise<void> {
  const actualRole = await courseRole(db, courseId, userId)
  if (actualRole !== role) { inc('learning.authorization.denied', { role }); throw new Error(`course ${role} role required`) }
}

/** Course metadata and enrollment may be managed by tenant owner/admin even
 * without a teacher role. Evidence visibility never calls this helper. */
export async function requireCourseManager(courseId: string, userId: string, db: Queryable = pool): Promise<void> {
  const { rows } = await db.query(
    `SELECT 1
       FROM courses course
       LEFT JOIN course_members member
         ON member.course_id=course.id AND member.company_id=course.company_id
        AND member.user_id=$2 AND member.role='teacher'
       LEFT JOIN company_members company_member
         ON company_member.company_id=course.company_id AND company_member.user_id=$2
        AND company_member.role IN ('owner','admin')
      WHERE course.id=$1 AND (member.user_id IS NOT NULL OR company_member.user_id IS NOT NULL)
      LIMIT 1`, [courseId,userId],
  )
  if (!rows[0]) { inc('learning.authorization.denied', { role: 'manager' }); throw new Error('course manager role required') }
}

async function listCourseSummaries(companyId: string, userId: string, db: Queryable): Promise<LearningCourseSummary[]> {
  const { rows } = await db.query<{
    id: string; company_id: string; project_id: string; title: string; description: string
    status: 'active' | 'archived'; course_role: LearningRole
    room_count: number; objective_count: number; learner_count: number
    created_at: string; updated_at: string
  }>(
    `SELECT course.id,course.company_id,course.project_id,project.name AS title,
            project.description,project.status,member.role AS course_role,
            ((course.study_room_conversation_id IS NOT NULL)::int
              + (SELECT COUNT(*)::int FROM learning_course_rooms room WHERE room.course_id=course.id)) AS room_count,
            (SELECT COUNT(*)::int FROM learning_objectives objective
              WHERE objective.course_id=course.id AND objective.status<>'archived') AS objective_count,
            (SELECT COUNT(*)::int FROM course_members learner
              WHERE learner.course_id=course.id AND learner.role='learner') AS learner_count,
            course.created_at,project.updated_at
       FROM courses course
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN course_members member
         ON member.course_id=course.id AND member.company_id=course.company_id AND member.user_id=$2
       JOIN company_members company_member
         ON company_member.company_id=member.company_id AND company_member.user_id=member.user_id
       WHERE course.company_id=$1
       ORDER BY project.status,project.updated_at DESC`,
    [companyId, userId],
  )
  return rows.map((row) => ({
    id: row.id,
    companyId: row.company_id,
    projectId: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    courseRole: row.course_role,
    roomCount: Number(row.room_count),
    objectiveCount: Number(row.objective_count),
    learnerCount: Number(row.learner_count),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }))
}

export async function setCourseMembership(input: {
  courseId: string; teacherId: string; userId: string; role: LearningRole; enabled: boolean
}, db: Queryable = pool): Promise<void> {
  await requireCourseManager(input.courseId, input.teacherId, db)
  const { rows } = await db.query<{ company_id: string }>(
    `SELECT course.company_id
       FROM courses course
       JOIN company_members member ON member.company_id=course.company_id AND member.user_id=$2
      WHERE course.id=$1`,
    [input.courseId, input.userId],
  )
  if (!rows[0]) throw new Error('course members must already belong to the company')
  if (input.enabled) {
    await db.query(
      `INSERT INTO course_members(course_id,company_id,user_id,role)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(course_id,user_id) DO UPDATE SET role=EXCLUDED.role,updated_at=NOW()`,
      [input.courseId, rows[0].company_id, input.userId, input.role],
    )
  } else {
    if(input.role==='teacher'){
      const {rows:counts}=await db.query<{count:number}>(`SELECT COUNT(*)::int AS count FROM course_members WHERE course_id=$1 AND role='teacher'`,[input.courseId])
      if(Number(counts[0]?.count)<=1)throw new Error('cannot remove the final course teacher')
      await db.query(
        `UPDATE course_members SET role='learner',updated_at=NOW()
          WHERE course_id=$1 AND user_id=$2 AND role='teacher'`,
        [input.courseId, input.userId],
      )
    } else {
      await db.query(`DELETE FROM course_members WHERE course_id=$1 AND user_id=$2 AND role='learner'`, [input.courseId, input.userId])
    }
  }
  if (input.role === 'teacher') {
    const { syncTeacherRoomMembers } = await import('./teacher-agent.js')
    await syncTeacherRoomMembers(input.courseId, db)
  }
}

export async function bindCourseRoom(input: {
  courseId: string; teacherId: string; conversationId: string; purpose: LearningRoomPurpose
}, db: Queryable = pool): Promise<void> {
  await requireCourseManager(input.courseId, input.teacherId, db)
  if (input.purpose === 'study') throw new Error('the Study Room is owned by courses.study_room_conversation_id')
  const { rows } = await db.query<{ company_id: string }>(
    `SELECT course.company_id
       FROM courses course
       JOIN conversations conversation
         ON conversation.company_id=course.company_id AND conversation.project_id=course.project_id
      WHERE course.id=$1 AND conversation.id=$2 AND conversation.kind='group'
       AND NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms tr WHERE tr.conversation_id=conversation.id)`, [input.courseId, input.conversationId],
  )
  if (!rows[0]) throw new Error('room must be a group in the course project')
  await db.query(
    `INSERT INTO learning_course_rooms(course_id,company_id,conversation_id,purpose,created_by)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(conversation_id) DO UPDATE
       SET course_id=EXCLUDED.course_id,company_id=EXCLUDED.company_id,
           purpose=EXCLUDED.purpose,created_by=EXCLUDED.created_by`,
    [input.courseId, rows[0].company_id, input.conversationId, input.purpose, input.teacherId],
  )
}

/** A learner pressing Submit is itself a Host-verified evidence source. The
 * API binds authorship to the authenticated session and published activity. */
export async function listEvidence(courseId: string, userId: string, learnerId = userId, db: Queryable = pool): Promise<unknown[]> {
  const role = await courseRole(db, courseId, userId)
  if (role !== 'teacher' && (role !== 'learner' || learnerId !== userId)) throw new Error('course evidence access denied')
  const { rows } = await db.query(
    `SELECT a.id,a.activity_id,a.mission_step_id,a.assistance,a.status,a.evidence,a.submitted_at AS created_at,
            e.id AS evaluation_id,e.demonstrated_level,e.confidence,e.rubric_results,e.feedback,e.status AS evaluation_status
       FROM learning_attempts a LEFT JOIN learning_evaluations e ON e.attempt_id=a.id
      WHERE a.course_id=$1 AND a.learner_id=$2 ORDER BY a.submitted_at DESC LIMIT 200`, [courseId, learnerId],
  )
  return rows
}

export async function listEvaluationQueue(courseId: string, teacherId: string, db: Queryable = pool): Promise<unknown[]> {
  await requireCourseRole(courseId, teacherId, 'teacher', db)
  const { rows } = await db.query(
    `SELECT e.id,e.attempt_id,e.demonstrated_level,e.confidence,e.rubric_results,e.feedback,e.created_at,
            e.source_report_id,e.verifier_report_id,source.author_agent_id AS builder_agent_id,
            verifier.author_agent_id AS verifier_agent_id,verifier.verdict AS verifier_verdict,
            a.learner_id,a.activity_id,a.assistance,a.evidence,act.title AS activity_title
       FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id
       LEFT JOIN learning_activities act ON act.id=a.activity_id
       LEFT JOIN canvas_assignment_reports source ON source.id=e.source_report_id
       LEFT JOIN canvas_assignment_reports verifier ON verifier.id=e.verifier_report_id
      WHERE a.course_id=$1 AND e.status='pending' ORDER BY e.created_at ASC`, [courseId],
  )
  return rows
}

async function roomScope(work: AgentWorkItem, db: Queryable = pool): Promise<{
  companyId: string; courseId: string; projectId: string; courseTitle: string; courseStatus: 'active'|'archived'; purpose: LearningRoomPurpose
}> {
  const { rows } = await db.query<{
    company_id:string;course_id:string;project_id:string;title:string;status:'active'|'archived';purpose:LearningRoomPurpose
  }>(
    `SELECT course.company_id,course.id AS course_id,course.project_id,project.name AS title,project.status,
            CASE WHEN course.study_room_conversation_id=$1 THEN 'study'::text ELSE room.purpose END AS purpose
       FROM courses course
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       LEFT JOIN learning_course_rooms room
         ON room.course_id=course.id AND room.company_id=course.company_id AND room.conversation_id=$1
      WHERE course.company_id=$2 AND project.status='active'
        AND (course.study_room_conversation_id=$1 OR room.conversation_id=$1)
      LIMIT 1`, [work.channelId, work.companyId],
  )
  const row = rows[0]
  if (!row) throw new Error('current conversation is not bound to a learning course')
  return { companyId: row.company_id, courseId: row.course_id, projectId: row.project_id, courseTitle: row.title, courseStatus: row.status, purpose: row.purpose }
}

async function requireLearningMission(
  db: Queryable,
  companyId: string,
  courseId: string,
  missionId: string,
): Promise<LearningMission> {
  const mission = await findLearningMission(db, companyId, courseId, missionId)
  if (!mission) throw new Error('mission not found')
  return mission
}

export function preferredCoordinatorPreset(kind:import('./types.js').LearningMissionKind):'nova'|'scout'|'forge' {
  return kind==='project'?'forge':kind==='research'?'scout':'nova'
}

export async function startMission(work: AgentWorkItem, input: {
  goal: string; successCriteria: string; missionKind?: import('./types.js').LearningMissionKind; sourceClientMsgNo?: string; explicit?: boolean
}, db: Queryable = pool): Promise<LearningMission> {
  const scope = await roomScope(work, db)
  if (scope.purpose !== 'study' && input.explicit !== true) throw new Error('automatic missions are allowed only in course-bound study rooms; set explicit=true only for a direct learner request')
  const triggerClientMsgNo = input.sourceClientMsgNo?.trim() || work.triggerClientMsgNo
  const learnerId = await validateLearnerMessage(work, scope.courseId, triggerClientMsgNo, db)
  const missionKind = input.missionKind ?? (scope.purpose === 'lab' ? 'project' : 'study')
  if (!['study','research','project'].includes(missionKind)) throw new Error('missionKind must be study, research, or project')
  const preferredPreset = preferredCoordinatorPreset(missionKind)
  const { rows: coordinators } = await db.query<{ id:string }>(
    `SELECT p.id FROM participants p JOIN conversations c ON c.id=$2 AND c.company_id=$1
      WHERE p.company_id=$1 AND p.kind='agent' AND p.departed_at IS NULL
        AND p.capabilities @> '["canvas","learning"]'::jsonb AND c.members ? p.id
      ORDER BY CASE WHEN p.preset_key=$3 THEN 0 WHEN p.preset_key='nova' THEN 1 WHEN p.id=$4 THEN 2 ELSE 3 END,p.id LIMIT 1`,
    [work.companyId,work.channelId,preferredPreset,work.agentId],
  )
  const coordinatorAgentId=coordinators[0]?.id
  if (!coordinatorAgentId) throw new Error('no eligible Mission coordinator is available in the current learning room')
  const id = randomUUID()
  const { rows } = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO learning_missions(id,course_id,company_id,learner_id,conversation_id,trigger_client_msg_no,goal,success_criteria,mission_kind,coordinator_agent_id,created_by)
     SELECT $1,$2,course.company_id,$3,$4,$5,$6,$7,$8,$9,$10
       FROM courses course WHERE course.id=$2
     ON CONFLICT(course_id,learner_id,conversation_id,trigger_client_msg_no)
     DO UPDATE SET updated_at=learning_missions.updated_at RETURNING id,(xmax=0) AS inserted`,
    [id, scope.courseId, learnerId, work.channelId, triggerClientMsgNo, asText(input.goal, 'goal'), asText(input.successCriteria, 'successCriteria'), missionKind, coordinatorAgentId, work.agentId],
  )
  inc(rows[0].inserted ? 'learning.mission.created' : 'learning.mission.deduplicated', rows[0].inserted ? { mode: 'agent' } : undefined)
  const mission = await requireLearningMission(db, scope.companyId, scope.courseId, rows[0].id)
  if (rows[0].inserted&&coordinatorAgentId!==work.agentId) {
    const coordinatorWorkId=`mission-coordinator-${createHash('sha256').update(mission.id).digest('hex').slice(0,24)}`
    await db.query(
      `INSERT INTO agent_work_items(id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,status,priority,execution_role)
       VALUES($1,$2,$3,$4,$5,$6,'handoff','queued',190,'coordinator') ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING`,
      [coordinatorWorkId,work.companyId,coordinatorAgentId,work.channelId,work.threadRootClientMsgNo??triggerClientMsgNo,`mission-coordinator:${mission.id}`],
    )
  }
  const { rows: binding } = await db.query<{ channel_type: number }>(
    `SELECT COALESCE((profile->>'channelType')::int,2) AS channel_type FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [work.channelId, work.companyId],
  )
  await wukongClient().sendMessage(work.channelId, Number(binding[0]?.channel_type ?? 2), work.agentId, {
    version: 1, kind: 'learning_mission', clientMsgNo: `learning-mission-${mission.id}`,
    body: mission.goal, refs: { agentId: work.agentId },
    data: { missionId: mission.id, courseId: scope.courseId, goal: mission.goal, successCriteria: mission.successCriteria, missionKind:mission.missionKind, coordinatorAgentId:mission.coordinatorAgentId, status: mission.status, suppressAgentWake: true },
  })
  return mission
}

export async function addMissionSteps(work: AgentWorkItem, missionId: string, rawSteps: Array<{
  type: LearningStepType; description: string; successCriteria: string; objectiveId?: string
}>, db: Queryable = pool): Promise<LearningMission> {
  const scope = await roomScope(work, db)
  if (!rawSteps.length || rawSteps.length > 64) throw new Error('steps must contain between 1 and 64 items')
  const { rows: missionRows } = await db.query<{ id: string }>(
    `SELECT id FROM learning_missions WHERE id=$1 AND course_id=$2 AND conversation_id=$3 AND status IN ('planning','active','paused')`,
    [missionId, scope.courseId, work.channelId],
  )
  if (!missionRows[0]) throw new Error('mission not found in current learning room')
  const ownsClient = db === pool
  const client = ownsClient ? await pool.connect() : db as unknown as PoolClient
  try {
    await client.query('BEGIN')
    const { rows: countRows } = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM learning_mission_steps WHERE mission_id=$1`, [missionId])
    let position = Number(countRows[0]?.count ?? 0)
    for (const step of rawSteps) {
      if (step.objectiveId) {
        const { rows: objective } = await client.query(`SELECT 1 FROM learning_objectives WHERE id=$1 AND course_id=$2`, [step.objectiveId,scope.courseId])
        if (!objective[0]) throw new Error('mission step objective must belong to the current course')
      }
      await client.query(
        `INSERT INTO learning_mission_steps(id,mission_id,type,description,success_criteria,objective_id,position)
         SELECT $1,$2,$3,$4,$5,o.id,$7 FROM (SELECT $6::text AS id) x
         LEFT JOIN learning_objectives o ON o.id=x.id AND o.course_id=$8
         WHERE NOT EXISTS(SELECT 1 FROM learning_mission_steps s WHERE s.mission_id=$2 AND lower(s.description)=lower($4))`,
        [randomUUID(), missionId, step.type, asText(step.description, 'step description'), asText(step.successCriteria, 'step successCriteria'), step.objectiveId ?? null, position++, scope.courseId],
      )
    }
    const { rows: total } = await client.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM learning_mission_steps WHERE mission_id=$1`, [missionId])
    if (!total[0]?.count) throw new Error('mission requires at least one checkable step')
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { if (ownsClient) client.release() }
  return requireLearningMission(db, scope.companyId, scope.courseId, missionId)
}

/** FrontierAgent-style finish_planning gate, projected onto a learning Mission.
 * Planning writes the task board; no execution action is permitted until the
 * board contains an observable check and a reflection close-out. */
export async function finishMissionPlanning(
  work: AgentWorkItem,
  missionId: string,
  db: Queryable = pool,
): Promise<LearningMission> {
  const scope = await roomScope(work, db)
  const { rows } = await db.query<{ total: number; checks: number; reflections: number }>(
    `SELECT COUNT(s.id)::int AS total,
            COUNT(s.id) FILTER (WHERE s.type='check')::int AS checks,
            COUNT(s.id) FILTER (WHERE s.type='reflect')::int AS reflections
       FROM learning_missions m LEFT JOIN learning_mission_steps s ON s.mission_id=m.id
      WHERE m.id=$1 AND m.course_id=$2 AND m.conversation_id=$3 AND m.status='planning'
      GROUP BY m.id`,
    [missionId, scope.courseId, work.channelId],
  )
  if (!rows[0]) throw new Error('planning Mission not found in the current learning room')
  if (rows[0].total < 1) throw new Error('planning gate blocked: add concrete Mission steps first')
  if (rows[0].checks < 1) throw new Error('planning gate blocked: add at least one check step with observable success criteria')
  if (rows[0].reflections < 1) throw new Error('planning gate blocked: add a reflect step before execution')
  await db.query(
    `UPDATE learning_missions SET status='active',updated_at=NOW()
      WHERE id=$1 AND course_id=$2 AND status='planning'`,
    [missionId, scope.courseId],
  )
  inc('learning.mission.planning_completed', { mode: 'agent' })
  return requireLearningMission(db, scope.companyId, scope.courseId, missionId)
}

export async function updateMissionStep(work: AgentWorkItem, input: {
  missionId: string; stepId: string; status: LearningStepStatus; outcome?: string; sourceReportId?:string; attemptId?:string
}, db: Queryable = pool): Promise<LearningMission> {
  const scope = await roomScope(work, db)
  if (input.status === 'completed' && !input.outcome?.trim()) throw new Error('completed mission steps require an outcome')
  if (input.status==='completed'&&!input.sourceReportId&&!input.attemptId) throw new Error('completed mission steps require a persisted report or learner attempt')
  const { rowCount } = await db.query(
    `UPDATE learning_mission_steps s SET status=$4,outcome=$5,completion_report_id=report.id,completion_attempt_id=attempt.id,updated_at=NOW()
      FROM learning_missions m
      LEFT JOIN canvas_assignment_reports report ON report.id=$6 AND report.company_id=$8
      LEFT JOIN learning_attempts attempt ON attempt.id=$7 AND attempt.course_id=$3
      WHERE s.id=$1 AND s.mission_id=$2 AND m.id=s.mission_id AND m.course_id=$3
        AND ($4<>'completed' OR report.id IS NOT NULL OR attempt.id IS NOT NULL)`,
    [input.stepId,input.missionId,scope.courseId,input.status,input.outcome?.trim()??null,input.sourceReportId??null,input.attemptId??null,work.companyId],
  )
  if (!rowCount) throw new Error('mission step not found')
  return requireLearningMission(db, scope.companyId, scope.courseId, input.missionId)
}

export async function completeMission(work: AgentWorkItem, missionId: string, db: Queryable = pool): Promise<LearningMission> {
  const scope = await roomScope(work, db)
  const { rows } = await db.query<{ unresolved: number; reflections: number }>(
    `SELECT COUNT(*) FILTER (WHERE s.status IN ('open','in_progress'))::int AS unresolved,
            COUNT(*) FILTER (WHERE s.type='reflect' AND s.status='completed')::int AS reflections
       FROM learning_missions m LEFT JOIN learning_mission_steps s ON s.mission_id=m.id
      WHERE m.id=$1 AND m.course_id=$2 GROUP BY m.id`, [missionId, scope.courseId],
  )
  if (!rows[0]) throw new Error('mission not found')
  if (rows[0].unresolved > 0) throw new Error('mission has unresolved steps')
  if (rows[0].reflections < 1) throw new Error('mission requires a completed reflection step')
  await db.query(`UPDATE learning_missions SET status='completed',completed_at=NOW(),updated_at=NOW() WHERE id=$1`, [missionId])
  return requireLearningMission(db, scope.companyId, scope.courseId, missionId)
}

async function validateLearnerMessage(work: AgentWorkItem, courseId: string, clientMsgNo: string, db: Queryable = pool): Promise<string> {
  const { rows: binding } = await db.query<{ channel_type: number }>(
    `SELECT COALESCE((profile->>'channelType')::int,2) AS channel_type FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
    [work.channelId, work.companyId],
  )
  const messages = await wukongClient().syncMessages(work.channelId, Number(binding[0]?.channel_type ?? 2), 100, work.agentId)
  const message = messages.find((item) => item.clientMsgNo === clientMsgNo)
  if (!message || message.payload.refs?.agentId) throw new Error('evidence must reference an existing human message in the current room')
  await requireCourseRole(courseId, message.fromUid, 'learner', db)
  return message.fromUid
}

export async function recordAttempt(work: AgentWorkItem, input: {
  activityId?: string; missionStepId?: string; evidenceClientMsgNos?: string[]; documentIds?: string[]; canvasFrameIds?: string[]; assistance?: LearningAssistance
}, db: Queryable = pool): Promise<{ id: string; learnerId: string }> {
  const scope = await roomScope(work, db)
  if (Boolean(input.activityId) === Boolean(input.missionStepId)) throw new Error('exactly one activityId or missionStepId is required')
  const refs = [...new Set((input.evidenceClientMsgNos ?? []).map(String).filter(Boolean))]
  const documentIds = [...new Set((input.documentIds ?? []).map(String).filter(Boolean))]
  const canvasFrameIds = [...new Set((input.canvasFrameIds ?? []).map(String).filter(Boolean))]
  if (!refs.length && !documentIds.length && !canvasFrameIds.length) throw new Error('at least one Host-verifiable learner evidence source is required')
  if (refs.length > 20) throw new Error('one attempt may reference at most 20 evidence messages')
  if (documentIds.length > 20 || canvasFrameIds.length > 20) throw new Error('one attempt may reference at most 20 documents and 20 Canvas Frames')
  const learnerIds = new Set<string>()
  for (const ref of refs) learnerIds.add(await validateLearnerMessage(work, scope.courseId, ref, db))
  const documentEvidence: Array<{ id:string;revision:number;authorId:string }> = []
  for (const documentId of documentIds) {
    const { rows } = await db.query<{ id:string;revision:number;author_id:string }>(
      `SELECT d.id,COALESCE(MAX(du.id),0)::int AS revision,COALESCE((array_agg(du.author_id ORDER BY du.id DESC) FILTER(WHERE du.author_id IS NOT NULL))[1],d.created_by) AS author_id
         FROM documents d LEFT JOIN document_updates du ON du.document_id=d.id
        WHERE d.id=$1 AND d.company_id=$2 AND d.project_id=$3 GROUP BY d.id`, [documentId,work.companyId,scope.projectId],
    )
    if (!rows[0]) throw new Error('document evidence is outside the current course project')
    await requireCourseRole(scope.courseId,rows[0].author_id,'learner',db)
    learnerIds.add(rows[0].author_id); documentEvidence.push({ id:rows[0].id,revision:Number(rows[0].revision),authorId:rows[0].author_id })
  }
  const canvasEvidence: Array<{ id:string;revision:number;authorId:string }> = []
  for (const frameId of canvasFrameIds) {
    const { rows } = await db.query<{ id:string;revision:number;updated_by:string }>(
      `SELECT f.id,f.revision,f.updated_by FROM canvas_frames f JOIN canvases c ON c.id=f.canvas_id
        WHERE f.id=$1 AND c.company_id=$2 AND c.project_id=$3`, [frameId,work.companyId,scope.projectId],
    )
    if (!rows[0]) throw new Error('Canvas Frame evidence is outside the current course project')
    await requireCourseRole(scope.courseId,rows[0].updated_by,'learner',db)
    learnerIds.add(rows[0].updated_by); canvasEvidence.push({ id:rows[0].id,revision:Number(rows[0].revision),authorId:rows[0].updated_by })
  }
  if (learnerIds.size !== 1) throw new Error('one attempt cannot combine evidence from multiple learners')
  const learnerId = [...learnerIds][0]
  const id = randomUUID()
  await db.query(
    `INSERT INTO learning_attempts(id,course_id,company_id,learner_id,activity_id,mission_step_id,assistance,evidence)
     SELECT $1,$2,course.company_id,$3,a.id,s.id,$6,$7::jsonb
       FROM courses course,
            (SELECT $4::text AS id) ai LEFT JOIN learning_activities a ON a.id=ai.id AND a.course_id=$2 AND a.status='published',
            (SELECT $5::text AS id) si LEFT JOIN learning_mission_steps s ON s.id=si.id
            LEFT JOIN learning_missions m ON m.id=s.mission_id AND m.course_id=$2 AND m.learner_id=$3
      WHERE course.id=$2 AND (a.id IS NOT NULL OR m.id IS NOT NULL)`,
    [id, scope.courseId, learnerId, input.activityId ?? null, input.missionStepId ?? null,
      input.assistance ?? 'none', JSON.stringify({ kind: 'host_references', conversationId: work.channelId, clientMsgNos: refs, documents: documentEvidence, canvasFrames: canvasEvidence })],
  )
  const { rows } = await db.query<{ id: string }>(`SELECT id FROM learning_attempts WHERE id=$1`, [id])
  if (!rows[0]) throw new Error('published activity or mission step is outside the current course')
  inc('learning.attempt.accepted', { source: 'message' })
  return { id, learnerId }
}

export async function proposeEvaluation(work: AgentWorkItem, input: {
  attemptId: string; demonstratedLevel: number; confidence: number; rubricResults?: unknown[]; feedback?: string
  sourceReportId?:string;verifierReportId?:string
}, db: Queryable = pool): Promise<{ evaluationId: string; status: 'accepted'|'pending'; decisions: MasteryProjectionDecision[] }> {
  const scope = await roomScope(work, db)
  const { rows } = await db.query<{
    learner_id:string;assistance:LearningAssistance;activity_id:string|null;activity_type:LearningActivityType|null;
    evaluation_mode:LearningEvaluationMode|null;target_level:number;objective_ids:string[]
  }>(
    `SELECT a.learner_id,a.assistance,a.activity_id,act.type AS activity_type,
            act.evaluation_mode,
            COALESCE(act.target_level,o.target_level,2) AS target_level,
            COALESCE(act.objective_ids,CASE WHEN s.objective_id IS NOT NULL THEN jsonb_build_array(s.objective_id) ELSE '[]'::jsonb END) AS objective_ids
       FROM learning_attempts a LEFT JOIN learning_activities act ON act.id=a.activity_id
       LEFT JOIN learning_mission_steps s ON s.id=a.mission_step_id
       LEFT JOIN learning_objectives o ON o.id=s.objective_id
      WHERE a.id=$1 AND a.course_id=$2 AND (a.activity_id IS NULL OR act.status='published')`, [input.attemptId, scope.courseId],
  )
  const attempt = rows[0]
  if (!attempt) throw new Error('attempt not found')
  const evaluationId = randomUUID()
  const confidence = Number(input.confidence)
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('confidence must be between 0 and 1')
  const demonstratedLevel = Number(input.demonstratedLevel)
  if (!Number.isInteger(demonstratedLevel) || demonstratedLevel < 0 || demonstratedLevel > 4) throw new Error('demonstratedLevel must be an integer between 0 and 4')
  const {rows:masteryRows}=await db.query<{level:number}>(
    `SELECT m.level FROM learning_mastery m WHERE m.course_id=$1 AND m.learner_id=$2 AND m.objective_id=ANY($3::text[])`,
    [scope.courseId,attempt.learner_id,(attempt.objective_ids??[]).map(String)],
  )
  const suggestedDowngrade=masteryRows.some(row=>Number(row.level)>demonstratedLevel)
  let verified=false
  if (demonstratedLevel>=3||suggestedDowngrade) {
    if (!input.sourceReportId) throw new Error('L3+, transfer, and downgrade evaluations require a persisted source report')
    if (input.verifierReportId) {
      const {rows:verification}=await db.query<{source_author:string;verifier_author:string;verifies_report_id:string|null;verdict:string|null}>(
        `SELECT source.author_agent_id AS source_author,verifier.author_agent_id AS verifier_author,
                verifier.verifies_report_id,verifier.verdict
           FROM canvas_assignment_reports source JOIN canvases c ON c.id=source.canvas_id
           JOIN courses lc ON lc.project_id=c.project_id AND lc.company_id=c.company_id
           JOIN canvas_assignment_reports verifier ON verifier.id=$2 AND verifier.canvas_id=source.canvas_id
          WHERE source.id=$1 AND source.company_id=$3 AND lc.id=$4`,
        [input.sourceReportId,input.verifierReportId,work.companyId,scope.courseId],
      )
      const check=verification[0]
      if (!check||check.verifies_report_id!==input.sourceReportId||check.source_author===check.verifier_author) throw new Error('verifier report is not an independent verification of the source report')
      verified=check.verdict==='supported'
    }
  }
  const teacherRequired = attempt.evaluation_mode !== 'agent_formative' || demonstratedLevel >= 4 || confidence < 0.7 || suggestedDowngrade || (demonstratedLevel>=3&&!verified)
  const status: 'accepted'|'pending' = teacherRequired ? 'pending' : 'accepted'
  inc('learning.evaluation.proposed', { status })
  const ownsClient = db === pool
  const client = ownsClient ? await pool.connect() : db as unknown as PoolClient
  const decisions: MasteryProjectionDecision[] = []
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO learning_evaluations(id,attempt_id,demonstrated_level,confidence,rubric_results,feedback,evaluator_id,evaluator_kind,status,source_report_id,verifier_report_id)
       VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,'agent',$8,$9,$10)`,
      [evaluationId, input.attemptId, demonstratedLevel, confidence,
        JSON.stringify(input.rubricResults ?? []), input.feedback?.trim() ?? '', work.agentId, status,input.sourceReportId??null,input.verifierReportId??null],
    )
    if (status === 'accepted') {
      for (const objectiveId of (attempt.objective_ids ?? []).map(String)) {
        decisions.push(await applyEvaluationToMastery(client, {
          courseId: scope.courseId, learnerId: attempt.learner_id, objectiveId, evaluationId,
          demonstratedLevel, confidence, assistance: attempt.assistance,
          activityType: attempt.activity_type ?? 'practice', activityTargetLevel: Number(attempt.target_level),
          evaluatorKind: 'agent', teacherConfirmed: false, actorId: work.agentId,
        }))
      }
      await client.query(`UPDATE learning_attempts SET status='evaluated' WHERE id=$1`, [input.attemptId])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { if (ownsClient) client.release() }
  return { evaluationId, status, decisions }
}

async function applyEvaluationToMastery(client: PoolClient, input: {
  courseId:string;learnerId:string;objectiveId:string;evaluationId:string;demonstratedLevel:number;confidence:number;
  assistance:LearningAssistance;activityType:LearningActivityType;activityTargetLevel:number;evaluatorKind:'agent'|'teacher';
  teacherConfirmed:boolean;actorId:string
}): Promise<MasteryProjectionDecision> {
  const { rows: evidenceRows } = await client.query<{ evidence_key: string | null }>(
    `SELECT DISTINCT COALESCE(a.activity_id,a.mission_step_id) AS evidence_key
       FROM learning_mastery_events me JOIN learning_evaluations e ON e.id=me.evaluation_id
       JOIN learning_attempts a ON a.id=e.attempt_id
      WHERE me.course_id=$1 AND me.learner_id=$2 AND me.objective_id=$3 AND e.status='accepted'
        AND a.assistance='none' AND e.demonstrated_level>=3`,
    [input.courseId,input.learnerId,input.objectiveId],
  )
  const priorKeys = new Set(evidenceRows.map((row) => row.evidence_key).filter((value): value is string => Boolean(value)))
  const { rows: currentEvidence } = await client.query<{ evidence_key: string | null }>(
    `SELECT COALESCE(a.activity_id,a.mission_step_id) AS evidence_key FROM learning_evaluations e
      JOIN learning_attempts a ON a.id=e.attempt_id WHERE e.id=$1`, [input.evaluationId],
  )
  const currentKey = currentEvidence[0]?.evidence_key ?? null
  const { rows } = await client.query<{ level:number;independent_evidence_count:number;review_interval_days:number }>(
    `SELECT level,independent_evidence_count,review_interval_days FROM learning_mastery
     WHERE course_id=$1 AND learner_id=$2 AND objective_id=$3 FOR UPDATE`,
    [input.courseId, input.learnerId, input.objectiveId],
  )
  const previous = rows[0] ?? { level: 0, independent_evidence_count: 0, review_interval_days: 1 }
  const decision = projectMastery({
    previousLevel: Number(previous.level), previousIndependentEvidenceCount: priorKeys.size,
    demonstratedLevel: input.demonstratedLevel, assistance: input.assistance, confidence: input.confidence,
    activityType: input.activityType, activityTargetLevel: input.activityTargetLevel,
    evaluatorKind: input.evaluatorKind, teacherConfirmed: input.teacherConfirmed,
    evidenceDistinct: currentKey ? !priorKeys.has(currentKey) : false,
  })
  if (!decision.accepted) return decision
  const baseInterval = REVIEW_INTERVAL_BY_LEVEL[decision.nextLevel] ?? 1
  const interval = decision.needsReview || decision.candidateLevel === 0 ? 1 : Math.min(90, Math.max(baseInterval, Number(previous.review_interval_days) * (decision.nextLevel > Number(previous.level) ? 1 : 2)))
  const masteryStatus = decision.needsReview ? 'needs_review' : decision.nextLevel >= 3 ? 'verified' : 'learning'
  await client.query(
    `INSERT INTO learning_mastery(course_id,company_id,learner_id,objective_id,level,status,independent_evidence_count,review_interval_days,next_review_at)
     SELECT $1,course.company_id,$2,$3,$4,$5,$6,$7,NOW()+($7::int * INTERVAL '1 day')
       FROM courses course WHERE course.id=$1
     ON CONFLICT(course_id,learner_id,objective_id) DO UPDATE SET
       level=EXCLUDED.level,status=EXCLUDED.status,independent_evidence_count=EXCLUDED.independent_evidence_count,
       review_interval_days=EXCLUDED.review_interval_days,next_review_at=EXCLUDED.next_review_at,
       version=learning_mastery.version+1,updated_at=NOW()`,
    [input.courseId,input.learnerId,input.objectiveId,decision.nextLevel,masteryStatus,decision.nextIndependentEvidenceCount,interval],
  )
  await client.query(
    `INSERT INTO learning_mastery_events(id,course_id,company_id,learner_id,objective_id,evaluation_id,previous_level,next_level,kind,reason,actor_id)
     SELECT $1,$2,course.company_id,$3,$4,$5,$6,$7,$8,$9,$10
       FROM courses course WHERE course.id=$2`,
    [randomUUID(),input.courseId,input.learnerId,input.objectiveId,input.evaluationId,Number(previous.level),decision.nextLevel,
      decision.needsReview ? 'review_flag' : 'evidence',decision.reason,input.actorId],
  )
  if (decision.nextLevel !== Number(previous.level) || decision.needsReview) inc('learning.mastery.changed', { status: masteryStatus })
  return decision
}

async function applyTeacherOverride(client: PoolClient, input: {
  courseId:string;learnerId:string;objectiveId:string;evaluationId:string;nextLevel:number;reason:string;teacherId:string;activityType:LearningActivityType
}): Promise<void> {
  const level = Math.trunc(input.nextLevel)
  if (level < 0 || level > 4) throw new Error('overrideLevel must be between 0 and 4')
  if (level === 4 && !['project','assessment'].includes(input.activityType)) throw new Error('level 4 override requires project or assessment evidence')
  const { rows } = await client.query<{ level:number;independent_evidence_count:number }>(
    `SELECT level,independent_evidence_count FROM learning_mastery WHERE course_id=$1 AND learner_id=$2 AND objective_id=$3 FOR UPDATE`,
    [input.courseId,input.learnerId,input.objectiveId],
  )
  const previous = Number(rows[0]?.level ?? 0)
  const interval = level < previous ? 1 : REVIEW_INTERVAL_BY_LEVEL[level] ?? 1
  const status = level >= 3 ? 'verified' : 'learning'
  await client.query(
    `INSERT INTO learning_mastery(course_id,company_id,learner_id,objective_id,level,status,independent_evidence_count,review_interval_days,next_review_at)
     SELECT $1,course.company_id,$2,$3,$4,$5,$6,$7,NOW()+($7::int*INTERVAL '1 day')
       FROM courses course WHERE course.id=$1
     ON CONFLICT(course_id,learner_id,objective_id) DO UPDATE SET level=EXCLUDED.level,status=EXCLUDED.status,
       review_interval_days=EXCLUDED.review_interval_days,next_review_at=EXCLUDED.next_review_at,version=learning_mastery.version+1,updated_at=NOW()`,
    [input.courseId,input.learnerId,input.objectiveId,level,status,Number(rows[0]?.independent_evidence_count ?? 0),interval],
  )
  await client.query(
    `INSERT INTO learning_mastery_events(id,course_id,company_id,learner_id,objective_id,evaluation_id,previous_level,next_level,kind,reason,actor_id)
     SELECT $1,$2,course.company_id,$3,$4,$5,$6,$7,'teacher_override',$8,$9
       FROM courses course WHERE course.id=$2`,
    [randomUUID(),input.courseId,input.learnerId,input.objectiveId,input.evaluationId,previous,level,input.reason,input.teacherId],
  )
  inc('learning.mastery.changed', { status })
}

export async function reviewEvaluation(input: {
  courseId:string;evaluationId:string;teacherId:string;decision:'accept'|'reject';overrideLevel?:number;reason:string
}, db: Queryable = pool): Promise<void> {
  await requireCourseRole(input.courseId,input.teacherId,'teacher',db)
  if (!input.reason.trim()) throw new Error('review reason is required')
  const ownsClient = db === pool
  const client = ownsClient ? await pool.connect() : db as unknown as PoolClient
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      attempt_id:string;demonstrated_level:number;confidence:number;learner_id:string;assistance:LearningAssistance;
      type:LearningActivityType|null;target_level:number;objective_ids:string[]
    }>(
      `SELECT e.attempt_id,e.demonstrated_level,e.confidence,a.learner_id,a.assistance,act.type,COALESCE(act.target_level,2) AS target_level,
              COALESCE(act.objective_ids,'[]'::jsonb) AS objective_ids
         FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id
         LEFT JOIN learning_activities act ON act.id=a.activity_id
        WHERE e.id=$1 AND a.course_id=$2 AND e.status='pending' FOR UPDATE`, [input.evaluationId,input.courseId],
    )
    const row = rows[0]
    if (!row) throw new Error('pending evaluation not found')
    const accepted = input.decision === 'accept'
    await client.query(
      `UPDATE learning_evaluations SET status=$2,review_reason=$3,reviewed_by=$4,reviewed_at=NOW() WHERE id=$1`,
      [input.evaluationId,accepted?'accepted':'rejected',input.reason.trim(),input.teacherId],
    )
    if (accepted) {
      const level = input.overrideLevel === undefined ? Number(row.demonstrated_level) : Math.trunc(Number(input.overrideLevel))
      for (const objectiveId of (row.objective_ids ?? []).map(String)) {
        if (input.overrideLevel !== undefined) await applyTeacherOverride(client, {
          courseId:input.courseId,learnerId:row.learner_id,objectiveId,evaluationId:input.evaluationId,nextLevel:level,
          reason:input.reason.trim(),teacherId:input.teacherId,activityType:row.type ?? 'practice',
        })
        else await applyEvaluationToMastery(client, {
            courseId:input.courseId,learnerId:row.learner_id,objectiveId,evaluationId:input.evaluationId,
            demonstratedLevel:level,confidence:Math.max(0.7,Number(row.confidence)),assistance:row.assistance,
            activityType:row.type ?? 'practice',activityTargetLevel:Math.max(level,Number(row.target_level)),
            evaluatorKind:'teacher',teacherConfirmed:true,actorId:input.teacherId,
          })
      }
      await client.query(`UPDATE learning_attempts SET status='evaluated' WHERE id=$1`, [row.attempt_id])
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { if (ownsClient) client.release() }
}

export async function loadLearningTurnContext(work: AgentWorkItem, actorId?: string, db: Queryable = pool): Promise<LearningTurnContext | undefined> {
  let scope: Awaited<ReturnType<typeof roomScope>>
  try { scope = await roomScope(work, db) } catch { return undefined }
  let resolvedActorId = actorId
  if (!resolvedActorId) {
    const { rows: binding } = await db.query<{ channel_type: number }>(
      `SELECT COALESCE((profile->>'channelType')::int,2) AS channel_type FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`,
      [work.channelId, work.companyId],
    )
    const messages = await wukongClient().syncMessages(work.channelId, Number(binding[0]?.channel_type ?? 2), 100, work.agentId)
    const trigger = messages.find((item) => item.clientMsgNo === work.triggerClientMsgNo && !item.payload.refs?.agentId)
    resolvedActorId = trigger?.fromUid ?? [...messages].reverse().find((item) => !item.payload.refs?.agentId)?.fromUid
  }
  const role = resolvedActorId ? await courseRole(db, scope.courseId, resolvedActorId) : undefined
  const learnerId = role === 'learner' ? resolvedActorId : undefined
  const objectives = await listLearningObjectives(db, scope.companyId, scope.courseId)
  const { rows: mastery } = learnerId ? await db.query<{ objective_id:string;level:number;status:string;next_review_at:string|null }>(
    `SELECT objective_id,level,status,next_review_at FROM learning_mastery WHERE course_id=$1 AND learner_id=$2`, [scope.courseId,learnerId],
  ) : { rows: [] }
  const byObjective = new Map(mastery.map((item) => [item.objective_id,item]))
  const { rows: missionRows } = learnerId ? await db.query<{ id:string }>(
    `SELECT id FROM learning_missions WHERE course_id=$1 AND learner_id=$2 AND conversation_id=$3
     AND status IN ('planning','active','paused') ORDER BY updated_at DESC LIMIT 1`, [scope.courseId,learnerId,work.channelId],
  ) : { rows: [] }
  const { rows: pendingRows } = role === 'teacher' ? await db.query<{ count:number }>(
    `SELECT COUNT(*)::int AS count FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id
     WHERE a.course_id=$1 AND e.status='pending'`, [scope.courseId],
  ) : { rows: [] }
  const mapped = objectives.slice(0, 40).map((objective) => {
    const state = byObjective.get(objective.id)
    return { ...objective, masteryLevel:Number(state?.level ?? 0), masteryStatus:state?.status ?? 'learning',
      ...(state?.next_review_at ? { nextReviewAt:String(state.next_review_at) } : {}) }
  })
  return {
    course:{ id:scope.courseId,projectId:scope.projectId,title:scope.courseTitle,status:scope.courseStatus },
    roomPurpose:scope.purpose,...(role?{actorRole:role}:{}),...(learnerId?{learnerId}:{}),
    ...(missionRows[0]?{activeMission:await requireLearningMission(db,scope.companyId,scope.courseId,missionRows[0].id)}:{}),
    objectives:mapped,
    due:mapped.filter((item)=>item.nextReviewAt && new Date(item.nextReviewAt)<=new Date()).slice(0,12).map((item)=>({
      objectiveId:item.id,title:item.title,level:item.masteryLevel,nextReviewAt:item.nextReviewAt!,
    })),
    pendingTeacherReviews:Number(pendingRows[0]?.count ?? 0),
  }
}

export async function learningDashboard(companyId:string,userId:string,db:Queryable=pool):Promise<{
  courses:LearningCourseSummary[];due:unknown[];mastery:unknown[];pendingReviews:number
}> {
  const courses=await listCourseSummaries(companyId,userId,db)
  const {rows:due}=await db.query(
    `SELECT m.course_id,m.objective_id,o.title,m.level,m.status,m.next_review_at
       FROM learning_mastery m JOIN learning_objectives o ON o.id=m.objective_id
       JOIN course_members cm ON cm.course_id=m.course_id AND cm.user_id=m.learner_id AND cm.role='learner'
       JOIN courses course ON course.id=m.course_id AND course.company_id=cm.company_id
      WHERE m.learner_id=$1 AND course.company_id=$2 AND m.next_review_at<=NOW()
      ORDER BY m.next_review_at LIMIT 50`,[userId,companyId],
  )
  const {rows:pending}=await db.query<{count:number}>(
    `SELECT COUNT(*)::int AS count FROM learning_evaluations e JOIN learning_attempts a ON a.id=e.attempt_id
      JOIN course_members cm ON cm.course_id=a.course_id AND cm.user_id=$1 AND cm.role='teacher'
     WHERE cm.company_id=$2 AND e.status='pending'`,[userId,companyId],
  )
  const {rows:mastery}=await db.query(
    `SELECT m.course_id,m.objective_id,o.title,m.level,m.status,m.next_review_at,m.review_interval_days
       FROM learning_mastery m JOIN learning_objectives o ON o.id=m.objective_id
       JOIN course_members cm ON cm.course_id=m.course_id AND cm.user_id=m.learner_id AND cm.role='learner'
      WHERE m.learner_id=$1 AND cm.company_id=$2 ORDER BY o.position`,[userId,companyId],
  )
  return {courses,due,mastery,pendingReviews:Number(pending[0]?.count??0)}
}

export async function courseProgress(courseId:string,teacherId:string,db:Queryable=pool):Promise<unknown[]> {
  await requireCourseRole(courseId,teacherId,'teacher',db)
  const {rows}=await db.query(
    `SELECT cm.user_id,u.display_name,u.email,COALESCE(ms.average_level,0)::float AS average_level,
            COALESCE(ms.verified_objectives,0)::int AS verified_objectives,
            COALESCE(ms.due_objectives,0)::int AS due_objectives,COALESCE(at.attempts,0)::int AS attempts
       FROM course_members cm JOIN users u ON u.id=cm.user_id
       LEFT JOIN LATERAL (SELECT AVG(m.level) AS average_level,COUNT(*) FILTER(WHERE m.level>=3) AS verified_objectives,
         COUNT(*) FILTER(WHERE m.next_review_at<=NOW()) AS due_objectives FROM learning_mastery m
         WHERE m.course_id=cm.course_id AND m.learner_id=cm.user_id) ms ON TRUE
       LEFT JOIN LATERAL (SELECT COUNT(*) AS attempts FROM learning_attempts a
         WHERE a.course_id=cm.course_id AND a.learner_id=cm.user_id) at ON TRUE
      WHERE cm.course_id=$1 AND cm.role='learner' ORDER BY u.display_name`,[courseId],
  )
  return rows
}
