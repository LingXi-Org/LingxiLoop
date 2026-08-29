import type { CompanyType } from '../tenancy/company.js'

export const PROJECT_KINDS = [
  'PERSONAL_LEARNING',
  'TEACHING',
  'INSTITUTIONAL_COURSE',
] as const

export type ProjectKind = typeof PROJECT_KINDS[number]

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
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

