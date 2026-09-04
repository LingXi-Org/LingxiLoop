import { createHash, randomUUID } from 'node:crypto'
import type { DomainEventTransaction, JsonObject } from '../events/public.js'
import { commitDomainEvent } from '../events/public.js'
import { transitionSubscription, type SubscriptionCommand } from '../../domain/subscription/public.js'
import { ensurePersonalPlans, setCompanyPlan } from '../entitlements/public.js'
import { assertPersonalOwner, insertPendingSubscription, insertUsage, lockSubscription, updateSubscription } from './repository.js'

export interface SubscriptionInfrastructure { transaction: DomainEventTransaction; now: () => Date }

function subscriptionId(companyId: string, idempotencyKey: string): string {
  return `subscription-${createHash('sha256').update(`${companyId}:${idempotencyKey}`).digest('hex').slice(0, 32)}`
}

export function createPersonalSubscription(infrastructure: SubscriptionInfrastructure, input: {
  companyId: string; ownerUserId: string; idempotencyKey: string
}) {
  const id = subscriptionId(input.companyId, input.idempotencyKey)
  return commitDomainEvent(infrastructure.transaction, async (db) => {
    await assertPersonalOwner(db, input.companyId, input.ownerUserId)
    const { personalPlusPlanId } = await ensurePersonalPlans(db)
    return insertPendingSubscription(db, { id, companyId: input.companyId, ownerUserId: input.ownerUserId, planId: personalPlusPlanId })
  }, (result) => ({
    companyId: input.companyId, aggregateType: 'SUBSCRIPTION', aggregateId: result.id,
    idempotencyKey: input.idempotencyKey, actor: { type: 'USER', id: input.ownerUserId },
    event: { eventType: 'SUBSCRIPTION.CREATED', schemaVersion: 1, payload: { planCode: 'PERSONAL_PLUS' } },
  }))
}

const EVENT_BY_COMMAND: Record<SubscriptionCommand, string> = {
  ACTIVATE: 'SUBSCRIPTION.ACTIVATED', MARK_PAST_DUE: 'SUBSCRIPTION.PAST_DUE', RENEW: 'SUBSCRIPTION.RENEWED',
  CANCEL: 'SUBSCRIPTION.CANCELLED', EXPIRE: 'SUBSCRIPTION.EXPIRED',
}

export function commandPersonalSubscription(infrastructure: SubscriptionInfrastructure, input: {
  companyId: string; subscriptionId: string; actorUserId: string; command: SubscriptionCommand; idempotencyKey: string
}) {
  return commitDomainEvent(infrastructure.transaction, async (db) => {
    await assertPersonalOwner(db, input.companyId, input.actorUserId)
    const subscription = await lockSubscription(db, input.companyId, input.subscriptionId)
    const status = transitionSubscription(subscription.status, input.command)
    const plans = await ensurePersonalPlans(db)
    const planId = status === 'ACTIVE' ? plans.personalPlusPlanId
      : status === 'CANCELLED' || status === 'EXPIRED' ? plans.personalFreePlanId : null
    const now = infrastructure.now().toISOString()
    if (planId) await setCompanyPlan(db, subscription.companyId, planId, now)
    return updateSubscription(db, { subscription, status, now })
  }, (result) => ({
    companyId: input.companyId, aggregateType: 'SUBSCRIPTION', aggregateId: result.id,
    idempotencyKey: input.idempotencyKey, actor: { type: 'USER', id: input.actorUserId },
    event: { eventType: EVENT_BY_COMMAND[input.command], schemaVersion: 1, payload: {
      status: result.status,
      effectivePlanCode: result.status === 'ACTIVE' ? 'PERSONAL_PLUS'
        : result.status === 'CANCELLED' || result.status === 'EXPIRED' ? 'PERSONAL_FREE' : 'UNCHANGED',
    } },
  }))
}

export function recordSubscriptionUsage(infrastructure: SubscriptionInfrastructure, input: {
  companyId: string; subscriptionId: string; metricCode: string; quantity: number; idempotencyKey: string; metadata?: JsonObject; occurredAt: string
}) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error('usage quantity must be a positive safe integer')
  return commitDomainEvent(infrastructure.transaction, async (db) => {
    const subscription = await lockSubscription(db, input.companyId, input.subscriptionId)
    if (subscription.status !== 'ACTIVE' && subscription.status !== 'PAST_DUE') throw new Error('usage requires a live subscription')
    return insertUsage(db, { id: randomUUID(), ...input, metadata: input.metadata ?? {} })
  }, () => ({
    companyId: input.companyId, aggregateType: 'SUBSCRIPTION', aggregateId: input.subscriptionId,
    idempotencyKey: input.idempotencyKey, actor: { type: 'SYSTEM' },
    event: { eventType: 'SUBSCRIPTION.USAGE_RECORDED', schemaVersion: 1, payload: { metricCode: input.metricCode, quantity: input.quantity, occurredAt: input.occurredAt } },
  }))
}
