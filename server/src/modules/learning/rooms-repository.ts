import type { Queryable } from '../../db/queryable.js'

export async function setLearningCourseMembershipRecord(
  db: Queryable,
  args: {
    companyId: string; courseId: string; userId: string; role: 'teacher'|'learner'; enabled: boolean
  },
): Promise<'updated'|'not_found'|'last_teacher'> {
  const { rows: locked } = await db.query(
    `SELECT 1 FROM courses WHERE id=$1 AND company_id=$2 FOR UPDATE`,
    [args.courseId,args.companyId],
  )
  if (!locked[0]) return 'not_found'
  const { rows: companyMember } = await db.query(
    `SELECT 1 FROM company_members WHERE company_id=$1 AND user_id=$2`,
    [args.companyId,args.userId],
  )
  if (!companyMember[0]) return 'not_found'
  const { rows } = await db.query<{ role: 'teacher'|'learner' }>(
    `SELECT role FROM course_members WHERE course_id=$1 AND company_id=$2 AND user_id=$3`,
    [args.courseId,args.companyId,args.userId],
  )
  const current = rows[0]?.role
  if (args.enabled) {
    await db.query(
      `INSERT INTO course_members(course_id,company_id,user_id,role)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(course_id,user_id) DO UPDATE SET role=EXCLUDED.role,updated_at=NOW()`,
      [args.courseId,args.companyId,args.userId,args.role],
    )
    return 'updated'
  }
  if (args.role === 'teacher') {
    if (current !== 'teacher') return 'updated'
    const { rows: counts } = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM course_members
        WHERE course_id=$1 AND company_id=$2 AND role='teacher'`,
      [args.courseId,args.companyId],
    )
    if (Number(counts[0]?.count ?? 0) <= 1) return 'last_teacher'
    await db.query(
      `UPDATE course_members SET role='learner',updated_at=NOW()
        WHERE course_id=$1 AND company_id=$2 AND user_id=$3 AND role='teacher'`,
      [args.courseId,args.companyId,args.userId],
    )
    return 'updated'
  }
  await db.query(
    `DELETE FROM course_members
      WHERE course_id=$1 AND company_id=$2 AND user_id=$3 AND role='learner'`,
    [args.courseId,args.companyId,args.userId],
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
