import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { inc } from '../metrics.js'
import type {
  LearningRole,
  LearningRoomPurpose,
} from './types.js'
export { projectMastery } from './mastery.js'

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
