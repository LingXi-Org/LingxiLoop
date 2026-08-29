export interface Project {
  id: string
  companyId: string
  planId: string | null
  name: string
  description: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

