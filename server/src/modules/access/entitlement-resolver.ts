import type { EntitlementCode, ResolvedEntitlements } from './contracts.js'
import type { AccessRepository, PlanRecord } from './repository.js'

class TypedEntitlements implements ResolvedEntitlements {
  constructor(private readonly values: ReadonlyMap<EntitlementCode, boolean | number | string>) {}

  has(code: EntitlementCode): boolean {
    return this.boolean(code) === true
  }

  boolean(code: EntitlementCode): boolean | null {
    const value = this.values.get(code)
    return typeof value === 'boolean' ? value : null
  }

  number(code: EntitlementCode): number | null {
    const value = this.values.get(code)
    return typeof value === 'number' ? value : null
  }

  string(code: EntitlementCode): string | null {
    const value = this.values.get(code)
    return typeof value === 'string' ? value : null
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
  const values = new Map(records.map((record) => [record.code, record.value]))
  return { allowed: true, plan, entitlements: new TypedEntitlements(values) }
}
