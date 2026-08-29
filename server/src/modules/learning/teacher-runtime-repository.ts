import type { Queryable } from '../../db/queryable.js'

export interface TeacherScopeBindingRow {
  company_id: string
  project_id: string
  project_name: string
  course_id: string
  course_title: string
  course_status: 'ACTIVE' | 'ARCHIVED'
  room_id: string
  room_status: 'active' | 'closed'
  agent_id: string
  agent_name: string
  has_teacher: boolean
}

export interface TeacherDigestScheduleRow {
  schedule: Record<string, unknown>
  timezone: string
  status: string
  next_run_at: string | null
}

export interface TeacherTurnCountsRow {
  learners: number
  objectives: number
  activities: number
  pending_reviews: number
}

export async function findTeacherScopeBinding(
  db: Queryable,
  companyId: string,
  agentId: string,
  channelId: string,
): Promise<TeacherScopeBindingRow | undefined> {
  const { rows } = await db.query<TeacherScopeBindingRow>(
    `SELECT project_agent.company_id,project_agent.project_id,project.name AS project_name,
            course.id AS course_id,project.name AS course_title,
            project.status AS course_status,teacher_room.conversation_id AS room_id,
            teacher_room.status AS room_status,project_agent.agent_id,
            participant.name AS agent_name,
            EXISTS(
              SELECT 1 FROM project_memberships member
               WHERE member.company_id=course.company_id AND member.project_id=course.project_id
                 AND member.status='ACTIVE' AND member.role IN ('OWNER','TEACHER')
            ) AS has_teacher
       FROM learning_project_teacher_agents project_agent
       JOIN projects project
         ON project.id=project_agent.project_id AND project.company_id=project_agent.company_id
       JOIN courses course
         ON course.project_id=project_agent.project_id AND course.company_id=project_agent.company_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.course_id=course.id AND teacher_room.company_id=course.company_id
       JOIN participants participant
         ON participant.id=project_agent.agent_id
        AND participant.company_id=project_agent.company_id
        AND participant.departed_at IS NULL
      WHERE project_agent.company_id=$1 AND project_agent.agent_id=$2
        AND teacher_room.conversation_id=$3
      LIMIT 1`,
    [companyId, agentId, channelId],
  )
  return rows[0]
}

export async function findTeacherApprovalTriggerAuthor(
  db: Queryable,
  input: {
    companyId: string
    agentId: string
    channelId: string
    approvalId: string
  },
): Promise<string | undefined> {
  const { rows } = await db.query<{ actor_id: string | null }>(
    `SELECT COALESCE(approval.resolved_by,approval.requested_by) AS actor_id
       FROM agent_os_approvals approval
      WHERE approval.id=$2 AND approval.company_id=$1 AND approval.agent_id=$3
        AND approval.channel_id=$4`,
    [input.companyId, input.approvalId, input.agentId, input.channelId],
  )
  return rows[0]?.actor_id || undefined
}

export async function pauseTeacherDigestForMissingTeacher(
  db: Queryable,
  companyId: string,
  agentId: string,
  channelId: string,
): Promise<void> {
  await db.query(
    `UPDATE agent_routines
        SET status='paused',next_run_at=NULL,updated_at=NOW()
      WHERE company_id=$1 AND agent_id=$2 AND channel_id=$3
        AND kind='teacher_project_digest'`,
    [companyId, agentId, channelId],
  )
}

export async function findTeacherDigestSchedule(
  db: Queryable,
  companyId: string,
  agentId: string,
  channelId: string,
): Promise<TeacherDigestScheduleRow | undefined> {
  const { rows } = await db.query<TeacherDigestScheduleRow>(
    `SELECT schedule,timezone,status,next_run_at
       FROM agent_routines
      WHERE company_id=$1 AND agent_id=$2 AND channel_id=$3
        AND kind='teacher_project_digest'
      LIMIT 1`,
    [companyId, agentId, channelId],
  )
  return rows[0]
}

export async function findTeacherTurnCounts(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<TeacherTurnCountsRow> {
  const { rows } = await db.query<TeacherTurnCountsRow>(
    `SELECT
      (SELECT COUNT(*)::int FROM project_memberships member
        JOIN courses course ON course.project_id=member.project_id AND course.company_id=member.company_id
        WHERE member.company_id=$1 AND course.id=$2 AND member.status='ACTIVE'
          AND member.role IN ('STUDENT','OBSERVER')) AS learners,
      (SELECT COUNT(*)::int FROM learning_objectives objective
        WHERE objective.company_id=$1 AND objective.course_id=$2 AND objective.status<>'archived') AS objectives,
      (SELECT COUNT(*)::int FROM learning_activities activity
        WHERE activity.company_id=$1 AND activity.course_id=$2 AND activity.status<>'closed') AS activities,
      (SELECT COUNT(*)::int
         FROM learning_evaluations evaluation
         JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
        WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending') AS pending_reviews`,
    [companyId, courseId],
  )
  return rows[0] ?? { learners: 0, objectives: 0, activities: 0, pending_reviews: 0 }
}
