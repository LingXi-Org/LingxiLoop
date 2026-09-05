import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { transitionSubscription } from '../domain/subscription/public.js'
import { setCompanyPlan } from '../modules/entitlements/public.js'
import { insertUsage, updateSubscription } from '../modules/subscriptions/repository.js'

test('Subscription state machine is uppercase, retry-safe, and terminal', () => {
  assert.equal(transitionSubscription('PENDING', 'ACTIVATE'), 'ACTIVE')
  assert.equal(transitionSubscription('ACTIVE', 'MARK_PAST_DUE'), 'PAST_DUE')
  assert.equal(transitionSubscription('PAST_DUE', 'RENEW'), 'ACTIVE')
  assert.equal(transitionSubscription('ACTIVE', 'CANCEL'), 'CANCELLED')
  assert.equal(transitionSubscription('CANCELLED', 'CANCEL'), 'CANCELLED')
  assert.throws(() => transitionSubscription('CANCELLED', 'ACTIVATE'), /Cannot ACTIVATE/)
})

test('Subscription persistence switches the Company Plan and appends positive usage', async () => {
  const queries: Array<{ text: string; params: readonly unknown[] }> = []
  const db: Queryable = { query: async (text, params = []) => {
    queries.push({ text, params })
    if (text.includes('UPDATE subscriptions')) return { rows: [{
      id: 'subscription-1', company_id: 'company-1', subscriber_user_id: 'user-1', plan_id: 'plan-personal-plus', status: 'ACTIVE', version: '2',
    }], rowCount: 1 } as never
    return { rows: [], rowCount: 1 } as never
  } }
  const subscription = { id: 'subscription-1', companyId: 'company-1', ownerUserId: 'user-1', planId: 'plan-personal-plus', status: 'PENDING' as const, version: 1 }
  await setCompanyPlan(db, 'company-1', 'plan-personal-plus', '2026-08-30T00:00:00.000Z')
  const updated = await updateSubscription(db, { subscription, status: 'ACTIVE', now: '2026-08-30T00:00:00.000Z' })
  assert.equal(updated.status, 'ACTIVE')
  assert.match(queries[0]!.text, /UPDATE companies SET plan_id=/)
  assert.match(queries[1]!.text, /version=version\+1/)
  assert.equal(await insertUsage(db, { id: 'usage-1', companyId: 'company-1', subscriptionId: 'subscription-1', metricCode: 'agent.turn', quantity: 1, idempotencyKey: 'usage:1', metadata: {}, occurredAt: '2026-08-30T00:00:00.000Z' }), true)
  assert.match(queries[2]!.text, /ON CONFLICT \(company_id,idempotency_key\) DO NOTHING/)
})

test('Billing remains a port with no runtime adapter or payment collection surface', async () => {
  const port = await readFile(new URL('../modules/subscriptions/billing-provider.ts', import.meta.url), 'utf8')
  const publicModule = await readFile(new URL('../modules/subscriptions/public.ts', import.meta.url), 'utf8')
  const card = await readFile(new URL('../../../src/features/subscriptions/SubscriptionUnavailableCard.tsx', import.meta.url), 'utf8')
  const application = await readFile(new URL('../modules/subscriptions/application.ts', import.meta.url), 'utf8')
  const plans = await readFile(new URL('../domain/entitlement/plan.ts', import.meta.url), 'utf8')
  assert.match(port, /export interface BillingProvider/)
  assert.doesNotMatch(publicModule, /new .*Billing|Mock|Fake/)
  assert.match(card, /暂未开放/)
  assert.match(card, /disabled>自助升级/)
  assert.match(card, /disabled>续费/)
  assert.match(card, /disabled>支付管理/)
  assert.doesNotMatch(card, /<Input|cardNumber|cvv|toastAction|agentsApi/)
  assert.match(plans, /code: 'PERSONAL_PLUS'/)
  for (const eventType of ['CREATED', 'ACTIVATED', 'PAST_DUE', 'RENEWED', 'CANCELLED', 'EXPIRED', 'USAGE_RECORDED']) {
    assert.match(application, new RegExp(`SUBSCRIPTION\\.${eventType}`))
  }
  assert.match(application, /commitDomainEvent/)
  assert.doesNotMatch(application, /(?:price|amount|seat|quota)\s*[:=]\s*\d/i)
})
