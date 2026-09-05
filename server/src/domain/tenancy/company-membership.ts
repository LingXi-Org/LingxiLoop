import type { CompanyRole, MembershipStatus } from '../access/public.js'

export interface CompanyMembership {
  id: string
  companyId: string
  userId: string
  role: CompanyRole
  status: MembershipStatus
  createdAt: string
  updatedAt: string
}

