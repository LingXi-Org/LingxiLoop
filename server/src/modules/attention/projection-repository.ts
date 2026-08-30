import type { Queryable } from '../../db/queryable.js'
import type { AttentionReason, AttentionSourceEvent } from './contracts.js'

export async function listUnprojectedAttentionEvents(
  db: Queryable,
  limit = 200,
): Promise<AttentionSourceEvent[]> {
  const { rows } = await db.query<AttentionSourceEvent>(
    `SELECT event.sequence,event.company_id,event.project_id,event.event_type,event.actor_id,event.payload,
            learning_case.id AS case_id,learning_case.user_id AS learner_user_id,
            learning_case.knowledge_unit_id
       FROM domain_events event
       JOIN learning_cases learning_case
         ON learning_case.company_id=event.company_id AND learning_case.project_id=event.project_id
        AND learning_case.id=event.aggregate_id
      WHERE event.project_id IS NOT NULL
        AND event.event_type=ANY($1::text[])
        AND NOT EXISTS (
          SELECT 1 FROM attention_projection_events projected
           WHERE projected.company_id=event.company_id AND projected.project_id=event.project_id
             AND projected.source_event_sequence=event.sequence)
      ORDER BY event.sequence
      LIMIT $2`,
    [['LEARNING_CASE.DETECTED', 'LEARNING_CASE.ACTION_APPLIED'], limit],
  )
  return rows
}

export async function upsertOpenAttentionItem(db: Queryable, args: {
  id: string
  event: AttentionSourceEvent
  teacherUserId: string
  reason: AttentionReason
  ruleVersion: string
  rankScore: number
  expectedMinutes: number
}): Promise<void> {
  await db.query(
    `INSERT INTO attention_items
       (id,company_id,project_id,teacher_user_id,case_id,learner_user_id,knowledge_unit_id,
        reason,source_event_sequence,rule_version,rank_score,expected_minutes)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT(company_id,project_id,teacher_user_id,case_id,reason)
       WHERE status IN ('OPEN','ACKNOWLEDGED','DEFERRED')
     DO UPDATE SET
       source_event_sequence=EXCLUDED.source_event_sequence,
       rule_version=EXCLUDED.rule_version,
       rank_score=EXCLUDED.rank_score,
       expected_minutes=EXCLUDED.expected_minutes,
       occurrence_count=attention_items.occurrence_count+1,
       version=attention_items.version+1,
       updated_at=NOW()`,
    [args.id, args.event.company_id, args.event.project_id, args.teacherUserId,
      args.event.case_id, args.event.learner_user_id, args.event.knowledge_unit_id,
      args.reason, args.event.sequence, args.ruleVersion, args.rankScore, args.expectedMinutes],
  )
}

export async function acknowledgeDetectedAttention(
  db: Queryable,
  event: AttentionSourceEvent,
): Promise<void> {
  if (!event.actor_id) return
  await db.query(
    `UPDATE attention_items SET
       status='ACKNOWLEDGED',deferred_until=NULL,version=version+1,updated_at=NOW()
      WHERE company_id=$1 AND project_id=$2 AND case_id=$3 AND teacher_user_id=$4
        AND reason='CASE_DETECTED' AND status IN ('OPEN','DEFERRED')`,
    [event.company_id, event.project_id, event.case_id, event.actor_id],
  )
}

export async function resolveCaseAttention(db: Queryable, event: AttentionSourceEvent): Promise<void> {
  await db.query(
    `UPDATE attention_items SET
       status='RESOLVED',deferred_until=NULL,resolution_reason='CASE_RESOLVED',
       resolved_at=NOW(),version=version+1,updated_at=NOW()
      WHERE company_id=$1 AND project_id=$2 AND case_id=$3
        AND status IN ('OPEN','ACKNOWLEDGED','DEFERRED')`,
    [event.company_id, event.project_id, event.case_id],
  )
}

export async function markAttentionEventProjected(db: Queryable, event: AttentionSourceEvent): Promise<void> {
  await db.query(
    `INSERT INTO attention_projection_events(company_id,project_id,source_event_sequence)
     VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
    [event.company_id, event.project_id, event.sequence],
  )
}
