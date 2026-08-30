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

export const TEACHER_FREE_PLAN = {
  id: 'plan-teacher-free',
  code: 'TEACHER_FREE',
  name: 'Teacher Free',
  status: 'ACTIVE',
} as const satisfies Plan

export const TEACHER_PRO_PLAN = {
  id: 'plan-teacher-pro',
  code: 'TEACHER_PRO',
  name: 'Teacher Pro',
  status: 'ACTIVE',
} as const satisfies Plan

