import type { Queryable } from '../../db/queryable.js'
import type { SubscriptionStatus } from '../../domain/subscription/public.js'

export interface SubscriptionRecord {
  id: string; companyId: string; ownerUserId: string; planId: string; status: SubscriptionStatus; version: number
}

interface SubscriptionRow {
  id: string; company_id: string; subscriber_user_id: string; plan_id: string; status: SubscriptionStatus; version: string
}

function record(row: SubscriptionRow): SubscriptionRecord {
  return { id: row.id, companyId: row.company_id, ownerUserId: row.subscriber_user_id, planId: row.plan_id, status: row.status, version: Number(row.version) }
}

export async function assertPersonalOwner(db: Queryable, companyId: string, userId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT 1 FROM companies WHERE id=$1 AND type='PERSONAL' AND personal_owner_user_id=$2 AND status='ACTIVE' FOR UPDATE`,
    [companyId, userId],
  )
  if (!rows[0]) throw new Error('active Personal Company owner required')
}

export async function insertPendingSubscription(db: Queryable, input: {
  id: string; companyId: string; ownerUserId: string; planId: string
}): Promise<SubscriptionRecord> {
  const { rows } = await db.query<SubscriptionRow>(
    `INSERT INTO subscriptions(id,company_id,subscriber_user_id,plan_id,status)
     VALUES ($1,$2,$3,$4,'PENDING') ON CONFLICT (id) DO NOTHING
     RETURNING id,company_id,subscriber_user_id,plan_id,status,version`,
    [input.id, input.companyId, input.ownerUserId, input.planId],
  )
  const row = rows[0] ?? (await db.query<SubscriptionRow>(
    `SELECT id,company_id,subscriber_user_id,plan_id,status,version FROM subscriptions WHERE id=$1 FOR UPDATE`, [input.id],
  )).rows[0]
  if (!row || row.company_id !== input.companyId || row.subscriber_user_id !== input.ownerUserId || row.plan_id !== input.planId) {
    throw new Error('subscription identity was reused with different input')
  }
  return record(row)
}

export async function lockSubscription(db: Queryable, companyId: string, id: string): Promise<SubscriptionRecord> {
  const { rows } = await db.query<SubscriptionRow>(
    `SELECT id,company_id,subscriber_user_id,plan_id,status,version FROM subscriptions WHERE company_id=$1 AND id=$2 FOR UPDATE`,
    [companyId, id],
  )
  if (!rows[0]) throw new Error('subscription not found')
  return record(rows[0])
}

export async function updateSubscription(db: Queryable, input: {
  subscription: SubscriptionRecord; status: SubscriptionStatus; now: string
}): Promise<SubscriptionRecord> {
  if (input.status === input.subscription.status) return input.subscription
  const { rows } = await db.query<SubscriptionRow>(
    `UPDATE subscriptions SET status=$3,version=version+1,updated_at=$4,
       cancelled_at=CASE WHEN $3='CANCELLED' THEN $4::timestamptz ELSE NULL END
     WHERE company_id=$1 AND id=$2 AND version=$5
     RETURNING id,company_id,subscriber_user_id,plan_id,status,version`,
    [input.subscription.companyId, input.subscription.id, input.status, input.now, input.subscription.version],
  )
  if (!rows[0]) throw new Error('subscription changed concurrently')
  return record(rows[0])
}

export async function insertUsage(db: Queryable, input: {
  id: string; companyId: string; subscriptionId: string; metricCode: string; quantity: number; idempotencyKey: string; metadata: Record<string, unknown>; occurredAt: string
}): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO subscription_usage_ledger(id,company_id,subscription_id,metric_code,quantity,idempotency_key,metadata,occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) ON CONFLICT (company_id,idempotency_key) DO NOTHING`,
    [input.id, input.companyId, input.subscriptionId, input.metricCode, input.quantity, input.idempotencyKey, JSON.stringify(input.metadata), input.occurredAt],
  )
  return result.rowCount === 1
}
