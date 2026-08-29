import type { CompanyRole, ProjectRole } from '../../domain/public.js'
import type {
  EntitlementCode,
  PermissionAction,
  PermissionReason,
  PermissionRequest,
  ResolvedAccessContext,
} from './contracts.js'
import type { ResourceRecord } from './repository.js'

type PermissionScope = 'company' | 'project'
type ResourceRule = 'none' | 'member' | 'creator_or_manager' | 'leader_or_manager'

export interface PermissionPolicy {
  scope: PermissionScope
  entitlement?: EntitlementCode
  companyRoles?: readonly CompanyRole[]
  projectRoles?: readonly ProjectRole[]
  resource: ResourceRule
}

const ALL_COMPANY_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const satisfies readonly CompanyRole[]
const COMPANY_MANAGERS = ['OWNER', 'ADMIN'] as const satisfies readonly CompanyRole[]
const ALL_PROJECT_ROLES = ['OWNER', 'TEACHER', 'TA', 'STUDENT', 'OBSERVER'] as const satisfies readonly ProjectRole[]
const PROJECT_WRITERS = ['OWNER', 'TEACHER', 'TA', 'STUDENT'] as const satisfies readonly ProjectRole[]
const PROJECT_MANAGERS = ['OWNER', 'TEACHER'] as const satisfies readonly ProjectRole[]
const PROJECT_LISTERS = ['OWNER', 'TEACHER', 'TA'] as const satisfies readonly ProjectRole[]
const LEARNERS = ['STUDENT'] as const satisfies readonly ProjectRole[]

const projectRead = (entitlement: EntitlementCode, resource: ResourceRule = 'none'): PermissionPolicy => ({
  scope: 'project', entitlement, projectRoles: ALL_PROJECT_ROLES, resource,
})
const projectWrite = (entitlement: EntitlementCode, resource: ResourceRule = 'none'): PermissionPolicy => ({
  scope: 'project', entitlement, projectRoles: PROJECT_WRITERS, resource,
})
const projectManage = (entitlement: EntitlementCode, resource: ResourceRule = 'none'): PermissionPolicy => ({
  scope: 'project', entitlement, projectRoles: PROJECT_MANAGERS, resource,
})

export const PERMISSION_POLICIES = {
  'company:list': { scope: 'company', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'company:read': { scope: 'company', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'company:update': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company_member:list': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company_member:update': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company_member:remove': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company_invitation:list': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company_invitation:create': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company_invitation:revoke': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'project:list': { scope: 'company', entitlement: 'project.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'project:read': projectRead('project.core'),
  'project:create_personal_learning': {
    scope: 'company', entitlement: 'project.core', companyRoles: COMPANY_MANAGERS, resource: 'none',
  },
  'project:update': projectManage('project.core'),
  'project:archive': projectManage('project.core'),
  'course:create': { scope: 'company', entitlement: 'learning.core', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'course:read': projectRead('learning.core'),
  'course:update': projectManage('learning.core'),
  'course:archive': projectManage('learning.core'),
  'project_member:list': {
    scope: 'project', entitlement: 'project.members.manage', projectRoles: PROJECT_LISTERS, resource: 'none',
  },
  'project_member:add': projectManage('project.members.manage'),
  'project_member:update': projectManage('project.members.manage'),
  'project_member:remove': projectManage('project.members.manage'),
  'project_invitation:list': projectManage('project.members.manage'),
  'project_invitation:create': projectManage('project.members.manage'),
  'project_invitation:revoke': projectManage('project.members.manage'),
  'learning:read': projectRead('learning.core'),
  'learning:manage': projectManage('learning.core'),
  'learning:submit': { scope: 'project', entitlement: 'learning.core', projectRoles: LEARNERS, resource: 'none' },
  'learning:review': projectManage('learning.core'),
  'learning:preference': projectRead('learning.core'),
  'knowledge:read': projectRead('knowledge.core'),
  'knowledge:write': projectWrite('knowledge.core'),
  'knowledge:manage': projectWrite('knowledge.core', 'creator_or_manager'),
  'conversation:read': projectRead('conversation.core', 'member'),
  'conversation:write': projectWrite('conversation.core', 'member'),
  'conversation:manage': projectManage('conversation.core', 'leader_or_manager'),
  'document:read': projectRead('conversation.core', 'member'),
  'document:write': projectWrite('conversation.core', 'member'),
  'document:delete': projectWrite('conversation.core', 'creator_or_manager'),
  'board:read': projectRead('conversation.core'),
  'board:write': projectWrite('conversation.core'),
  'calendar:read': projectRead('conversation.core'),
  'calendar:write': projectWrite('conversation.core', 'creator_or_manager'),
  'canvas:read': projectRead('conversation.core', 'member'),
  'canvas:write': projectWrite('conversation.core', 'member'),
  'poll:read': projectRead('conversation.core', 'member'),
  'poll:create': projectWrite('conversation.core', 'member'),
  'poll:vote': projectWrite('conversation.core', 'member'),
  'poll:close': projectWrite('conversation.core', 'creator_or_manager'),
  'email:read': { scope: 'company', entitlement: 'conversation.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'email:write': { scope: 'company', entitlement: 'conversation.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'attachment:write': {
    scope: 'company', entitlement: 'conversation.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none',
  },
  'agent:read': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent:manage': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_autonomy:read': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_autonomy:write': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_memory:read': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_memory:write': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_approval:list': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'agent_approval:resolve': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'agent_run:control': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
} as const satisfies Record<PermissionAction, PermissionPolicy>

export const PROJECT_WRITE_ACTIONS = new Set<PermissionAction>([
  'project:update', 'project:archive', 'course:update', 'course:archive',
  'project_member:add', 'project_member:update', 'project_member:remove',
  'project_invitation:create', 'project_invitation:revoke',
  'learning:manage', 'learning:submit', 'learning:review', 'learning:preference',
  'knowledge:write', 'knowledge:manage', 'conversation:write', 'conversation:manage',
  'document:write', 'document:delete', 'board:write', 'calendar:write', 'canvas:write',
  'poll:create', 'poll:vote', 'poll:close', 'email:write', 'attachment:write',
  'agent_autonomy:write', 'agent_memory:write', 'agent_approval:resolve', 'agent_run:control',
])

export function evaluatePolicy(
  request: PermissionRequest,
  context: ResolvedAccessContext,
  resource: ResourceRecord | null,
): PermissionReason {
  const policy: PermissionPolicy = PERMISSION_POLICIES[request.action]
  if (policy.entitlement && !context.entitlements.has(policy.entitlement)) return 'ENTITLEMENT_MISSING'

  if (policy.scope === 'company') {
    if (!policy.companyRoles?.includes(context.companyMembership.role)) return 'ROLE_NOT_ALLOWED'
  } else {
    const membership = context.projectMembership
    if (!membership || !policy.projectRoles?.includes(membership.role)) return 'ROLE_NOT_ALLOWED'
    if ((request.action === 'project:update' || request.action === 'project:archive')
      && context.project?.kind === 'PERSONAL_LEARNING' && membership.role !== 'OWNER') {
      return 'ROLE_NOT_ALLOWED'
    }
  }

  if (context.project?.status === 'archived' && PROJECT_WRITE_ACTIONS.has(request.action)) {
    return 'PROJECT_STATE_DENIED'
  }
  if (request.action === 'canvas:write' && resource?.status && resource.status !== 'active') {
    return 'RESOURCE_STATE_DENIED'
  }
  if (!resource) return 'ALLOWED'

  const projectRole = context.projectMembership?.role
  const isProjectManager = projectRole === 'OWNER' || projectRole === 'TEACHER'
  switch (policy.resource) {
    case 'none':
      return 'ALLOWED'
    case 'member':
      return resource.conversationMembers === null || resource.conversationMembers.includes(request.actorUserId)
        ? 'ALLOWED'
        : 'RESOURCE_MEMBERSHIP_REQUIRED'
    case 'creator_or_manager':
      return resource.createdBy === request.actorUserId || isProjectManager
        ? 'ALLOWED'
        : 'ROLE_NOT_ALLOWED'
    case 'leader_or_manager':
      return resource.leaderId === request.actorUserId || isProjectManager
        ? 'ALLOWED'
        : 'ROLE_NOT_ALLOWED'
  }
}
