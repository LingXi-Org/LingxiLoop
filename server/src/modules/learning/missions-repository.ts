import type { Queryable } from '../../db/queryable.js'
import type { LearningMission, LearningMissionStep } from './types.js'
import type { LearningAgentRoomScope } from './contracts.js'

interface LearningMissionRow {
  id: string; course_id: string; learner_id: string; conversation_id: string; trigger_client_msg_no: string
  goal: string; success_criteria: string; status: LearningMission['status']; mission_kind: LearningMission['missionKind']
  coordinator_agent_id: string; created_at: string; updated_at: string
}

interface LearningMissionStepRow {
  id: string; mission_id: string; type: LearningMissionStep['type']; description: string; success_criteria: string
  objective_id: string | null; status: LearningMissionStep['status']; position: number; outcome: string | null
  completion_report_id: string | null; completion_attempt_id: string | null
}

function mapLearningMissionStep(step: LearningMissionStepRow): LearningMissionStep {
  return {
    id: step.id,
    type: step.type,
    description: step.description,
    successCriteria: step.success_criteria,
    ...(step.objective_id ? { objectiveId: step.objective_id } : {}),
    status: step.status,
    position: Number(step.position),
    ...(step.outcome ? { outcome: step.outcome } : {}),
    ...(step.completion_report_id ? { completionReportId: step.completion_report_id } : {}),
    ...(step.completion_attempt_id ? { completionAttemptId: step.completion_attempt_id } : {}),
  }
}

function mapLearningMission(row: LearningMissionRow, steps: LearningMissionStepRow[]): LearningMission {
  return {
    id: row.id,
    courseId: row.course_id,
    learnerId: row.learner_id,
    conversationId: row.conversation_id,
    triggerClientMsgNo: row.trigger_client_msg_no,
    goal: row.goal,
    successCriteria: row.success_criteria,
    missionKind: row.mission_kind,
    coordinatorAgentId: row.coordinator_agent_id,
    status: row.status,
    steps: steps.map(mapLearningMissionStep),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

const learningMissionColumns = `mission.id,mission.course_id,mission.learner_id,mission.conversation_id,
  mission.trigger_client_msg_no,mission.goal,mission.success_criteria,mission.status,mission.mission_kind,
  mission.coordinator_agent_id,mission.created_at,mission.updated_at`

async function learningMissionSteps(
  db: Queryable,
  companyId: string,
  courseId: string,
  missionIds: string[],
): Promise<LearningMissionStepRow[]> {
  if (!missionIds.length) return []
  const { rows } = await db.query<LearningMissionStepRow>(
    `SELECT step.id,step.mission_id,step.type,step.description,step.success_criteria,step.objective_id,
            step.status,step.position,step.outcome,step.completion_report_id,step.completion_attempt_id
       FROM learning_mission_steps step
       JOIN learning_missions mission ON mission.id=step.mission_id
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.id=ANY($3::text[])
      ORDER BY step.mission_id,step.position,step.created_at`,
    [companyId,courseId,missionIds],
  )
  return rows
}

export async function findLearningMission(
  db: Queryable,
  companyId: string,
  courseId: string,
  missionId: string,
): Promise<LearningMission | null> {
  const { rows } = await db.query<LearningMissionRow>(
    `SELECT ${learningMissionColumns} FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.id=$3`,
    [companyId,courseId,missionId],
  )
  if (!rows[0]) return null
  return mapLearningMission(rows[0], await learningMissionSteps(db, companyId, courseId, [missionId]))
}

export async function listLearningMissions(
  db: Queryable,
  args: { companyId: string; courseId: string; userId: string; includeAllLearners: boolean },
): Promise<LearningMission[]> {
  const { rows } = await db.query<LearningMissionRow>(
    `SELECT ${learningMissionColumns} FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND ($3::boolean OR mission.learner_id=$4)
      ORDER BY mission.updated_at DESC LIMIT 100`,
    [args.companyId,args.courseId,args.includeAllLearners,args.userId],
  )
  const steps = await learningMissionSteps(db, args.companyId, args.courseId, rows.map((row) => row.id))
  const byMission = new Map<string, LearningMissionStepRow[]>()
  for (const step of steps) {
    const bucket = byMission.get(step.mission_id)
    if (bucket) bucket.push(step)
    else byMission.set(step.mission_id, [step])
  }
  return rows.map((row) => mapLearningMission(row, byMission.get(row.id) ?? []))
}

export async function updateLearningMissionCoordinator(
  db: Queryable,
  args: { companyId: string; courseId: string; missionId: string; teacherId: string; agentId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions mission SET coordinator_agent_id=agent.id,updated_at=NOW()
       FROM participants agent,conversations conversation
      WHERE mission.company_id=$1 AND mission.course_id=$2 AND mission.id=$3
        AND conversation.id=mission.conversation_id AND conversation.company_id=mission.company_id
        AND agent.id=$5 AND agent.company_id=mission.company_id AND agent.kind='agent' AND agent.departed_at IS NULL
        AND agent.capabilities @> '["canvas","learning"]'::jsonb AND conversation.members ? agent.id
        AND EXISTS(SELECT 1 FROM course_members teacher
          WHERE teacher.company_id=mission.company_id AND teacher.course_id=mission.course_id
            AND teacher.user_id=$4 AND teacher.role='teacher')`,
    [args.companyId,args.courseId,args.missionId,args.teacherId,args.agentId],
  )
  return Boolean(result.rowCount)
}

export interface LearningRoomState {
  companyId: string
  courseId: string
  projectId: string
  courseTitle: string
  courseStatus: 'active' | 'archived'
  purpose: 'study' | 'lab' | 'discussion'
}

export async function findLearningRoomState(
  db: Queryable,
  scope: LearningAgentRoomScope,
): Promise<LearningRoomState | null> {
  const { rows } = await db.query<{
    company_id: string; course_id: string; project_id: string; title: string
    status: LearningRoomState['courseStatus']; purpose: LearningRoomState['purpose']
  }>(
    `SELECT course.company_id,course.id AS course_id,course.project_id,project.name AS title,project.status,
            CASE WHEN course.study_room_conversation_id=$1 THEN 'study'::text ELSE room.purpose END AS purpose
       FROM courses course
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       LEFT JOIN learning_course_rooms room
         ON room.course_id=course.id AND room.company_id=course.company_id AND room.conversation_id=$1
      WHERE course.company_id=$2 AND project.status='active'
        AND (course.study_room_conversation_id=$1 OR room.conversation_id=$1)
      LIMIT 1`,
    [scope.channelId,scope.companyId],
  )
  const row = rows[0]
  return row ? {
    companyId: row.company_id,
    courseId: row.course_id,
    projectId: row.project_id,
    courseTitle: row.title,
    courseStatus: row.status,
    purpose: row.purpose,
  } : null
}

export async function lockLearningMission(
  db: Queryable,
  args: LearningAgentRoomScope & { courseId: string; missionId: string; statuses: LearningMission['status'][] },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_missions
      WHERE company_id=$1 AND course_id=$2 AND conversation_id=$3 AND id=$4 AND status=ANY($5::text[])
      FOR UPDATE`,
    [args.companyId,args.courseId,args.channelId,args.missionId,args.statuses],
  )
  return Boolean(rows[0])
}

export async function countLearningMissionSteps(db: Queryable, missionId: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM learning_mission_steps WHERE mission_id=$1`,
    [missionId],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function insertLearningMissionStep(
  db: Queryable,
  args: {
    id: string; missionId: string; type: LearningMissionStep['type']; description: string
    successCriteria: string; objectiveId?: string; position: number
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_mission_steps(id,mission_id,type,description,success_criteria,objective_id,position)
     SELECT $1,$2,$3,$4,$5,$6,$7
      WHERE NOT EXISTS(SELECT 1 FROM learning_mission_steps step
        WHERE step.mission_id=$2 AND lower(step.description)=lower($4))`,
    [args.id,args.missionId,args.type,args.description,args.successCriteria,args.objectiveId ?? null,args.position],
  )
  return Boolean(result.rowCount)
}

export async function learningMissionPlanningSummary(
  db: Queryable,
  missionId: string,
): Promise<{ total: number; checks: number; reflections: number }> {
  const { rows } = await db.query<{ total: number; checks: number; reflections: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE type='check')::int AS checks,
            COUNT(*) FILTER (WHERE type='reflect')::int AS reflections
       FROM learning_mission_steps WHERE mission_id=$1`,
    [missionId],
  )
  return {
    total: Number(rows[0]?.total ?? 0),
    checks: Number(rows[0]?.checks ?? 0),
    reflections: Number(rows[0]?.reflections ?? 0),
  }
}

export async function activateLearningMission(db: Queryable, missionId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions SET status='active',updated_at=NOW() WHERE id=$1 AND status='planning'`,
    [missionId],
  )
  return Boolean(result.rowCount)
}

export async function updateLearningMissionStepRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; channelId: string; missionId: string; stepId: string
    status: LearningMissionStep['status']; outcome?: string; sourceReportId?: string; attemptId?: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_mission_steps step
        SET status=$6,outcome=$7,
            completion_report_id=(SELECT report.id FROM canvas_assignment_reports report
              WHERE report.id=$8 AND report.company_id=$1),
            completion_attempt_id=(SELECT attempt.id FROM learning_attempts attempt
              JOIN learning_missions owning_mission ON owning_mission.id=$4
              WHERE attempt.id=$9 AND attempt.company_id=$1 AND attempt.course_id=$2
                AND attempt.learner_id=owning_mission.learner_id),
            updated_at=NOW()
       FROM learning_missions mission
      WHERE step.id=$5 AND step.mission_id=$4 AND mission.id=step.mission_id
        AND mission.company_id=$1 AND mission.course_id=$2 AND mission.conversation_id=$3
        AND ($6<>'completed'
          OR ($8 IS NOT NULL AND EXISTS(SELECT 1 FROM canvas_assignment_reports report
            WHERE report.id=$8 AND report.company_id=$1))
          OR ($9 IS NOT NULL AND EXISTS(SELECT 1 FROM learning_attempts attempt
            WHERE attempt.id=$9 AND attempt.company_id=$1 AND attempt.course_id=$2
              AND attempt.learner_id=mission.learner_id)))`,
    [args.companyId,args.courseId,args.channelId,args.missionId,args.stepId,args.status,
      args.outcome?.trim() ?? null,args.sourceReportId ?? null,args.attemptId ?? null],
  )
  return Boolean(result.rowCount)
}

export async function learningMissionCompletionSummary(
  db: Queryable,
  missionId: string,
): Promise<{ unresolved: number; reflections: number }> {
  const { rows } = await db.query<{ unresolved: number; reflections: number }>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS unresolved,
            COUNT(*) FILTER (WHERE type='reflect' AND status='completed')::int AS reflections
       FROM learning_mission_steps WHERE mission_id=$1`,
    [missionId],
  )
  return {
    unresolved: Number(rows[0]?.unresolved ?? 0),
    reflections: Number(rows[0]?.reflections ?? 0),
  }
}

export async function completeLearningMissionRecord(db: Queryable, missionId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions SET status='completed',completed_at=NOW(),updated_at=NOW()
      WHERE id=$1 AND status IN ('active','paused')`,
    [missionId],
  )
  return Boolean(result.rowCount)
}

export async function findEligibleLearningMissionCoordinator(
  db: Queryable,
  args: { companyId: string; channelId: string; preferredPreset: string; currentAgentId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT participant.id FROM participants participant
       JOIN conversations conversation ON conversation.id=$2 AND conversation.company_id=$1
      WHERE participant.company_id=$1 AND participant.kind='agent' AND participant.departed_at IS NULL
        AND participant.capabilities @> '["canvas","learning"]'::jsonb
        AND conversation.members ? participant.id
      ORDER BY CASE WHEN participant.preset_key=$3 THEN 0 WHEN participant.preset_key='nova' THEN 1
        WHEN participant.id=$4 THEN 2 ELSE 3 END,participant.id LIMIT 1`,
    [args.companyId,args.channelId,args.preferredPreset,args.currentAgentId],
  )
  return rows[0]?.id ?? null
}

export async function upsertLearningMission(
  db: Queryable,
  args: {
    id: string; companyId: string; courseId: string; learnerId: string; channelId: string
    triggerClientMsgNo: string; goal: string; successCriteria: string; missionKind: LearningMission['missionKind']
    coordinatorAgentId: string; createdBy: string
  },
): Promise<{ id: string; inserted: boolean }> {
  const { rows } = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO learning_missions
       (id,course_id,company_id,learner_id,conversation_id,trigger_client_msg_no,goal,success_criteria,
        mission_kind,coordinator_agent_id,created_by)
     SELECT $1,course.id,course.company_id,$4,$5,$6,$7,$8,$9,$10,$11
       FROM courses course WHERE course.id=$2 AND course.company_id=$3
     ON CONFLICT(course_id,learner_id,conversation_id,trigger_client_msg_no)
     DO UPDATE SET updated_at=learning_missions.updated_at RETURNING id,(xmax=0) AS inserted`,
    [args.id,args.courseId,args.companyId,args.learnerId,args.channelId,args.triggerClientMsgNo,args.goal,
      args.successCriteria,args.missionKind,args.coordinatorAgentId,args.createdBy],
  )
  if (!rows[0]) throw new Error('course not found')
  return rows[0]
}

export async function enqueueLearningMissionCoordinatorWork(
  db: Queryable,
  args: {
    id: string; companyId: string; coordinatorAgentId: string; channelId: string
    threadRootClientMsgNo: string; missionId: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO agent_work_items
       (id,company_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,
        reason,status,priority,execution_role)
     VALUES($1,$2,$3,$4,$5,$6,'handoff','queued',190,'coordinator')
     ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING`,
    [args.id,args.companyId,args.coordinatorAgentId,args.channelId,args.threadRootClientMsgNo,
      `mission-coordinator:${args.missionId}`],
  )
}

export async function learningChannelType(
  db: Queryable,
  companyId: string,
  channelId: string,
): Promise<number> {
  const { rows } = await db.query<{ channel_type: number }>(
    `SELECT COALESCE((profile->>'channelType')::int,2) AS channel_type
       FROM im_channel_bindings WHERE company_id=$1 AND channel_id=$2`,
    [companyId,channelId],
  )
  return Number(rows[0]?.channel_type ?? 2)
}
