import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'

export const LEARNING_EFFECT_KINDS = [
  'study_room.sync',
  'teacher_room.sync',
  'teacher_agent.welcome',
  'notebook.ensure',
  'course_metadata.sync',
  'course_archive.sync',
  'member_access.revoke',
  'member_onboarding.seed',
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
  generation: number
}

export async function enqueueLearningEffect(
  db: Queryable,
  input: {
    companyId: string
    courseId: string
    kind: LearningEffectKind
    effectKey?: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await db.query(
    `INSERT INTO learning_effects(id,company_id,course_id,kind,effect_key,payload)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT(company_id,course_id,kind,effect_key) DO UPDATE SET
       payload=CASE WHEN learning_effects.status='processing'
         THEN learning_effects.payload ELSE EXCLUDED.payload END,
       queued_payload=CASE WHEN learning_effects.status='processing'
         THEN EXCLUDED.payload ELSE NULL END,
       generation=CASE WHEN learning_effects.status='processing'
         THEN learning_effects.generation ELSE learning_effects.generation+1 END,
       queued_generation=CASE WHEN learning_effects.status='processing'
         THEN COALESCE(learning_effects.queued_generation,learning_effects.generation)+1 ELSE NULL END,
       status=CASE WHEN learning_effects.status='processing' THEN learning_effects.status ELSE 'pending' END,
       attempts=CASE WHEN learning_effects.status='processing' THEN learning_effects.attempts ELSE 0 END,
       available_at=CASE WHEN learning_effects.status='processing' THEN learning_effects.available_at ELSE NOW() END,
       lease_token=CASE WHEN learning_effects.status='processing' THEN learning_effects.lease_token ELSE NULL END,
       lease_expires_at=CASE WHEN learning_effects.status='processing' THEN learning_effects.lease_expires_at ELSE NULL END,
       error=NULL,completed_at=NULL,updated_at=NOW()`,
    [
      randomUUID(), input.companyId, input.courseId, input.kind, input.effectKey ?? 'singleton',
      JSON.stringify(input.payload ?? {}),
    ],
  )
}

export async function claimLearningEffects(db: Queryable, limit = 20): Promise<LearningEffect[]> {
  const leaseToken = randomUUID()
  const { rows } = await db.query<{
    id: string; company_id: string; course_id: string; kind: LearningEffectKind
    payload: Record<string, unknown>; attempts: number; generation: number
  }>(
    `WITH candidates AS (
       SELECT id FROM learning_effects
        WHERE (status IN ('pending','failed') AND available_at<=NOW())
           OR (status='processing' AND lease_expires_at<NOW())
        ORDER BY available_at,created_at FOR UPDATE SKIP LOCKED LIMIT $1
     )
     UPDATE learning_effects effect SET status='processing',attempts=effect.attempts+1,
       lease_token=$2,lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
      FROM candidates WHERE effect.id=candidates.id
     RETURNING effect.id,effect.company_id,effect.course_id,effect.kind,effect.payload,
       effect.attempts,effect.generation`,
    [limit, leaseToken],
  )
  return rows.map((row) => ({
    id: row.id, companyId: row.company_id, courseId: row.course_id, kind: row.kind,
    payload: row.payload, attempts: row.attempts, leaseToken, generation: row.generation,
  }))
}

export async function completeLearningEffect(db: Queryable, effect: LearningEffect): Promise<void> {
  const result = await db.query(
    `UPDATE learning_effects SET
       status=CASE WHEN queued_payload IS NULL THEN 'completed' ELSE 'pending' END,
       payload=COALESCE(queued_payload,payload),generation=COALESCE(queued_generation,generation),
       queued_payload=NULL,queued_generation=NULL,attempts=CASE WHEN queued_payload IS NULL THEN attempts ELSE 0 END,
       available_at=CASE WHEN queued_payload IS NULL THEN available_at ELSE NOW() END,
       lease_token=NULL,lease_expires_at=NULL,
       completed_at=CASE WHEN queued_payload IS NULL THEN NOW() ELSE NULL END,
       updated_at=NOW(),error=NULL
     WHERE id=$1 AND lease_token=$2 AND generation=$3`,
    [effect.id, effect.leaseToken, effect.generation],
  )
  if ((result.rowCount ?? 0) !== 1) {
    throw new Error(`learning effect lease lost before completion: ${effect.id}:${effect.generation}`)
  }
}

export async function renewLearningEffectLease(db: Queryable, effect: LearningEffect): Promise<boolean> {
  const result = await db.query(
    `UPDATE learning_effects SET lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
      WHERE id=$1 AND lease_token=$2 AND generation=$3 AND status='processing'`,
    [effect.id, effect.leaseToken, effect.generation],
  )
  return (result.rowCount ?? 0) === 1
}

export async function failLearningEffect(db: Queryable, effect: LearningEffect, error: string): Promise<void> {
  const delaySeconds = Math.min(3600, 2 ** Math.min(effect.attempts, 10))
  await db.query(
    `UPDATE learning_effects SET
       status=CASE WHEN queued_payload IS NULL THEN 'failed' ELSE 'pending' END,
       payload=COALESCE(queued_payload,payload),generation=COALESCE(queued_generation,generation),
       queued_payload=NULL,queued_generation=NULL,
       attempts=CASE WHEN queued_payload IS NULL THEN attempts ELSE 0 END,
       lease_token=NULL,lease_expires_at=NULL,
       available_at=CASE WHEN queued_payload IS NULL
         THEN NOW()+($4::text||' seconds')::interval ELSE NOW() END,
       error=CASE WHEN queued_payload IS NULL THEN $5 ELSE NULL END,updated_at=NOW()
     WHERE id=$1 AND lease_token=$2 AND generation=$3`,
    [effect.id, effect.leaseToken, effect.generation, delaySeconds, error.slice(0, 2000)],
  )
}
