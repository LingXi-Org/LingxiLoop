export type EntitlementValue = boolean | number | string

export interface PlanEntitlement {
  planId: string
  entitlementId: string
  value: EntitlementValue
}

