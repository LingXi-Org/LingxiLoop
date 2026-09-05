import { randomUUID } from 'node:crypto'
import type { Queryable } from '../../db/queryable.js'

export interface CompanyOnboardingEffect {
  id: string
  companyId: string
  memberId: string
  attempts: number
  leaseToken: string
}

export async function enqueueMemberOnboardingEffect(
  db: Queryable,
  companyId: string,
  memberId: string,
): Promise<void> {
  await db.query(
    `INSERT INTO company_onboarding_effects(id,company_id,member_id)
     VALUES($1,$2,$3)
     ON CONFLICT(company_id,member_id,kind) DO NOTHING`,
    [randomUUID(), companyId, memberId],
  )
}

export async function claimCompanyOnboardingEffect(
  db: Queryable,
): Promise<CompanyOnboardingEffect | null> {
  const leaseToken = randomUUID()
  const { rows } = await db.query<{
    id: string
    company_id: string
    member_id: string
    attempts: number
  }>(
    `WITH candidate AS (
       SELECT id FROM company_onboarding_effects
        WHERE (status IN ('pending','failed') AND available_at<=NOW())
           OR (status='processing' AND lease_expires_at<NOW())
        ORDER BY available_at,created_at
        FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE company_onboarding_effects effect
        SET status='processing',attempts=effect.attempts+1,lease_token=$1,
            lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
       FROM candidate WHERE effect.id=candidate.id
     RETURNING effect.id,effect.company_id,effect.member_id,effect.attempts`,
    [leaseToken],
  )
  const row = rows[0]
  return row ? {
    id: row.id,
    companyId: row.company_id,
    memberId: row.member_id,
    attempts: row.attempts,
    leaseToken,
  } : null
}

export async function renewCompanyOnboardingEffectLease(
  db: Queryable,
  effect: CompanyOnboardingEffect,
): Promise<boolean> {
  const result = await db.query(
    `UPDATE company_onboarding_effects
        SET lease_expires_at=NOW()+INTERVAL '2 minutes',updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND member_id=$3
        AND lease_token=$4 AND status='processing'`,
    [effect.id, effect.companyId, effect.memberId, effect.leaseToken],
  )
  return (result.rowCount ?? 0) === 1
}

export async function completeCompanyOnboardingEffect(
  db: Queryable,
  effect: CompanyOnboardingEffect,
): Promise<void> {
  const result = await db.query(
    `UPDATE company_onboarding_effects
        SET status='completed',lease_token=NULL,lease_expires_at=NULL,
            completed_at=NOW(),error=NULL,updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND member_id=$3
        AND lease_token=$4 AND status='processing'`,
    [effect.id, effect.companyId, effect.memberId, effect.leaseToken],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error(`company onboarding effect lease lost: ${effect.id}`)
}

export async function failCompanyOnboardingEffect(
  db: Queryable,
  effect: CompanyOnboardingEffect,
  error: string,
): Promise<void> {
  const delaySeconds = Math.min(3600, 2 ** Math.min(effect.attempts, 10))
  const result = await db.query(
    `UPDATE company_onboarding_effects
        SET status='failed',lease_token=NULL,lease_expires_at=NULL,
            available_at=NOW()+($5::text||' seconds')::interval,
            error=$6,updated_at=NOW()
      WHERE id=$1 AND company_id=$2 AND member_id=$3
        AND lease_token=$4 AND status='processing'`,
    [effect.id, effect.companyId, effect.memberId, effect.leaseToken, delaySeconds, error.slice(0, 2000)],
  )
  if ((result.rowCount ?? 0) !== 1) throw new Error(`company onboarding effect lease lost while failing: ${effect.id}`)
}
