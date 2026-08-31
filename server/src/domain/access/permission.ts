import type { ProjectKind, ProjectStatus } from '../project/project.js'
import type { CompanyStatus, CompanyType } from '../tenancy/company.js'
import type { CompanyRole, MembershipStatus, ProjectRole } from './role.js'

export const PERMISSION_ACTIONS = [
  'company:list',
  'company:read',
  'company:update',
  'company:activate',
  'company:request_user_deletion',
  'company:enter_grace_period',
  'company:enter_read_only',
  'company:offboard',
  'company:enter_retention',
  'company:archive',
  'company:delete',
  'company_member:list',
  'company_member:update',
  'company_member:remove',
  'company_invitation:list',
  'company_invitation:create',
  'company_invitation:revoke',
  'project:list',
  'project:read',
  'project:create_personal_learning',
  'project:update',
  'project:activate',
  'project:end',
  'project:enter_read_only',
  'project:request_transfer',
  'project:cancel_transfer',
  'project:enter_retention',
  'project:archive',
  'project:delete',
  'course:create',
  'course:read',
  'course:update',
  'project_member:list',
  'project_member:add',
  'project_member:update',
  'project_member:remove',
  'project_invitation:list',
  'project_invitation:create',
  'project_invitation:revoke',
  'learning:read',
  'learning:manage',
  'learning:submit',
  'learning:review',
  'learning:preference',
  'knowledge:read',
  'knowledge:write',
  'knowledge:manage',
  'conversation:read',
  'conversation:write',
  'conversation:manage',
  'document:read',
  'document:write',
  'document:delete',
  'calendar:read',
  'calendar:write',
  'canvas:read',
  'canvas:write',
  'poll:read',
  'poll:create',
  'poll:vote',
  'poll:close',
  'email:read',
  'email:write',
  'attachment:write',
  'agent:read',
  'agent:manage',
  'agent_autonomy:read',
  'agent_autonomy:write',
  'agent_memory:read',
  'agent_memory:write',
  'agent_memory:read_company',
  'agent_memory:write_company',
  'agent_approval:list',
  'agent_approval:resolve',
  'agent_run:control',
  'trust:read_l2',
  'trust:read_l3_company',
  'trust:read_l3_project',
] as const

export type PermissionAction = typeof PERMISSION_ACTIONS[number]

export const ENTITLEMENT_CODES = [
  'project.core',
  'project.members.manage',
  'learning.core',
  'knowledge.core',
  'conversation.core',
  'agent.core',
  'teacher.project_limit',
  'teacher.student_limit',
  'teacher.expensive_compute',
  'teacher.compute_tier',
] as const

export type EntitlementCode = typeof ENTITLEMENT_CODES[number]

export type PermissionResource =
  | { type: 'company'; id: string }
  | { type: 'project'; id: string }
  | { type: 'course'; id: string }
  | { type: 'conversation'; id: string }
  | { type: 'message'; id: string }
  | { type: 'poll'; id: string }
  | { type: 'knowledge_source'; id: string }
  | { type: 'document'; id: string }
  | { type: 'calendar_event'; id: string }
  | { type: 'canvas'; id: string }
  | { type: 'canvas_frame'; id: string }
  | { type: 'agent'; id: string }
  | { type: 'approval'; id: string }
  | { type: 'routine'; id: string }

export interface PermissionRequest {
  actorUserId: string
  action: PermissionAction
  companyId?: string
  projectId?: string
  resource?: PermissionResource
}

export type PermissionReason =
  | 'ALLOWED'
  | 'NOT_AUTHENTICATED'
  | 'ACTOR_INACTIVE'
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_INACTIVE'
  | 'COMPANY_STATE_DENIED'
  | 'PROJECT_NOT_FOUND'
  | 'COMPANY_MEMBERSHIP_REQUIRED'
  | 'COMPANY_MEMBERSHIP_INACTIVE'
  | 'ORGANIZATION_SEAT_REQUIRED'
  | 'PROJECT_MEMBERSHIP_REQUIRED'
  | 'PROJECT_MEMBERSHIP_INACTIVE'
  | 'PLAN_NOT_FOUND'
  | 'PLAN_INACTIVE'
  | 'ROLE_NOT_ALLOWED'
  | 'ENTITLEMENT_MISSING'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_SCOPE_MISMATCH'
  | 'RESOURCE_MEMBERSHIP_REQUIRED'
  | 'RESOURCE_STATE_DENIED'
  | 'PROJECT_STATE_DENIED'
  | 'DENY_BY_DEFAULT'

export interface ResolvedEntitlements {
  has(code: EntitlementCode): boolean
  boolean(code: EntitlementCode): boolean | null
  number(code: EntitlementCode): number | null
  string(code: EntitlementCode): string | null
}

export type ResourceAccessMode =
  | 'MANAGER_ONLY'
  | 'READ_WRITE'
  | 'CLOSE_OUT'
  | 'READ_ONLY'
  | 'TRANSFER_PENDING'
  | 'RETENTION'
  | 'DENY'

export interface ResolvedAccessContext {
  actorUserId: string
  company: {
    id: string
    type: CompanyType
    status: CompanyStatus
  }
  companyMembership: {
    role: CompanyRole
    status: MembershipStatus
  }
  project?: {
    id: string
    kind: ProjectKind
    status: ProjectStatus
  }
  projectMembership?: {
    role: ProjectRole
    status: MembershipStatus
  }
  effectivePlan: {
    id: string
    code: string
  }
  entitlements: ResolvedEntitlements
}

export interface PermissionDecision {
  allowed: boolean
  reason: PermissionReason
  context: ResolvedAccessContext | null
}

/** The sole product-plane authorization contract used by HTTP, Agent OS, and jobs. */
export interface PermissionService {
  can(request: PermissionRequest): Promise<PermissionDecision>
  assertCan(request: PermissionRequest): Promise<ResolvedAccessContext>
}
