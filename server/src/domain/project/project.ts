import type { CompanyType } from '../tenancy/company.js'

export const PROJECT_KINDS = [
  'PERSONAL_LEARNING',
  'TEACHING',
  'INSTITUTIONAL_COURSE',
] as const

export type ProjectKind = typeof PROJECT_KINDS[number]

export const PROJECT_STATUSES = [
  'CREATED',
  'DRAFT',
  'ACTIVE',
  'COURSE_ENDED',
  'READ_ONLY',
  'TRANSFER_PENDING',
  'RETENTION',
  'ARCHIVED',
  'DELETED',
] as const

export type ProjectStatus = typeof PROJECT_STATUSES[number]

export const PROJECT_LIFECYCLE_COMMANDS = [
  'ACTIVATE',
  'END',
  'ENTER_READ_ONLY',
  'REQUEST_TRANSFER',
  'CANCEL_TRANSFER',
  'ENTER_RETENTION',
  'ARCHIVE',
  'DELETE',
] as const

export type ProjectLifecycleCommand = typeof PROJECT_LIFECYCLE_COMMANDS[number]

export type LifecycleTransition<T> =
  | { outcome: 'APPLIED'; from: T; to: T }
  | { outcome: 'ALREADY_APPLIED'; from: T; to: T }
  | { outcome: 'INVALID'; from: T; to: null }

const PROJECT_STATUSES_BY_KIND = {
  PERSONAL_LEARNING: ['CREATED', 'ACTIVE', 'ARCHIVED', 'DELETED'],
  TEACHING: ['DRAFT', 'ACTIVE', 'COURSE_ENDED', 'READ_ONLY', 'TRANSFER_PENDING', 'ARCHIVED'],
  INSTITUTIONAL_COURSE: ['DRAFT', 'ACTIVE', 'COURSE_ENDED', 'READ_ONLY', 'RETENTION', 'ARCHIVED', 'DELETED'],
} as const satisfies Record<ProjectKind, readonly ProjectStatus[]>

export function projectStatusBelongsToKind(kind: ProjectKind, status: ProjectStatus): boolean {
  return PROJECT_STATUSES_BY_KIND[kind].includes(status as never)
}

export function transitionProject(
  kind: ProjectKind,
  status: ProjectStatus,
  command: ProjectLifecycleCommand,
): LifecycleTransition<ProjectStatus> {
  const target = projectTransitionTarget(kind, status, command)
  if (!target) return { outcome: 'INVALID', from: status, to: null }
  return { outcome: target === status ? 'ALREADY_APPLIED' : 'APPLIED', from: status, to: target }
}

function projectTransitionTarget(
  kind: ProjectKind,
  status: ProjectStatus,
  command: ProjectLifecycleCommand,
): ProjectStatus | null {
  if (!projectStatusBelongsToKind(kind, status)) return null
  switch (command) {
    case 'ACTIVATE':
      return status === 'CREATED' || status === 'DRAFT' ? 'ACTIVE' : status === 'ACTIVE' ? status : null
    case 'END':
      if (kind === 'PERSONAL_LEARNING') return null
      return status === 'ACTIVE' ? 'COURSE_ENDED' : status === 'COURSE_ENDED' ? status : null
    case 'ENTER_READ_ONLY':
      if (kind === 'PERSONAL_LEARNING') return null
      return status === 'COURSE_ENDED' ? 'READ_ONLY' : status === 'READ_ONLY' ? status : null
    case 'REQUEST_TRANSFER':
      if (kind !== 'TEACHING') return null
      return status === 'ACTIVE' ? 'TRANSFER_PENDING' : status === 'TRANSFER_PENDING' ? status : null
    case 'CANCEL_TRANSFER':
      if (kind !== 'TEACHING') return null
      return status === 'TRANSFER_PENDING' ? 'ACTIVE' : status === 'ACTIVE' ? status : null
    case 'ENTER_RETENTION':
      if (kind !== 'INSTITUTIONAL_COURSE') return null
      return status === 'READ_ONLY' ? 'RETENTION' : status === 'RETENTION' ? status : null
    case 'ARCHIVE':
      if (status === 'ARCHIVED') return status
      if (kind === 'PERSONAL_LEARNING') return status === 'ACTIVE' ? 'ARCHIVED' : null
      if (kind === 'TEACHING') return status === 'READ_ONLY' ? 'ARCHIVED' : null
      return status === 'RETENTION' ? 'ARCHIVED' : null
    case 'DELETE':
      if (status === 'DELETED') return status
      if (kind === 'PERSONAL_LEARNING') return status === 'ARCHIVED' ? 'DELETED' : null
      if (kind === 'INSTITUTIONAL_COURSE') {
        return status === 'RETENTION' || status === 'ARCHIVED' ? 'DELETED' : null
      }
      return null
  }
}

export function projectKindBelongsToCompanyType(kind: ProjectKind, companyType: CompanyType): boolean {
  switch (kind) {
    case 'PERSONAL_LEARNING':
    case 'TEACHING':
      return companyType === 'PERSONAL'
    case 'INSTITUTIONAL_COURSE':
      return companyType === 'EDUCATION'
  }
}

export interface Project {
  id: string
  companyId: string
  kind: ProjectKind
  planId: string | null
  isDefault: boolean
  name: string
  description: string
  status: ProjectStatus
  createdAt: string
  updatedAt: string
}

