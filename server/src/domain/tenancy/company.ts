export type CompanyType = 'PERSONAL' | 'EDUCATION'
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED'

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

