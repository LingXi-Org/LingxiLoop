import type { Queryable } from '../../db/queryable.js'

export interface LearningGrowthWaypoint {
  position: number
  evidenceCount: number
  objectiveCount: number
}

export interface LearningGrowthLearner {
  learnerId: string
  displayName: string
  avatarUrl: string | null
  points: number
  evidenceCount: number
  acceptedCount: number
  independentCount: number
  masteryPoints: number
  waypoints: LearningGrowthWaypoint[]
}

/** Public course progress contains identities and aggregate credits, never learner work. */
export async function loadLearningGrowthRows(
  db: Queryable,
  args: { companyId: string; projectId: string; cursor?: string; limit: number },
): Promise<LearningGrowthLearner[]> {
  const { rows } = await db.query<LearningGrowthLearner>(
    `WITH learners AS MATERIALIZED (
       SELECT member.user_id,user_account.display_name,user_account.avatar_url
         FROM project_memberships member
         JOIN projects project ON project.id=member.project_id AND project.company_id=member.company_id
         JOIN company_memberships company_member ON company_member.company_id=member.company_id
          AND company_member.user_id=member.user_id AND company_member.status='ACTIVE'
          AND company_member.ended_at IS NULL AND member.company_period_id=company_member.period_id
         JOIN users user_account ON user_account.id=member.user_id
          AND user_account.deleted_at IS NULL AND user_account.suspended_at IS NULL AND user_account.departed_at IS NULL
        WHERE member.company_id=$1 AND member.project_id=$2 AND member.status='ACTIVE'
          AND member.role='STUDENT'
          AND ($3::text IS NULL OR member.user_id>$3)
        ORDER BY member.user_id LIMIT $4
     ), evidence_credit AS (
       SELECT attempt.learner_id,
              COALESCE('activity:'||attempt.activity_id,'step:'||attempt.mission_step_id) AS source,
              MIN(attempt.submitted_at) AS occurred_at,
              1+COALESCE(MAX(CASE WHEN accepted.id IS NOT NULL
                THEN 2+CASE attempt.assistance WHEN 'NONE' THEN 3 WHEN 'HINT' THEN 2 ELSE 1 END END),0) AS points,
              MAX(CASE WHEN accepted.id IS NOT NULL THEN 1 ELSE 0 END) AS accepted_count,
              MAX(CASE WHEN accepted.id IS NOT NULL AND attempt.assistance='NONE' THEN 1 ELSE 0 END)
                AS independent_count
         FROM learning_attempts attempt
         JOIN learners ON learners.user_id=attempt.learner_id
         JOIN evidence_records evidence ON evidence.id=attempt.evidence_id
          AND evidence.company_id=attempt.company_id AND evidence.project_id=attempt.project_id
          AND evidence.subject_user_id=attempt.learner_id
         LEFT JOIN learning_evaluations accepted ON accepted.company_id=attempt.company_id
          AND accepted.project_id=attempt.project_id AND accepted.attempt_id=attempt.id
          AND accepted.status='ACCEPTED' AND accepted.demonstrated_level>0
        WHERE attempt.company_id=$1 AND attempt.project_id=$2 AND attempt.status<>'REJECTED'
        GROUP BY attempt.learner_id,COALESCE('activity:'||attempt.activity_id,'step:'||attempt.mission_step_id)
     ), credits AS (
       SELECT learner_id,source,occurred_at,points,1 AS evidence_count,0 AS objective_count,
              accepted_count,independent_count,0 AS mastery_points
         FROM evidence_credit
       UNION ALL
       SELECT state.user_id,'objective:'||state.knowledge_unit_id,state.last_evidence_at,
              state.level*state.level,0,1,0,0,state.level*state.level
         FROM learning_states state JOIN learners ON learners.user_id=state.user_id
        WHERE state.company_id=$1 AND state.project_id=$2
          AND state.last_evidence_at IS NOT NULL AND state.level>0
     ), positions AS (
       SELECT *,SUM(points) OVER journey AS position,
              NTILE(64) OVER (PARTITION BY learner_id ORDER BY occurred_at,source) AS bucket
         FROM credits
       WINDOW journey AS (PARTITION BY learner_id ORDER BY occurred_at,source ROWS UNBOUNDED PRECEDING)
     ), grouped_waypoints AS (
       SELECT learner_id,bucket,MAX(position) AS position,
              SUM(evidence_count) AS evidence_count,SUM(objective_count) AS objective_count
         FROM positions GROUP BY learner_id,bucket
     ), waypoints AS (
       SELECT learner_id,jsonb_agg(jsonb_build_object(
                'position',position,'evidenceCount',evidence_count,'objectiveCount',objective_count
              ) ORDER BY bucket) AS items
         FROM grouped_waypoints GROUP BY learner_id
     ), totals AS (
       SELECT learner_id,SUM(points)::float8 AS points,SUM(evidence_count)::int AS evidence_count,
              SUM(accepted_count)::int AS accepted_count,SUM(independent_count)::int AS independent_count,
              SUM(mastery_points)::float8 AS mastery_points
         FROM credits GROUP BY learner_id
     )
     SELECT learners.user_id AS "learnerId",learners.display_name AS "displayName",
            learners.avatar_url AS "avatarUrl",COALESCE(totals.points,0) AS points,
            COALESCE(totals.evidence_count,0) AS "evidenceCount",
            COALESCE(totals.accepted_count,0) AS "acceptedCount",
            COALESCE(totals.independent_count,0) AS "independentCount",
            COALESCE(totals.mastery_points,0) AS "masteryPoints",
            COALESCE(waypoints.items,'[]'::jsonb) AS waypoints
       FROM learners LEFT JOIN totals ON totals.learner_id=learners.user_id
       LEFT JOIN waypoints ON waypoints.learner_id=learners.user_id
      ORDER BY learners.user_id`,
    [args.companyId,args.projectId,args.cursor ?? null,args.limit],
  )
  return rows
}
