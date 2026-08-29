import type { Queryable } from '../../db/queryable.js'
import type { LearningNotificationPreferences, NotificationPreferencesInput } from './contracts.js'

export async function listLearningCourseSummaries(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT course.id,course.company_id,course.project_id,project.name AS title,project.description,
            project.status,
            CASE WHEN member.role IN ('STUDENT','OBSERVER') THEN 'learner' ELSE 'teacher' END AS course_role,
            ((course.study_room_conversation_id IS NOT NULL)::int
              + (SELECT COUNT(*)::int FROM learning_course_rooms room
                  WHERE room.course_id=course.id AND room.company_id=course.company_id)) AS room_count,
            (SELECT COUNT(*)::int FROM learning_objectives objective
              WHERE objective.course_id=course.id AND objective.company_id=course.company_id
                AND objective.status<>'archived') AS objective_count,
            (SELECT COUNT(*)::int FROM project_memberships learner
              WHERE learner.project_id=course.project_id AND learner.company_id=course.company_id
                AND learner.status='ACTIVE' AND learner.role IN ('STUDENT','OBSERVER')) AS learner_count,
            course.created_at,project.updated_at
       FROM courses course
       JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
       JOIN project_memberships member ON member.project_id=course.project_id
         AND member.company_id=course.company_id AND member.user_id=$2 AND member.status='ACTIVE'
       JOIN company_memberships company_member ON company_member.company_id=member.company_id
         AND company_member.user_id=member.user_id AND company_member.status='ACTIVE'
      WHERE course.company_id=$1 ORDER BY project.status,project.updated_at DESC`,
    [companyId,userId],
  )
  return rows
}

export async function listDueLearningMastery(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT mastery.course_id,mastery.objective_id,objective.title,mastery.level,
            mastery.status,mastery.next_review_at
       FROM learning_mastery mastery
       JOIN learning_objectives objective ON objective.id=mastery.objective_id
         AND objective.company_id=mastery.company_id AND objective.course_id=mastery.course_id
       JOIN courses course ON course.id=mastery.course_id AND course.company_id=mastery.company_id
       JOIN project_memberships member ON member.project_id=course.project_id
         AND member.company_id=mastery.company_id AND member.user_id=mastery.learner_id
         AND member.status='ACTIVE' AND member.role IN ('STUDENT','OBSERVER')
      WHERE mastery.company_id=$1 AND mastery.learner_id=$2 AND mastery.next_review_at<=NOW()
      ORDER BY mastery.next_review_at LIMIT 50`,
    [companyId,userId],
  )
  return rows
}

export async function countViewerPendingLearningReviews(
  db: Queryable,
  companyId: string,
  userId: string,
): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
       JOIN courses course ON course.id=attempt.course_id AND course.company_id=attempt.company_id
       JOIN project_memberships member ON member.project_id=course.project_id
         AND member.company_id=attempt.company_id AND member.user_id=$2
        AND member.status='ACTIVE' AND member.role IN ('OWNER','TEACHER')
      WHERE attempt.company_id=$1 AND evaluation.status='pending'`,
    [companyId,userId],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function listViewerLearningMastery(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT mastery.course_id,mastery.objective_id,objective.title,mastery.level,
            mastery.status,mastery.next_review_at,mastery.review_interval_days
       FROM learning_mastery mastery
       JOIN learning_objectives objective ON objective.id=mastery.objective_id
         AND objective.company_id=mastery.company_id AND objective.course_id=mastery.course_id
       JOIN courses course ON course.id=mastery.course_id AND course.company_id=mastery.company_id
       JOIN project_memberships member ON member.project_id=course.project_id
         AND member.company_id=mastery.company_id AND member.user_id=mastery.learner_id
         AND member.status='ACTIVE' AND member.role IN ('STUDENT','OBSERVER')
      WHERE mastery.company_id=$1 AND mastery.learner_id=$2 ORDER BY objective.position`,
    [companyId,userId],
  )
  return rows
}

export async function listLearningEvidenceRecords(
  db: Queryable,
  args: { companyId: string; courseId: string; learnerId: string },
) {
  const { rows } = await db.query(
    `SELECT attempt.id,attempt.activity_id,attempt.mission_step_id,attempt.assistance,attempt.status,
            attempt.evidence,attempt.submitted_at AS created_at,evaluation.id AS evaluation_id,
            evaluation.demonstrated_level,evaluation.confidence,evaluation.rubric_results,
            evaluation.feedback,evaluation.status AS evaluation_status
       FROM learning_attempts attempt
       LEFT JOIN learning_evaluations evaluation ON evaluation.attempt_id=attempt.id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND attempt.learner_id=$3
      ORDER BY attempt.submitted_at DESC LIMIT 200`,
    [args.companyId,args.courseId,args.learnerId],
  )
  return rows
}

export async function listPendingLearningEvaluationRecords(
  db: Queryable,
  companyId: string,
  courseId: string,
) {
  const { rows } = await db.query(
    `SELECT evaluation.id,evaluation.attempt_id,evaluation.demonstrated_level,evaluation.confidence,
            evaluation.rubric_results,evaluation.feedback,evaluation.created_at,
            evaluation.source_report_id,evaluation.verifier_report_id,
            source.author_agent_id AS builder_agent_id,verifier.author_agent_id AS verifier_agent_id,
            verifier.verdict AS verifier_verdict,attempt.learner_id,attempt.activity_id,
            attempt.assistance,attempt.evidence,activity.title AS activity_title
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt ON attempt.id=evaluation.attempt_id
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.course_id=attempt.course_id
       LEFT JOIN canvas_assignment_reports source ON source.id=evaluation.source_report_id
         AND source.company_id=attempt.company_id
       LEFT JOIN canvas_assignment_reports verifier ON verifier.id=evaluation.verifier_report_id
         AND verifier.company_id=attempt.company_id
      WHERE attempt.company_id=$1 AND attempt.course_id=$2 AND evaluation.status='pending'
      ORDER BY evaluation.created_at ASC`,
    [companyId,courseId],
  )
  return rows
}

export async function listLearningCourseProgress(db: Queryable, companyId: string, courseId: string) {
  const { rows } = await db.query(
    `SELECT member.user_id,user_account.display_name,user_account.email,
            COALESCE(mastery_summary.average_level,0)::float AS average_level,
            COALESCE(mastery_summary.verified_objectives,0)::int AS verified_objectives,
            COALESCE(mastery_summary.due_objectives,0)::int AS due_objectives,
            COALESCE(attempt_summary.attempts,0)::int AS attempts
       FROM project_memberships member
       JOIN users user_account ON user_account.id=member.user_id
       JOIN courses course ON course.project_id=member.project_id AND course.company_id=member.company_id
       LEFT JOIN LATERAL (
         SELECT AVG(mastery.level) AS average_level,
                COUNT(*) FILTER(WHERE mastery.level>=3) AS verified_objectives,
                COUNT(*) FILTER(WHERE mastery.next_review_at<=NOW()) AS due_objectives
           FROM learning_mastery mastery
          WHERE mastery.company_id=member.company_id AND mastery.course_id=course.id
            AND mastery.learner_id=member.user_id
       ) mastery_summary ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS attempts FROM learning_attempts attempt
          WHERE attempt.company_id=member.company_id AND attempt.course_id=course.id
            AND attempt.learner_id=member.user_id
       ) attempt_summary ON TRUE
      WHERE member.company_id=$1 AND course.id=$2 AND member.status='ACTIVE'
        AND member.role IN ('STUDENT','OBSERVER')
      ORDER BY user_account.display_name`,
    [companyId,courseId],
  )
  return rows
}

export async function findNotificationPreferences(
  db: Queryable,
  companyId: string,
  userId: string,
  courseId?: string,
): Promise<LearningNotificationPreferences | null> {
  const { rows } = await db.query<LearningNotificationPreferences>(
    `SELECT company_id,user_id,course_id,in_app_enabled,email_enabled,timezone,
            preferred_time::text,quiet_start::text,quiet_end::text
       FROM learning_notification_preferences
      WHERE company_id=$1 AND user_id=$2
        AND (course_id IS NOT DISTINCT FROM $3 OR ($3::text IS NOT NULL AND course_id IS NULL))
      ORDER BY course_id NULLS LAST LIMIT 1`,
    [companyId, userId, courseId ?? null],
  )
  return rows[0] ?? null
}

export async function upsertNotificationPreferences(
  db: Queryable,
  args: LearningScopeNotificationPreferences,
): Promise<void> {
  if (args.courseId) {
    await db.query(
      `INSERT INTO learning_notification_preferences
         (id,company_id,user_id,course_id,in_app_enabled,email_enabled,timezone,preferred_time,quiet_start,quiet_end)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT(company_id,user_id,course_id) WHERE course_id IS NOT NULL DO UPDATE SET
         in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,
         timezone=EXCLUDED.timezone,preferred_time=EXCLUDED.preferred_time,
         quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=NOW()`,
      [args.id,args.companyId,args.userId,args.courseId,args.inAppEnabled,args.emailEnabled,args.timezone,
        args.preferredTime,args.quietStart ?? null,args.quietEnd ?? null],
    )
    return
  }
  await db.query(
    `INSERT INTO learning_notification_preferences
       (id,company_id,user_id,course_id,in_app_enabled,email_enabled,timezone,preferred_time,quiet_start,quiet_end)
     VALUES($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9)
     ON CONFLICT(company_id,user_id) WHERE course_id IS NULL DO UPDATE SET
       in_app_enabled=EXCLUDED.in_app_enabled,email_enabled=EXCLUDED.email_enabled,
       timezone=EXCLUDED.timezone,preferred_time=EXCLUDED.preferred_time,
       quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,updated_at=NOW()`,
    [args.id,args.companyId,args.userId,args.inAppEnabled,args.emailEnabled,args.timezone,
      args.preferredTime,args.quietStart ?? null,args.quietEnd ?? null],
  )
}

interface LearningScopeNotificationPreferences extends NotificationPreferencesInput {
  id: string
  companyId: string
  userId: string
}

export async function studyRoomState(db: Queryable, courseId: string) {
  const { rows } = await db.query<{
    room_id: string | null; company_id: string; title: string; topic: string | null; leader_id: string | null
  }>(
    `SELECT course.study_room_conversation_id AS room_id,course.company_id,
            conversation.title,conversation.topic,conversation.leader_id
       FROM courses course
       LEFT JOIN conversations conversation
         ON conversation.id=course.study_room_conversation_id AND conversation.company_id=course.company_id
      WHERE course.id=$1`,
    [courseId],
  )
  return rows[0] ?? null
}

export async function syncStudyRoomMembers(db: Queryable, args: {
  courseId: string; companyId: string; roomId: string; title: string; topic: string | null; leaderId: string | null
}) {
  const { rows } = await db.query<{ id: string }>(
    `SELECT course_member.user_id AS id FROM project_memberships course_member
       JOIN courses course ON course.project_id=course_member.project_id AND course.company_id=course_member.company_id
      WHERE course.id=$1 AND course_member.company_id=$2 AND course_member.status='ACTIVE'
     UNION
     SELECT participant.id FROM participants participant
      WHERE participant.company_id=$2 AND participant.kind='agent'
        AND participant.preset_key IN ('nova','sage','milo','trace') AND participant.departed_at IS NULL`,
    [args.courseId, args.companyId],
  )
  const members = rows.map((row) => row.id)
  await db.query(
    `UPDATE conversations SET members=$2::jsonb,subtitle=$3,updated_at=NOW()
      WHERE id=$1 AND company_id=$4`,
    [args.roomId, JSON.stringify(members), `course · ${members.length}`, args.companyId],
  )
  const profile = {
    channelId: args.roomId, channelType: 2, kind: 'group', title: args.title,
    topic: args.topic, members, pinned: true, createdAt: new Date().toISOString(),
  }
  await db.query(
    `INSERT INTO im_channel_bindings (channel_id,company_id,profile,leader_agent_id)
     VALUES ($1,$2,$3::jsonb,$4)
     ON CONFLICT (channel_id) DO UPDATE SET
       company_id=EXCLUDED.company_id,profile=EXCLUDED.profile,leader_agent_id=EXCLUDED.leader_agent_id`,
    [args.roomId, args.companyId, JSON.stringify(profile), args.leaderId],
  )
  return members
}

