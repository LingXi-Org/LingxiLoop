import type { Queryable } from '../../db/queryable.js'
import { projectRoleFromLearningWire, type ProjectRole } from '../../domain/access/public.js'

export async function setLearningCourseMembershipRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; userId: string; role: 'teacher'|'learner'; enabled: boolean
  },
): Promise<'updated'|'not_found'|'last_teacher'> {
  const { rows: locked } = await db.query<{ project_id: string }>(
    `SELECT project_id FROM courses WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [args.courseId,args.companyId],
  )
  if (!locked[0]) return 'not_found'
  const { rows: companyMember } = await db.query(
    `SELECT 1 FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE'`,
    [args.companyId,args.userId],
  )
  if (!companyMember[0]) return 'not_found'
  const projectId = locked[0].project_id
  const { rows } = await db.query<{ role: ProjectRole }>(
    `SELECT role FROM project_memberships
      WHERE project_id=$1 AND company_id=$2 AND user_id=$3 AND status='ACTIVE'`,
    [projectId,args.companyId,args.userId],
  )
  const current = rows[0]?.role
  if (args.enabled) {
    await db.query(
      `INSERT INTO project_memberships(project_id,company_id,user_id,role)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(user_id,project_id) DO UPDATE SET
         role=CASE
           WHEN project_memberships.role='OWNER' THEN 'OWNER'
           WHEN project_memberships.role='TEACHER' AND EXCLUDED.role='STUDENT' THEN 'TEACHER'
           ELSE EXCLUDED.role END,
         status='ACTIVE',updated_at=NOW()`,
      [projectId,args.companyId,args.userId,projectRoleFromLearningWire(args.role)],
    )
    return 'updated'
  }
  if (args.role === 'teacher') {
    if (current !== 'OWNER' && current !== 'TEACHER') return 'updated'
    const { rows: counts } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM project_memberships
        WHERE project_id=$1 AND company_id=$2 AND status='ACTIVE' AND role IN ('OWNER','TEACHER')`,
      [projectId,args.companyId],
    )
    if (Number(counts[0]?.count ?? 0) <= 1) return 'last_teacher'
    await db.query(
      `UPDATE project_memberships SET role='STUDENT',updated_at=NOW()
        WHERE project_id=$1 AND company_id=$2 AND user_id=$3
          AND status='ACTIVE' AND role IN ('OWNER','TEACHER')`,
      [projectId,args.companyId,args.userId],
    )
    return 'updated'
  }
  await db.query(
    `DELETE FROM project_memberships
      WHERE project_id=$1 AND company_id=$2 AND user_id=$3 AND role IN ('STUDENT','OBSERVER')`,
    [projectId,args.companyId,args.userId],
  )
  return 'updated'
}

export async function upsertLearningCourseRoom(
  db: Queryable,
  args: {
    companyId: string; courseId: string; conversationId: string
    purpose: 'lab'|'discussion'; createdBy: string
  },
): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO learning_course_rooms(course_id,company_id,conversation_id,purpose,created_by)
     SELECT course.id,course.company_id,conversation.id,$4,$5
       FROM courses course
       JOIN conversations conversation ON conversation.company_id=course.company_id
         AND conversation.project_id=course.project_id
      WHERE course.id=$2 AND course.company_id=$1 AND conversation.id=$3
        AND conversation.kind='group'
        AND NOT EXISTS(SELECT 1 FROM learning_course_teacher_rooms teacher_room
          WHERE teacher_room.company_id=$1 AND teacher_room.conversation_id=conversation.id)
     ON CONFLICT(conversation_id) DO UPDATE SET
       course_id=EXCLUDED.course_id,company_id=EXCLUDED.company_id,
       purpose=EXCLUDED.purpose,created_by=EXCLUDED.created_by`,
    [args.companyId,args.courseId,args.conversationId,args.purpose,args.createdBy],
  )
  return Boolean(result.rowCount)
}

export async function deleteLearningCourseRoom(
  db: Queryable,
  args: { companyId: string; courseId: string; conversationId: string },
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM learning_course_rooms
      WHERE company_id=$1 AND course_id=$2 AND conversation_id=$3`,
    [args.companyId,args.courseId,args.conversationId],
  )
  return Boolean(result.rowCount)
}
