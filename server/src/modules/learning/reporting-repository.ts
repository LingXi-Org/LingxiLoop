import type { Queryable } from '../../db/queryable.js'

export async function listLearningProjectSummaries(db: Queryable, companyId: string, userId: string) {
  const { rows } = await db.query(
    `SELECT project.id AS project_id,project.company_id,project.kind AS project_kind,
            course.id AS course_id,project.name AS title,project.description,project.status,
            CASE WHEN project.kind='PERSONAL_LEARNING' AND member.role='OWNER' THEN 'learner'
                 WHEN member.role IN ('STUDENT','OBSERVER') THEN 'learner'
                 ELSE 'teacher' END AS perspective,
            (SELECT COUNT(*)::int FROM project_memberships learner
              WHERE learner.project_id=project.id AND learner.company_id=project.company_id
                AND learner.status='ACTIVE' AND learner.role IN ('STUDENT','OBSERVER')) AS learner_count,
            project.created_at,project.updated_at
       FROM projects project
       LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
         AND project.kind IN ('TEACHING','INSTITUTIONAL_COURSE')
       JOIN project_memberships member ON member.project_id=project.id
         AND member.company_id=project.company_id AND member.user_id=$2 AND member.status='ACTIVE'
       JOIN company_memberships company_member ON company_member.company_id=member.company_id
         AND company_member.user_id=member.user_id AND company_member.status='ACTIVE'
      WHERE project.company_id=$1 AND project.status<>'DELETED'
      ORDER BY project.status,project.updated_at DESC LIMIT 100`,
    [companyId,userId],
  )
  return rows
}

export async function listDueLearningStates(
  db: Queryable,
  companyId: string,
  userId: string,
  projectIds: string[],
) {
  if (!projectIds.length) return []
  const { rows } = await db.query(
    `SELECT state.project_id AS "projectId",state.knowledge_unit_id AS "knowledgeUnitId",
            unit.title,state.level,state.status,state.next_review_at AS "nextReviewAt"
       FROM learning_states state
       JOIN learning_knowledge_units unit
         ON unit.id=state.knowledge_unit_id AND unit.company_id=state.company_id
        AND unit.project_id=state.project_id
      WHERE state.company_id=$1 AND state.user_id=$2 AND state.project_id=ANY($3::text[])
        AND state.next_review_at<=NOW()
      ORDER BY state.next_review_at LIMIT 50`,
    [companyId,userId,projectIds],
  )
  return rows
}

export async function countViewerPendingLearningReviews(
  db: Queryable,
  companyId: string,
  userId: string,
  projectIds: string[],
): Promise<number> {
  if (!projectIds.length) return 0
  const { rows } = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
        AND attempt.project_id=evaluation.project_id
       JOIN project_memberships member ON member.project_id=attempt.project_id
         AND member.company_id=evaluation.company_id AND member.user_id=$2
        AND member.status='ACTIVE' AND member.role IN ('OWNER','TEACHER')
      WHERE evaluation.company_id=$1 AND evaluation.project_id=ANY($3::text[])
        AND evaluation.status='PENDING'`,
    [companyId,userId,projectIds],
  )
  return Number(rows[0]?.count ?? 0)
}

export async function listViewerLearningStates(
  db: Queryable,
  companyId: string,
  userId: string,
  projectIds: string[],
) {
  if (!projectIds.length) return []
  const { rows } = await db.query(
    `SELECT state.project_id AS "projectId",state.knowledge_unit_id AS "knowledgeUnitId",
            unit.title,state.level,state.status,state.next_review_at AS "nextReviewAt",
            state.review_interval_days AS "reviewIntervalDays"
       FROM learning_states state
       JOIN learning_knowledge_units unit
         ON unit.id=state.knowledge_unit_id AND unit.company_id=state.company_id
        AND unit.project_id=state.project_id
      WHERE state.company_id=$1 AND state.user_id=$2 AND state.project_id=ANY($3::text[])
      ORDER BY state.project_id,unit.position`,
    [companyId,userId,projectIds],
  )
  return rows
}

export async function listLearningEvidenceRecords(
  db: Queryable,
  args: { companyId: string; projectId: string; learnerId: string },
) {
  const { rows } = await db.query(
    `SELECT attempt.id,attempt.activity_id,attempt.mission_step_id,attempt.assistance,attempt.status,
            evidence.data AS evidence,attempt.submitted_at AS created_at,evaluation.id AS evaluation_id,
            evaluation.demonstrated_level,evaluation.confidence,evaluation.rubric_results,
            evaluation.feedback,evaluation.status AS evaluation_status
       FROM learning_attempts attempt
       LEFT JOIN learning_evaluations evaluation
         ON evaluation.attempt_id=attempt.id AND evaluation.company_id=attempt.company_id
        AND evaluation.project_id=attempt.project_id
       JOIN evidence_records evidence
         ON evidence.id=attempt.evidence_id AND evidence.company_id=attempt.company_id
        AND evidence.project_id=attempt.project_id
      WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.learner_id=$3
      ORDER BY attempt.submitted_at DESC LIMIT 200`,
    [args.companyId,args.projectId,args.learnerId],
  )
  return rows
}

export async function listPendingLearningEvaluationRecords(
  db: Queryable,
  companyId: string,
  projectId: string,
) {
  const { rows } = await db.query(
    `SELECT evaluation.id,evaluation.attempt_id,evaluation.demonstrated_level,evaluation.confidence,
            evaluation.rubric_results,evaluation.feedback,evaluation.created_at,
            evaluation.source_evidence_id,evaluation.verifier_evidence_id,
            source.author_agent_id AS builder_agent_id,verifier.author_agent_id AS verifier_agent_id,
            verifier.verdict AS verifier_verdict,attempt.learner_id,attempt.activity_id,
            attempt.assistance,evidence.data AS evidence,activity.title AS activity_title
       FROM learning_evaluations evaluation
       JOIN learning_attempts attempt
         ON attempt.id=evaluation.attempt_id AND attempt.company_id=evaluation.company_id
        AND attempt.project_id=evaluation.project_id
       JOIN evidence_records evidence
         ON evidence.id=attempt.evidence_id AND evidence.company_id=attempt.company_id
        AND evidence.project_id=attempt.project_id
       LEFT JOIN learning_activities activity ON activity.id=attempt.activity_id
         AND activity.company_id=attempt.company_id AND activity.project_id=attempt.project_id
       LEFT JOIN canvas_assignment_reports source ON source.evidence_id=evaluation.source_evidence_id
         AND source.company_id=attempt.company_id
       LEFT JOIN canvas_assignment_reports verifier ON verifier.evidence_id=evaluation.verifier_evidence_id
         AND verifier.company_id=attempt.company_id
      WHERE evaluation.company_id=$1 AND evaluation.project_id=$2 AND evaluation.status='PENDING'
      ORDER BY evaluation.created_at ASC`,
    [companyId,projectId],
  )
  return rows
}

export async function listLearningProjectProgress(db: Queryable, companyId: string, projectId: string) {
  const { rows } = await db.query(
    `SELECT member.user_id,user_account.display_name,user_account.email,
            COALESCE(state_summary.average_level,0)::float AS average_level,
            COALESCE(state_summary.verified_units,0)::int AS verified_knowledge_units,
            COALESCE(state_summary.due_units,0)::int AS due_knowledge_units,
            COALESCE(attempt_summary.attempts,0)::int AS attempts
       FROM project_memberships member
       JOIN users user_account ON user_account.id=member.user_id
       LEFT JOIN LATERAL (
         SELECT AVG(state.level) AS average_level,
                COUNT(*) FILTER(WHERE state.level>=3) AS verified_units,
                COUNT(*) FILTER(WHERE state.next_review_at<=NOW()) AS due_units
           FROM learning_states state
          WHERE state.company_id=member.company_id AND state.project_id=member.project_id
            AND state.user_id=member.user_id
       ) state_summary ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS attempts FROM learning_attempts attempt
          WHERE attempt.company_id=member.company_id AND attempt.project_id=member.project_id
            AND attempt.learner_id=member.user_id
       ) attempt_summary ON TRUE
      WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
        AND member.role IN ('STUDENT','OBSERVER')
      ORDER BY user_account.display_name`,
    [companyId,projectId],
  )
  return rows
}


export async function studyRoomState(db: Queryable, companyId: string, courseId: string) {
  const { rows } = await db.query<{
    room_id: string | null; company_id: string; title: string; topic: string | null; leader_id: string | null
  }>(
    `SELECT course.study_room_conversation_id AS room_id,course.company_id,
            conversation.title,conversation.topic,conversation.leader_id
       FROM courses course
       LEFT JOIN conversations conversation
         ON conversation.id=course.study_room_conversation_id AND conversation.company_id=course.company_id
      WHERE course.id=$1 AND course.company_id=$2`,
    [courseId,companyId],
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

