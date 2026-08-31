import {
  type CompanyRole,
  companyStatusBelongsToType,
  type ProjectRole,
  projectKindBelongsToCompanyType,
  projectStatusBelongsToKind,
} from '../../domain/public.js'
import type {
  EntitlementCode,
  PermissionAction,
  PermissionReason,
  PermissionRequest,
  ResolvedAccessContext,
  ResourceAccessMode,
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

export function knowledgeSourceVisibilityScope(
  context: ResolvedAccessContext,
): 'PRIVATE' | 'PROJECT' {
  const role = context.projectMembership?.role
  return role === 'OWNER' || role === 'TEACHER' ? 'PROJECT' : 'PRIVATE'
}

const ALL_COMPANY_ROLES = ['OWNER', 'ADMIN', 'MEMBER'] as const satisfies readonly CompanyRole[]
const COMPANY_MANAGERS = ['OWNER', 'ADMIN'] as const satisfies readonly CompanyRole[]
const ALL_PROJECT_ROLES = ['OWNER', 'TEACHER', 'TA', 'STUDENT', 'OBSERVER'] as const satisfies readonly ProjectRole[]
const PROJECT_WRITERS = ['OWNER', 'TEACHER', 'TA', 'STUDENT'] as const satisfies readonly ProjectRole[]
const PROJECT_MANAGERS = ['OWNER', 'TEACHER'] as const satisfies readonly ProjectRole[]
const PROJECT_OWNERS = ['OWNER'] as const satisfies readonly ProjectRole[]
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
  'company:activate': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:request_user_deletion': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:enter_grace_period': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:enter_read_only': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:offboard': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:enter_retention': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:archive': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'company:delete': { scope: 'company', companyRoles: COMPANY_MANAGERS, resource: 'none' },
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
  'project:activate': projectManage('project.core'),
  'project:end': projectManage('project.core'),
  'project:enter_read_only': projectManage('project.core'),
  'project:request_transfer': {
    scope: 'project', entitlement: 'project.core', projectRoles: PROJECT_OWNERS, resource: 'none',
  },
  'project:cancel_transfer': {
    scope: 'project', entitlement: 'project.core', projectRoles: PROJECT_OWNERS, resource: 'none',
  },
  'project:enter_retention': projectManage('project.core'),
  'project:archive': projectManage('project.core'),
  'project:delete': projectManage('project.core'),
  'course:create': { scope: 'company', entitlement: 'learning.core', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'course:read': projectRead('learning.core'),
  'course:update': projectManage('learning.core'),
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
  'agent:manage': { scope: 'company', entitlement: 'agent.core', companyRoles: COMPANY_MANAGERS, resource: 'none' },
  'agent_autonomy:read': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_autonomy:write': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'none' },
  'agent_memory:read': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'agent_memory:write': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'agent_memory:read_company': {
    scope: 'company', entitlement: 'agent.core', companyRoles: COMPANY_MANAGERS, resource: 'none',
  },
  'agent_memory:write_company': {
    scope: 'company', entitlement: 'agent.core', companyRoles: COMPANY_MANAGERS, resource: 'none',
  },
  'agent_approval:list': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'agent_approval:resolve': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'agent_run:control': { scope: 'company', entitlement: 'agent.core', companyRoles: ALL_COMPANY_ROLES, resource: 'member' },
  'trust:read_l2': projectManage('learning.core'),
  'trust:read_l3_company': {
    scope: 'company', entitlement: 'learning.core', companyRoles: COMPANY_MANAGERS, resource: 'none',
  },
  'trust:read_l3_project': {
    scope: 'project', entitlement: 'learning.core', projectRoles: PROJECT_OWNERS, resource: 'none',
  },
} as const satisfies Record<PermissionAction, PermissionPolicy>

export const PROJECT_WRITE_ACTIONS = new Set<PermissionAction>([
  'project:update', 'project:activate', 'project:end', 'project:enter_read_only',
  'project:request_transfer', 'project:cancel_transfer', 'project:enter_retention',
  'project:archive', 'project:delete', 'course:update',
  'project_member:add', 'project_member:update', 'project_member:remove',
  'project_invitation:create', 'project_invitation:revoke',
  'learning:manage', 'learning:submit', 'learning:review', 'learning:preference',
  'knowledge:write', 'knowledge:manage', 'conversation:write', 'conversation:manage',
  'document:write', 'document:delete', 'calendar:write', 'canvas:write',
  'poll:create', 'poll:vote', 'poll:close', 'email:write', 'attachment:write',
  'agent_autonomy:write', 'agent_memory:write', 'agent_memory:write_company',
  'agent_approval:resolve', 'agent_run:control',
])

const READ_ACTIONS = new Set<PermissionAction>([
  'company:list', 'company:read', 'company_member:list', 'company_invitation:list',
  'project:list', 'project:read', 'course:read', 'project_member:list', 'project_invitation:list',
  'learning:read', 'knowledge:read', 'conversation:read', 'document:read',
  'calendar:read', 'canvas:read', 'poll:read', 'email:read', 'agent:read',
  'agent_autonomy:read', 'agent_memory:read', 'agent_memory:read_company', 'agent_approval:list',
  'trust:read_l2', 'trust:read_l3_company', 'trust:read_l3_project',
])

const COMPANY_LIFECYCLE_ACTIONS = new Set<PermissionAction>([
  'company:activate', 'company:request_user_deletion', 'company:enter_grace_period',
  'company:enter_read_only', 'company:offboard', 'company:enter_retention',
  'company:archive', 'company:delete',
])

const PROJECT_LIFECYCLE_ACTIONS = new Set<PermissionAction>([
  'project:activate', 'project:end', 'project:enter_read_only', 'project:request_transfer',
  'project:cancel_transfer', 'project:enter_retention', 'project:archive', 'project:delete',
])

const GROWTH_ACTIONS = new Set<PermissionAction>([
  'company_invitation:create', 'project:create_personal_learning', 'course:create',
  'project_member:add', 'project_invitation:create',
])

const TRANSFER_FROZEN_ACTIONS = new Set<PermissionAction>([
  'project:update', 'project:archive', 'project:delete', 'course:update',
  'project_member:add', 'project_member:update', 'project_member:remove',
  'project_invitation:create', 'project_invitation:revoke',
])

const CLOSE_OUT_ACTIONS = new Set<PermissionAction>([
  'learning:review', 'agent_approval:resolve',
])

export function resourceAccessMode(context: ResolvedAccessContext): ResourceAccessMode {
  const companyMode = companyAccessMode(context.company)
  if (!context.project) return companyMode
  const projectMode = projectAccessMode(context.project, context.company.type)
  const priority: Record<ResourceAccessMode, number> = {
    READ_WRITE: 0,
    TRANSFER_PENDING: 1,
    MANAGER_ONLY: 2,
    CLOSE_OUT: 3,
    READ_ONLY: 4,
    RETENTION: 5,
    DENY: 6,
  }
  return priority[companyMode] >= priority[projectMode] ? companyMode : projectMode
}

function projectAccessMode(
  project: NonNullable<ResolvedAccessContext['project']>,
  companyType: ResolvedAccessContext['company']['type'],
): ResourceAccessMode {
  if (!projectContextIsValid(project, companyType)) return 'DENY'
  switch (project.status) {
    case 'CREATED':
    case 'DRAFT':
      return 'MANAGER_ONLY'
    case 'ACTIVE':
      return 'READ_WRITE'
    case 'COURSE_ENDED':
      return 'CLOSE_OUT'
    case 'READ_ONLY':
    case 'ARCHIVED':
      return 'READ_ONLY'
    case 'TRANSFER_PENDING':
      return 'TRANSFER_PENDING'
    case 'RETENTION':
      return 'RETENTION'
    case 'DELETED':
      return 'DENY'
  }
}

function companyAccessMode(company: ResolvedAccessContext['company']): ResourceAccessMode {
  if (!companyContextIsValid(company)) return 'DENY'
  switch (company.status) {
    case 'TRIAL':
    case 'ACTIVE':
    case 'GRACE_PERIOD':
      return 'READ_WRITE'
    case 'READ_ONLY':
      return 'READ_ONLY'
    case 'USER_DELETION_PENDING':
    case 'OFFBOARDED':
    case 'RETENTION':
      return 'RETENTION'
    case 'DELETED':
      return 'DENY'
    case 'ARCHIVED':
      return 'READ_ONLY'
  }
}

function companyContextIsValid(company: ResolvedAccessContext['company']): boolean {
  switch (company.type) {
    case 'PERSONAL':
    case 'EDUCATION':
      return companyStatusBelongsToType(company.type, company.status)
    default:
      return false
  }
}

function projectContextIsValid(
  project: NonNullable<ResolvedAccessContext['project']>,
  companyType: ResolvedAccessContext['company']['type'],
): boolean {
  switch (project.kind) {
    case 'PERSONAL_LEARNING':
    case 'TEACHING':
    case 'INSTITUTIONAL_COURSE':
      return projectStatusBelongsToKind(project.kind, project.status)
        && projectKindBelongsToCompanyType(project.kind, companyType)
    default:
      return false
  }
}

function isContextManager(context: ResolvedAccessContext): boolean {
  return context.companyMembership.role === 'OWNER'
    || context.companyMembership.role === 'ADMIN'
    || context.projectMembership?.role === 'OWNER'
    || context.projectMembership?.role === 'TEACHER'
}

function isCompanyManagerOrProjectOwner(context: ResolvedAccessContext): boolean {
  return context.companyMembership.role === 'OWNER'
    || context.companyMembership.role === 'ADMIN'
    || context.projectMembership?.role === 'OWNER'
}

function evaluateResourceAccessMode(
  request: PermissionRequest,
  context: ResolvedAccessContext,
): PermissionReason {
  if (context.company.status === 'GRACE_PERIOD' && GROWTH_ACTIONS.has(request.action)) {
    return 'COMPANY_STATE_DENIED'
  }
  const lifecycle = COMPANY_LIFECYCLE_ACTIONS.has(request.action) || PROJECT_LIFECYCLE_ACTIONS.has(request.action)
  const companyDecision = evaluateCompanyAccessMode(
    companyAccessMode(context.company), request, context, lifecycle,
  )
  if (companyDecision !== 'ALLOWED') return companyDecision
  if (!context.project) return 'ALLOWED'
  return evaluateProjectAccessMode(
    projectAccessMode(context.project, context.company.type), request, context, lifecycle,
  )
}

function evaluateCompanyAccessMode(
  mode: ResourceAccessMode,
  request: PermissionRequest,
  context: ResolvedAccessContext,
  lifecycle: boolean,
): PermissionReason {
  switch (mode) {
    case 'READ_WRITE':
      return 'ALLOWED'
    case 'READ_ONLY':
      return READ_ACTIONS.has(request.action) || lifecycle
        ? 'ALLOWED'
        : 'COMPANY_STATE_DENIED'
    case 'RETENTION':
      if (!isCompanyManagerOrProjectOwner(context)) return 'COMPANY_STATE_DENIED'
      return READ_ACTIONS.has(request.action) || lifecycle
        ? 'ALLOWED'
        : 'COMPANY_STATE_DENIED'
    case 'DENY':
      return 'COMPANY_STATE_DENIED'
    case 'MANAGER_ONLY':
    case 'CLOSE_OUT':
    case 'TRANSFER_PENDING':
      return 'COMPANY_STATE_DENIED'
  }
}

function evaluateProjectAccessMode(
  mode: ResourceAccessMode,
  request: PermissionRequest,
  context: ResolvedAccessContext,
  lifecycle: boolean,
): PermissionReason {
  switch (mode) {
    case 'READ_WRITE':
      return 'ALLOWED'
    case 'MANAGER_ONLY':
      return isContextManager(context) ? 'ALLOWED' : 'PROJECT_STATE_DENIED'
    case 'CLOSE_OUT':
      return READ_ACTIONS.has(request.action) || CLOSE_OUT_ACTIONS.has(request.action) || lifecycle
        ? 'ALLOWED'
        : 'PROJECT_STATE_DENIED'
    case 'READ_ONLY':
      if (context.project?.status === 'ARCHIVED'
        && context.project.kind === 'INSTITUTIONAL_COURSE'
        && !isCompanyManagerOrProjectOwner(context)) return 'PROJECT_STATE_DENIED'
      return READ_ACTIONS.has(request.action) || lifecycle ? 'ALLOWED' : 'PROJECT_STATE_DENIED'
    case 'TRANSFER_PENDING':
      return TRANSFER_FROZEN_ACTIONS.has(request.action)
        ? 'PROJECT_STATE_DENIED'
        : 'ALLOWED'
    case 'RETENTION':
      if (!isCompanyManagerOrProjectOwner(context)) return 'PROJECT_STATE_DENIED'
      return READ_ACTIONS.has(request.action) || lifecycle ? 'ALLOWED' : 'PROJECT_STATE_DENIED'
    case 'DENY':
      return 'PROJECT_STATE_DENIED'
  }
}

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
    const personalOwnerCanLearn = request.action === 'learning:submit'
      && context.project?.kind === 'PERSONAL_LEARNING'
      && membership?.role === 'OWNER'
    if (!membership || (!policy.projectRoles?.includes(membership.role) && !personalOwnerCanLearn)) {
      return 'ROLE_NOT_ALLOWED'
    }
    if ((request.action === 'project:update' || PROJECT_LIFECYCLE_ACTIONS.has(request.action))
      && context.project?.kind === 'PERSONAL_LEARNING' && membership.role !== 'OWNER') {
      return 'ROLE_NOT_ALLOWED'
    }
  }

  const accessModeDecision = evaluateResourceAccessMode(request, context)
  if (accessModeDecision !== 'ALLOWED') return accessModeDecision
  const ownsCanvasFrame = request.resource?.type === 'canvas_frame'
    && resource?.createdBy === request.actorUserId
  if (request.action === 'canvas:write' && resource?.status && resource.status !== 'active' && !ownsCanvasFrame) {
    return 'RESOURCE_STATE_DENIED'
  }
  if (!resource) return 'ALLOWED'
  if (resource.visibilityScope === 'PRIVATE' && resource.ownerUserId !== request.actorUserId) {
    return 'ROLE_NOT_ALLOWED'
  }

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
