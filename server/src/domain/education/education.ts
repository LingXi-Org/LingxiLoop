export const EDUCATION_CONTRACT_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRED', 'TERMINATED'] as const
export type EducationContractStatus = typeof EDUCATION_CONTRACT_STATUSES[number]

export type EducationContractCommand = 'EXPIRE'

export type EducationContractTransition =
  | { outcome: 'APPLIED'; from: EducationContractStatus; to: EducationContractStatus }
  | { outcome: 'ALREADY_APPLIED'; from: EducationContractStatus; to: EducationContractStatus }
  | { outcome: 'INVALID'; from: EducationContractStatus; to: null }

export function transitionEducationContract(
  status: EducationContractStatus,
  command: EducationContractCommand,
): EducationContractTransition {
  switch (command) {
    case 'EXPIRE':
      if (status === 'TRIAL' || status === 'ACTIVE') return { outcome: 'APPLIED', from: status, to: 'EXPIRED' }
      if (status === 'EXPIRED') return { outcome: 'ALREADY_APPLIED', from: status, to: status }
      return { outcome: 'INVALID', from: status, to: null }
  }
}

export const ORGANIZATION_SEAT_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const
export type OrganizationSeatStatus = typeof ORGANIZATION_SEAT_STATUSES[number]

/** Education membership reuses canonical CompanyMembership; it never implies a Project role. */
export interface SchoolMembership {
  companyId: string
  userId: string
  status: 'ACTIVE' | 'SUSPENDED'
}
