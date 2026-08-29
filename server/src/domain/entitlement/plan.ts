export type PlanStatus = 'ACTIVE' | 'ARCHIVED'

export interface Plan {
  id: string
  code: string
  name: string
  status: PlanStatus
}

export const PERSONAL_FREE_PLAN = {
  id: 'plan-personal-free',
  code: 'PERSONAL_FREE',
  name: 'Personal Free',
  status: 'ACTIVE',
} as const satisfies Plan

