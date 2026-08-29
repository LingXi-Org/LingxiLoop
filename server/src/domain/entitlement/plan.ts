export type PlanStatus = 'ACTIVE' | 'ARCHIVED'

export interface Plan {
  id: string
  code: string
  name: string
  status: PlanStatus
}

export const FOUNDATION_PLAN = {
  id: 'plan-foundation',
  code: 'FOUNDATION',
  name: 'Foundation',
  status: 'ACTIVE',
} as const satisfies Plan

