export type CompanyType = 'PERSONAL' | 'EDUCATION'
export const COMPANY_STATUSES = [
  'TRIAL',
  'ACTIVE',
  'USER_DELETION_PENDING',
  'GRACE_PERIOD',
  'READ_ONLY',
  'OFFBOARDED',
  'RETENTION',
  'ARCHIVED',
  'DELETED',
] as const

export type CompanyStatus = typeof COMPANY_STATUSES[number]

export const COMPANY_LIFECYCLE_COMMANDS = [
  'ACTIVATE',
  'REQUEST_USER_DELETION',
  'ENTER_GRACE_PERIOD',
  'ENTER_READ_ONLY',
  'OFFBOARD',
  'ENTER_RETENTION',
  'ARCHIVE',
  'DELETE',
] as const

export type CompanyLifecycleCommand = typeof COMPANY_LIFECYCLE_COMMANDS[number]

type CompanyTransition =
  | { outcome: 'APPLIED'; from: CompanyStatus; to: CompanyStatus }
  | { outcome: 'ALREADY_APPLIED'; from: CompanyStatus; to: CompanyStatus }
  | { outcome: 'INVALID'; from: CompanyStatus; to: null }

const COMPANY_STATUSES_BY_TYPE = {
  PERSONAL: ['ACTIVE', 'USER_DELETION_PENDING', 'DELETED'],
  EDUCATION: ['TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'READ_ONLY', 'OFFBOARDED', 'RETENTION', 'ARCHIVED', 'DELETED'],
} as const satisfies Record<CompanyType, readonly CompanyStatus[]>

export function companyStatusBelongsToType(type: CompanyType, status: CompanyStatus): boolean {
  return COMPANY_STATUSES_BY_TYPE[type].includes(status as never)
}

export function transitionCompany(
  type: CompanyType,
  status: CompanyStatus,
  command: CompanyLifecycleCommand,
): CompanyTransition {
  const target = companyTransitionTarget(type, status, command)
  if (!target) return { outcome: 'INVALID', from: status, to: null }
  return { outcome: target === status ? 'ALREADY_APPLIED' : 'APPLIED', from: status, to: target }
}

function companyTransitionTarget(
  type: CompanyType,
  status: CompanyStatus,
  command: CompanyLifecycleCommand,
): CompanyStatus | null {
  if (!companyStatusBelongsToType(type, status)) return null
  switch (command) {
    case 'ACTIVATE':
      if (type === 'PERSONAL') return status === 'ACTIVE' ? status : null
      return status === 'TRIAL' ? 'ACTIVE' : status === 'ACTIVE' ? status : null
    case 'REQUEST_USER_DELETION':
      if (type !== 'PERSONAL') return null
      return status === 'ACTIVE' ? 'USER_DELETION_PENDING' : status === 'USER_DELETION_PENDING' ? status : null
    case 'ENTER_GRACE_PERIOD':
      if (type !== 'EDUCATION') return null
      return status === 'TRIAL' || status === 'ACTIVE'
        ? 'GRACE_PERIOD'
        : status === 'GRACE_PERIOD' ? status : null
    case 'ENTER_READ_ONLY':
      if (type !== 'EDUCATION') return null
      return status === 'GRACE_PERIOD' ? 'READ_ONLY' : status === 'READ_ONLY' ? status : null
    case 'OFFBOARD':
      if (type !== 'EDUCATION') return null
      return status === 'READ_ONLY' ? 'OFFBOARDED' : status === 'OFFBOARDED' ? status : null
    case 'ENTER_RETENTION':
      if (type !== 'EDUCATION') return null
      return status === 'OFFBOARDED' ? 'RETENTION' : status === 'RETENTION' ? status : null
    case 'ARCHIVE':
      if (type !== 'EDUCATION') return null
      return status === 'RETENTION' ? 'ARCHIVED' : status === 'ARCHIVED' ? status : null
    case 'DELETE':
      if (status === 'DELETED') return status
      if (type === 'PERSONAL') return status === 'USER_DELETION_PENDING' ? 'DELETED' : null
      return status === 'RETENTION' || status === 'ARCHIVED' ? 'DELETED' : null
  }
}

export interface Company {
  id: string
  name: string
  slug: string
  type: CompanyType
  status: CompanyStatus
  personalOwnerUserId: string | null
  description: string
  planId: string
  createdAt: string
  updatedAt: string
}

