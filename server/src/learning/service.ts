import { pool } from '../db/pool.js'
import type { Queryable } from '../db/queryable.js'
import { inc } from '../metrics.js'
import type {
  LearningCourseSummary,
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
