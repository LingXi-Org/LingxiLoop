import type { EntitlementCode, ResolvedEntitlements } from './contracts.js'
import type { AccessRepository, PlanRecord } from './repository.js'

class BooleanEntitlements implements ResolvedEntitlements {
  constructor(private readonly enabled: ReadonlySet<string>) {}

  has(code: EntitlementCode): boolean {
    return this.enabled.has(code)
  }
}

export type EntitlementResolution =
  | { allowed: true; plan: PlanRecord; entitlements: ResolvedEntitlements }
  | { allowed: false; reason: 'PLAN_NOT_FOUND' | 'PLAN_INACTIVE' }

/** Project plans replace, rather than merge with, the Company plan. */
export async function resolveEntitlements(
  repository: AccessRepository,
  effectivePlanId: string,
): Promise<EntitlementResolution> {
  const plan = await repository.plan(effectivePlanId)
  if (!plan) return { allowed: false, reason: 'PLAN_NOT_FOUND' }
  if (plan.status !== 'ACTIVE') return { allowed: false, reason: 'PLAN_INACTIVE' }
  const records = await repository.entitlements(plan.id)
  const enabled = new Set(records.filter((record) => record.value === true).map((record) => record.code))
  return { allowed: true, plan, entitlements: new BooleanEntitlements(enabled) }
}
