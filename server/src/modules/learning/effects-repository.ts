import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'

export const LEARNING_EFFECT_KINDS = [
  'study_room.sync',
  'teacher_room.sync',
  'teacher_agent.welcome',
  'notebook.ensure',
  'course_create.audit',
] as const

export type LearningEffectKind = typeof LEARNING_EFFECT_KINDS[number]

export interface LearningEffect {
  id: string
  companyId: string
  courseId: string
  kind: LearningEffectKind
  payload: Record<string, unknown>
  attempts: number
  leaseToken: string
}

export async function enqueueLearningEffect(
  db: Queryable,
  input: { companyId: string; courseId: string; kind: LearningEffectKind; payload?: Record<string, unknown> },
): Promise<void> {
  await db.query(
    `INSERT INTO learning_effects(id,company_id,course_id,kind,payload)
     VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(company_id,course_id,kind) DO NOTHING`,
    [randomUUID(), input.companyId, input.courseId, input.kind, JSON.stringify(input.payload ?? {})],
  )
}

export async function claimLearningEffects(db: Queryable, limit = 20): Promise<LearningEffect[]> {
  const leaseToken = randomUUID()
  const { rows } = await db.query<{
    id: string; company_id: string; course_id: string; kind: LearningEffectKind
    payload: Record<string, unknown>; attempts: number
  }>(
    `WITH candidates AS (
       SELECT id FROM learning_effects
        WHERE status IN ('pending','failed') AND available_at<=NOW()
          AND (lease_expires_at IS NULL OR lease_expires_at<NOW())
        ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE learning_effects effect SET status='processing',attempts=effect.attempts+1,
       lease_token=$2,lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
      FROM candidates WHERE effect.id=candidates.id
     RETURNING effect.id,effect.company_id,effect.course_id,effect.kind,effect.payload,effect.attempts`,
    [limit, leaseToken],
  )
  return rows.map((row) => ({
    id: row.id, companyId: row.company_id, courseId: row.course_id, kind: row.kind,
    payload: row.payload, attempts: row.attempts, leaseToken,
  }))
}

export async function completeLearningEffect(db: Queryable, effect: LearningEffect): Promise<void> {
  await db.query(
    `UPDATE learning_effects SET status='completed',lease_token=NULL,lease_expires_at=NULL,
       completed_at=NOW(),updated_at=NOW(),error=NULL WHERE id=$1 AND lease_token=$2`,
    [effect.id, effect.leaseToken],
  )
}

export async function failLearningEffect(db: Queryable, effect: LearningEffect, error: string): Promise<void> {
  const delaySeconds = Math.min(3600, 2 ** Math.min(effect.attempts, 10))
  await db.query(
    `UPDATE learning_effects SET status='failed',lease_token=NULL,lease_expires_at=NULL,
       available_at=NOW()+($3::text||' seconds')::interval,error=$4,updated_at=NOW()
     WHERE id=$1 AND lease_token=$2`,
    [effect.id, effect.leaseToken, delaySeconds, error.slice(0, 2000)],
  )
}
