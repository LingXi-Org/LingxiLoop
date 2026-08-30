export const EDUCATION_CONTRACT_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRED', 'TERMINATED'] as const
export type EducationContractStatus = typeof EDUCATION_CONTRACT_STATUSES[number]

export const ORGANIZATION_SEAT_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const
export type OrganizationSeatStatus = typeof ORGANIZATION_SEAT_STATUSES[number]

/** Education membership reuses canonical CompanyMembership; it never implies a Project role. */
export interface SchoolMembership {
  companyId: string
  userId: string
  status: 'ACTIVE' | 'SUSPENDED'
}
