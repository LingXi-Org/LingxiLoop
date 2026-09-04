import type { MembershipStatus, ProjectRole } from '../access/public.js'

export interface ProjectMembership {
  id: string
  companyId: string
  projectId: string
  userId: string
  role: ProjectRole
  status: MembershipStatus
  createdAt: string
  updatedAt: string
}

