export type MembershipStatus = 'ACTIVE' | 'SUSPENDED'

export type CompanyRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export type ProjectRole = 'OWNER' | 'TEACHER' | 'TA' | 'STUDENT' | 'OBSERVER'

export const ACTIVE_MEMBERSHIP_STATUS: MembershipStatus = 'ACTIVE'

export const COMPANY_ROLES: readonly CompanyRole[] = ['OWNER', 'ADMIN', 'MEMBER']
export const PROJECT_ROLES: readonly ProjectRole[] = ['OWNER', 'TEACHER', 'TA', 'STUDENT', 'OBSERVER']

export type CompanyRoleWire = 'owner' | 'admin' | 'member'
export type LearningRoleWire = 'teacher' | 'learner'

export function companyRoleFromWire(role: CompanyRoleWire): CompanyRole {
  return role.toUpperCase() as CompanyRole
}

export function companyRoleToWire(role: CompanyRole): CompanyRoleWire {
  return role.toLowerCase() as CompanyRoleWire
}

export function projectRoleFromLearningWire(role: LearningRoleWire): 'TEACHER' | 'STUDENT' {
  return role === 'teacher' ? 'TEACHER' : 'STUDENT'
}

export function projectRoleToLearningWire(role: ProjectRole): LearningRoleWire {
  return role === 'STUDENT' || role === 'OBSERVER' ? 'learner' : 'teacher'
}

export function isCompanyManager(role: CompanyRole): boolean {
  return role === 'OWNER' || role === 'ADMIN'
}

export function isProjectTeachingManager(role: ProjectRole): boolean {
  return role === 'OWNER' || role === 'TEACHER'
}
