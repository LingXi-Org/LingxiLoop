import type { Queryable } from '../../db/queryable.js'

export interface VersionedTeacherTarget {
  status: string
  updatedAt: unknown
  label: string | null
}

export async function findTeacherObjectiveApprovalTarget(
  db: Queryable,
  companyId: string,
  courseId: string,
  objectiveId: string,
): Promise<VersionedTeacherTarget | undefined> {
  const { rows } = await db.query<{ status: string; updated_at: unknown; label: string | null }>(
    `SELECT objective.status,objective.updated_at,objective.title AS label
       FROM courses course
       JOIN learning_knowledge_units objective
         ON objective.company_id=course.company_id AND objective.project_id=course.project_id
      WHERE course.company_id=$1 AND course.id=$2 AND objective.id=$3`,
    [companyId, courseId, objectiveId],
  )
  const row = rows[0]
  return row ? { status: row.status, updatedAt: row.updated_at, label: row.label } : undefined
}

export async function findTeacherActivityApprovalTarget(
  db: Queryable,
  companyId: string,
  courseId: string,
  activityId: string,
): Promise<VersionedTeacherTarget | undefined> {
  const { rows } = await db.query<{ status: string; updated_at: unknown; label: string | null }>(
    `SELECT activity.status,activity.updated_at,activity.title AS label
       FROM courses course
       JOIN learning_activities activity
         ON activity.company_id=course.company_id AND activity.project_id=course.project_id
      WHERE course.company_id=$1 AND course.id=$2 AND activity.id=$3`,
    [companyId, courseId, activityId],
  )
  const row = rows[0]
  return row ? { status: row.status, updatedAt: row.updated_at, label: row.label } : undefined
}

export async function findTeacherCourseApprovalTarget(
  db: Queryable,
  companyId: string,
  courseId: string,
): Promise<VersionedTeacherTarget | undefined> {
  const { rows } = await db.query<{ status: string; updated_at: unknown; label: string | null }>(
    `SELECT project.status,project.updated_at,project.name AS label
       FROM courses course
       JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
      WHERE course.company_id=$1 AND course.id=$2`,
    [companyId, courseId],
  )
  const row = rows[0]
  return row ? { status: row.status, updatedAt: row.updated_at, label: row.label } : undefined
}

export async function findTeacherMembershipApprovalTarget(
  db: Queryable,
  companyId: string,
  courseId: string,
  userId: string,
): Promise<{ enabled: boolean; label: string | null }> {
  const { rows } = await db.query<{ enabled: boolean; label: string | null }>(
    `SELECT EXISTS(
       SELECT 1 FROM courses course
       JOIN project_memberships member
         ON member.project_id=course.project_id AND member.company_id=course.company_id
        AND member.status='ACTIVE'
        WHERE member.company_id=$1 AND course.id=$2
          AND member.user_id=$3 AND member.role IN ('OWNER','TEACHER')
     ) AS enabled,
     (SELECT participant.name FROM participants participant
       WHERE participant.company_id=$1 AND participant.id=$3 LIMIT 1) AS label`,
    [companyId, courseId, userId],
  )
  return { enabled: Boolean(rows[0]?.enabled), label: rows[0]?.label ?? null }
}

export async function findTeacherEvaluationApprovalTarget(
  db: Queryable,
  companyId: string,
  courseId: string,
  evaluationId: string,
): Promise<{ status: string; label: string | null } | undefined> {
  const { rows } = await db.query<{ status: string; label: string | null }>(
    `SELECT evaluation.status,activity.title AS label
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.company_id=evaluation.company_id AND attempt.project_id=evaluation.project_id
        AND attempt.id=evaluation.attempt_id
       JOIN courses course
         ON course.company_id=attempt.company_id AND course.project_id=attempt.project_id
       LEFT JOIN learning_activities activity
         ON activity.id=attempt.activity_id
        AND activity.company_id=attempt.company_id
        AND activity.project_id=attempt.project_id
      WHERE evaluation.id=$3 AND course.company_id=$1 AND course.id=$2`,
    [companyId, courseId, evaluationId],
  )
  return rows[0]
}

export async function findTeacherObjectiveApprovalVersion(
  db: Queryable,
  companyId: string,
  channelId: string,
  objectiveId: string,
): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT objective.updated_at AS value
       FROM learning_knowledge_units objective
       JOIN courses course
         ON course.company_id=objective.company_id AND course.project_id=objective.project_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.company_id=course.company_id AND teacher_room.course_id=course.id
      WHERE objective.company_id=$1 AND objective.id=$3
        AND teacher_room.conversation_id=$2`,
    [companyId, channelId, objectiveId],
  )
  return rows[0]?.value
}

export async function findTeacherActivityApprovalVersion(
  db: Queryable,
  companyId: string,
  channelId: string,
  activityId: string,
): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT activity.updated_at AS value
       FROM learning_activities activity
       JOIN courses course
         ON course.company_id=activity.company_id AND course.project_id=activity.project_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.company_id=course.company_id AND teacher_room.course_id=course.id
      WHERE activity.company_id=$1 AND activity.id=$3
        AND teacher_room.conversation_id=$2`,
    [companyId, channelId, activityId],
  )
  return rows[0]?.value
}

export async function findTeacherCourseApprovalVersion(
  db: Queryable,
  companyId: string,
  channelId: string,
  courseId: string,
): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT project.updated_at AS value
       FROM courses course
       JOIN projects project
         ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.course_id=course.id AND teacher_room.company_id=course.company_id
      WHERE course.company_id=$1 AND course.id=$3
        AND teacher_room.conversation_id=$2`,
    [companyId, channelId, courseId],
  )
  return rows[0]?.value
}

export async function findTeacherMembershipApprovalVersion(
  db: Queryable,
  companyId: string,
  channelId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1
       FROM project_memberships member
       JOIN courses course ON course.project_id=member.project_id AND course.company_id=member.company_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.company_id=member.company_id
        AND teacher_room.course_id=course.id
      WHERE member.company_id=$1 AND teacher_room.conversation_id=$2
        AND member.user_id=$3 AND member.status='ACTIVE'
        AND member.role IN ('OWNER','TEACHER')`,
    [companyId, channelId, userId],
  )
  return Boolean(rows[0])
}

export async function findTeacherEvaluationApprovalVersion(
  db: Queryable,
  companyId: string,
  channelId: string,
  evaluationId: string,
): Promise<unknown> {
  const { rows } = await db.query<{ value: unknown }>(
    `SELECT evaluation.status AS value
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.company_id=evaluation.company_id AND attempt.project_id=evaluation.project_id
        AND attempt.id=evaluation.attempt_id
       JOIN courses course
         ON course.company_id=attempt.company_id AND course.project_id=attempt.project_id
       JOIN learning_course_teacher_rooms teacher_room
         ON teacher_room.company_id=course.company_id AND teacher_room.course_id=course.id
      WHERE attempt.company_id=$1 AND teacher_room.conversation_id=$2
        AND evaluation.id=$3`,
    [companyId, channelId, evaluationId],
  )
  return rows[0]?.value
}
