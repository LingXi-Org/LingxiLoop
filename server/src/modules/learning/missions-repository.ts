import type { Queryable } from '../../db/queryable.js'
import type { ProjectKind, ProjectStatus } from '../../domain/public.js'
import type { LearningAgentRoomScope } from './contracts.js'
import type { LearningMission, LearningMissionStep } from './types.js'

interface LearningMissionRow {
  id: string
  project_id: string
  learner_id: string
  conversation_id: string
  trigger_client_msg_no: string
  goal: string
  success_criteria: string
  status: LearningMission['status']
  kind: LearningMission['kind']
  coordinator_agent_id: string
  created_at: string
  updated_at: string
}

interface LearningMissionStepRow {
  id: string
  mission_id: string
  kind: LearningMissionStep['kind']
  description: string
  success_criteria: string
  knowledge_unit_id: string | null
  status: LearningMissionStep['status']
  position: number
  outcome: string | null
  completion_report_id: string | null
  completion_attempt_id: string | null
}

function mapLearningMissionStep(step: LearningMissionStepRow): LearningMissionStep {
  return {
    id: step.id,
    kind: step.kind,
    description: step.description,
    successCriteria: step.success_criteria,
    ...(step.knowledge_unit_id ? { knowledgeUnitId: step.knowledge_unit_id } : {}),
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
    projectId: row.project_id,
    learnerId: row.learner_id,
    conversationId: row.conversation_id,
    triggerClientMsgNo: row.trigger_client_msg_no,
    goal: row.goal,
    successCriteria: row.success_criteria,
    kind: row.kind,
    coordinatorAgentId: row.coordinator_agent_id,
    status: row.status,
    steps: steps.map(mapLearningMissionStep),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

const learningMissionColumns = `mission.id,mission.project_id,mission.learner_id,mission.conversation_id,
  mission.trigger_client_msg_no,mission.goal,mission.success_criteria,mission.status,mission.kind,
  mission.coordinator_agent_id,mission.created_at,mission.updated_at`

async function learningMissionSteps(
  db: Queryable,
  companyId: string,
  projectId: string,
  missionIds: string[],
): Promise<LearningMissionStepRow[]> {
  if (!missionIds.length) return []
  const { rows } = await db.query<LearningMissionStepRow>(
    `SELECT step.id,step.mission_id,step.kind,step.description,step.success_criteria,
            step.knowledge_unit_id,step.status,step.position,step.outcome,
            step.completion_report_id,step.completion_attempt_id
       FROM learning_mission_steps step
      WHERE step.company_id=$1 AND step.project_id=$2 AND step.mission_id=ANY($3::text[])
      ORDER BY step.mission_id,step.position,step.created_at`,
    [companyId,projectId,missionIds],
  )
  return rows
}

export async function findLearningMission(
  db: Queryable,
  companyId: string,
  projectId: string,
  missionId: string,
): Promise<LearningMission | null> {
  const { rows } = await db.query<LearningMissionRow>(
    `SELECT ${learningMissionColumns} FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.id=$3`,
    [companyId,projectId,missionId],
  )
  if (!rows[0]) return null
  return mapLearningMission(rows[0], await learningMissionSteps(db, companyId, projectId, [missionId]))
}

export async function listLearningMissions(
  db: Queryable,
  args: { companyId: string; projectId: string; userId: string; includeAllLearners: boolean },
): Promise<LearningMission[]> {
  const { rows } = await db.query<LearningMissionRow>(
    `SELECT ${learningMissionColumns} FROM learning_missions mission
      WHERE mission.company_id=$1 AND mission.project_id=$2 AND ($3::boolean OR mission.learner_id=$4)
      ORDER BY mission.updated_at DESC LIMIT 100`,
    [args.companyId,args.projectId,args.includeAllLearners,args.userId],
  )
  const steps = await learningMissionSteps(db, args.companyId, args.projectId, rows.map((row) => row.id))
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
  args: { companyId: string; projectId: string; missionId: string; agentId: string },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions mission SET coordinator_agent_id=agent.id,updated_at=NOW()
       FROM participants agent,conversations conversation
      WHERE mission.company_id=$1 AND mission.project_id=$2 AND mission.id=$3
        AND conversation.id=mission.conversation_id AND conversation.company_id=mission.company_id
        AND conversation.project_id=mission.project_id
        AND agent.id=$4 AND agent.company_id=mission.company_id AND agent.kind='agent' AND agent.departed_at IS NULL
        AND agent.capabilities @> '["canvas","learning"]'::jsonb AND conversation.members ? agent.id`,
    [args.companyId,args.projectId,args.missionId,args.agentId],
  )
  return Boolean(result.rowCount)
}

export interface LearningRoomState {
  companyId: string
  projectId: string
  projectKind: ProjectKind
  projectTitle: string
  projectStatus: ProjectStatus
  courseId?: string
  purpose: 'study' | 'lab' | 'discussion'
}

export async function findLearningRoomState(
  db: Queryable,
  scope: LearningAgentRoomScope,
): Promise<LearningRoomState | null> {
  const { rows } = await db.query<{
    company_id: string
    project_id: string
    project_kind: ProjectKind
    project_title: string
    project_status: ProjectStatus
    course_id: string | null
    purpose: LearningRoomState['purpose']
  }>(
    `SELECT conversation.company_id,project.id AS project_id,project.kind AS project_kind,
            project.name AS project_title,project.status AS project_status,course.id AS course_id,
            CASE WHEN course.study_room_conversation_id=conversation.id THEN 'study'::text
                 ELSE COALESCE(room.purpose,'study'::text) END AS purpose
       FROM conversations conversation
       JOIN projects project
         ON project.id=conversation.project_id AND project.company_id=conversation.company_id
       LEFT JOIN courses course
         ON course.project_id=project.id AND course.company_id=project.company_id
        AND project.kind IN ('TEACHING','INSTITUTIONAL_COURSE')
       LEFT JOIN learning_course_rooms room
         ON room.course_id=course.id AND room.company_id=course.company_id
        AND room.conversation_id=conversation.id
      WHERE conversation.id=$1 AND conversation.company_id=$2
      LIMIT 1`,
    [scope.channelId,scope.companyId],
  )
  const row = rows[0]
  return row ? {
    companyId: row.company_id,
    projectId: row.project_id,
    projectKind: row.project_kind,
    projectTitle: row.project_title,
    projectStatus: row.project_status,
    ...(row.course_id ? { courseId: row.course_id } : {}),
    purpose: row.purpose,
  } : null
}

export async function lockLearningMission(
  db: Queryable,
  args: LearningAgentRoomScope & { projectId: string; missionId: string; statuses: LearningMission['status'][] },
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM learning_missions
      WHERE company_id=$1 AND project_id=$2 AND conversation_id=$3 AND id=$4 AND status=ANY($5::text[])
      FOR UPDATE`,
    [args.companyId,args.projectId,args.channelId,args.missionId,args.statuses],
  )
  return Boolean(rows[0])
}

interface MissionScope {
  companyId: string
  projectId: string
  missionId: string
}

export async function countLearningMissionSteps(db: Queryable, scope: MissionScope): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM learning_mission_steps
      WHERE company_id=$1 AND project_id=$2 AND mission_id=$3`,
    [scope.companyId,scope.projectId,scope.missionId],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function insertLearningMissionStep(
  db: Queryable,
  args: MissionScope & {
    id: string
    kind: LearningMissionStep['kind']
    description: string
    successCriteria: string
    knowledgeUnitId?: string
    position: number
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_mission_steps
       (id,company_id,project_id,mission_id,kind,description,success_criteria,knowledge_unit_id,position)
     SELECT $1,mission.company_id,mission.project_id,mission.id,$5,$6,$7,unit.id,$9
       FROM learning_missions mission
       LEFT JOIN learning_knowledge_units unit
         ON unit.company_id=mission.company_id AND unit.project_id=mission.project_id AND unit.id=$8
      WHERE mission.company_id=$2 AND mission.project_id=$3 AND mission.id=$4
        AND ($8::text IS NULL OR unit.id IS NOT NULL)
        AND NOT EXISTS(SELECT 1 FROM learning_mission_steps step
          WHERE step.company_id=$2 AND step.project_id=$3 AND step.mission_id=$4
            AND lower(step.description)=lower($6))`,
    [args.id,args.companyId,args.projectId,args.missionId,args.kind,args.description,args.successCriteria,
      args.knowledgeUnitId ?? null,args.position],
  )
  return Boolean(result.rowCount)
}

export async function learningMissionPlanningSummary(
  db: Queryable,
  scope: MissionScope,
): Promise<{ total: number; checks: number; reflections: number }> {
  const { rows } = await db.query<{ total: number; checks: number; reflections: number }>(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE kind='CHECK')::int AS checks,
            COUNT(*) FILTER (WHERE kind='REFLECT')::int AS reflections
       FROM learning_mission_steps
      WHERE company_id=$1 AND project_id=$2 AND mission_id=$3`,
    [scope.companyId,scope.projectId,scope.missionId],
  )
  return {
    total: Number(rows[0]?.total ?? 0),
    checks: Number(rows[0]?.checks ?? 0),
    reflections: Number(rows[0]?.reflections ?? 0),
  }
}

export async function activateLearningMission(db: Queryable, scope: MissionScope): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions SET status='ACTIVE',updated_at=NOW()
      WHERE company_id=$1 AND project_id=$2 AND id=$3 AND status='PLANNING'`,
    [scope.companyId,scope.projectId,scope.missionId],
  )
  return Boolean(result.rowCount)
}

export async function updateLearningMissionStepRecord(
  db: Queryable,
  args: LearningAgentRoomScope & MissionScope & {
    stepId: string
    status: LearningMissionStep['status']
    outcome?: string
    sourceReportId?: string
    attemptId?: string
  },
): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_mission_steps step
        SET status=$6,outcome=$7,
            completion_report_id=COALESCE((SELECT report.id FROM canvas_assignment_reports report
              JOIN canvases canvas ON canvas.id=report.canvas_id AND canvas.company_id=report.company_id
              WHERE report.id=$8 AND report.company_id=$1 AND canvas.project_id=$2),step.completion_report_id),
            completion_attempt_id=COALESCE((SELECT attempt.id FROM learning_attempts attempt
              WHERE attempt.id=$9 AND attempt.company_id=$1 AND attempt.project_id=$2
                AND attempt.learner_id=mission.learner_id),step.completion_attempt_id),
            updated_at=NOW()
       FROM learning_missions mission
      WHERE step.company_id=$1 AND step.project_id=$2 AND step.id=$5 AND step.mission_id=$4
        AND mission.company_id=step.company_id AND mission.project_id=step.project_id AND mission.id=step.mission_id
        AND mission.conversation_id=$3
        AND ($6<>'COMPLETED'
          OR ($8 IS NOT NULL AND EXISTS(SELECT 1 FROM canvas_assignment_reports report
            JOIN canvases canvas ON canvas.id=report.canvas_id AND canvas.company_id=report.company_id
            WHERE report.id=$8 AND report.company_id=$1 AND canvas.project_id=$2))
          OR ($9 IS NOT NULL AND EXISTS(SELECT 1 FROM learning_attempts attempt
            WHERE attempt.id=$9 AND attempt.company_id=$1 AND attempt.project_id=$2
              AND attempt.learner_id=mission.learner_id)))`,
    [args.companyId,args.projectId,args.channelId,args.missionId,args.stepId,args.status,
      args.outcome?.trim() ?? null,args.sourceReportId ?? null,args.attemptId ?? null],
  )
  return Boolean(result.rowCount)
}

export async function learningMissionCompletionSummary(
  db: Queryable,
  scope: MissionScope,
): Promise<{ unresolved: number; reflections: number }> {
  const { rows } = await db.query<{ unresolved: number; reflections: number }>(
    `SELECT COUNT(*) FILTER (WHERE status IN ('OPEN','IN_PROGRESS'))::int AS unresolved,
            COUNT(*) FILTER (WHERE kind='REFLECT' AND status='COMPLETED')::int AS reflections
       FROM learning_mission_steps
      WHERE company_id=$1 AND project_id=$2 AND mission_id=$3`,
    [scope.companyId,scope.projectId,scope.missionId],
  )
  return {
    unresolved: Number(rows[0]?.unresolved ?? 0),
    reflections: Number(rows[0]?.reflections ?? 0),
  }
}

export async function completeLearningMissionRecord(db: Queryable, scope: MissionScope): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_missions SET status='COMPLETED',completed_at=NOW(),updated_at=NOW()
      WHERE company_id=$1 AND project_id=$2 AND id=$3 AND status IN ('ACTIVE','PAUSED')`,
    [scope.companyId,scope.projectId,scope.missionId],
  )
  return Boolean(result.rowCount)
}

export async function findEligibleLearningMissionCoordinator(
  db: Queryable,
  args: { companyId: string; projectId: string; channelId: string; preferredPreset: string; currentAgentId: string },
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT participant.id FROM participants participant
       JOIN conversations conversation
         ON conversation.id=$3 AND conversation.company_id=$1 AND conversation.project_id=$2
      WHERE participant.company_id=$1 AND participant.kind='agent' AND participant.departed_at IS NULL
        AND participant.capabilities @> '["canvas","learning"]'::jsonb
        AND conversation.members ? participant.id
      ORDER BY CASE WHEN participant.preset_key=$4 THEN 0 WHEN participant.preset_key='nova' THEN 1
        WHEN participant.id=$5 THEN 2 ELSE 3 END,participant.id LIMIT 1`,
    [args.companyId,args.projectId,args.channelId,args.preferredPreset,args.currentAgentId],
  )
  return rows[0]?.id ?? null
}

export async function upsertLearningMission(
  db: Queryable,
  args: {
    id: string
    companyId: string
    projectId: string
    learnerId: string
    channelId: string
    triggerClientMsgNo: string
    goal: string
    successCriteria: string
    kind: LearningMission['kind']
    coordinatorAgentId: string
    createdBy: string
  },
): Promise<{ id: string; inserted: boolean }> {
  const { rows } = await db.query<{ id: string; inserted: boolean }>(
    `INSERT INTO learning_missions
       (id,company_id,project_id,learner_id,conversation_id,trigger_client_msg_no,goal,success_criteria,
        kind,coordinator_agent_id,created_by)
     SELECT $1,project.company_id,project.id,$4,$5,$6,$7,$8,$9,$10,$11
       FROM projects project WHERE project.company_id=$2 AND project.id=$3
     ON CONFLICT(company_id,project_id,learner_id,conversation_id,trigger_client_msg_no)
     DO UPDATE SET updated_at=learning_missions.updated_at RETURNING id,(xmax=0) AS inserted`,
    [args.id,args.companyId,args.projectId,args.learnerId,args.channelId,args.triggerClientMsgNo,args.goal,
      args.successCriteria,args.kind,args.coordinatorAgentId,args.createdBy],
  )
  if (!rows[0]) throw new Error('project not found')
  return rows[0]
}

export async function enqueueLearningMissionCoordinatorWork(
  db: Queryable,
  args: {
    id: string
    companyId: string
    coordinatorAgentId: string
    channelId: string
    threadRootClientMsgNo: string
    missionId: string
    authorizationUserId: string
  },
): Promise<void> {
  await db.query(
    `INSERT INTO agent_work_items
       (id,company_id,authorization_user_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,
        reason,status,priority,execution_role)
     VALUES($1,$2,$3,$4,$5,$6,$7,'handoff','queued',190,'coordinator')
     ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING`,
    [args.id,args.companyId,args.authorizationUserId,args.coordinatorAgentId,args.channelId,args.threadRootClientMsgNo,
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
