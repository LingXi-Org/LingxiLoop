import type { Queryable } from '../../db/queryable.js'
import { ContextScopedPermissionService, type PermissionServiceOptions } from './application.js'
import type {
  PermissionRequest,
  PermissionService,
  ResolvedAccessContext,
  ResolvedEntitlements,
} from './contracts.js'
import { resolveEntitlements } from './entitlement-resolver.js'
import { AccessRepository } from './repository.js'

export type {
  EntitlementCode,
  PermissionAction,
  PermissionDecision,
  PermissionReason,
  PermissionRequest,
  PermissionResource,
  PermissionService,
  ResolvedAccessContext,
  ResolvedEntitlements,
  ResourceAccessMode,
} from './contracts.js'
export { ENTITLEMENT_CODES, PERMISSION_ACTIONS } from './contracts.js'
export { ForbiddenError } from './errors.js'
export { knowledgeSourceVisibilityScope } from './policy.js'

export function createPermissionService(
  db: Queryable,
  options?: PermissionServiceOptions,
): ContextScopedPermissionService {
  return new ContextScopedPermissionService(db, options)
}

export function isActiveProjectStudent(
  db: Queryable,
  input: { companyId: string; projectId: string; userId: string },
): Promise<boolean> {
  return new AccessRepository(db).isActiveProjectStudent(input.companyId, input.projectId, input.userId)
}

export function isActiveProjectMember(
  db: Queryable,
  input: { companyId: string; projectId: string; userId: string },
): Promise<boolean> {
  return new AccessRepository(db).isActiveProjectMember(input.companyId, input.projectId, input.userId)
}

export function listActiveProjectTeacherIds(
  db: Queryable,
  input: { companyId: string; projectId: string },
): Promise<string[]> {
  return new AccessRepository(db).activeProjectTeacherIds(input.companyId, input.projectId)
}

export function countActiveProjectLearners(
  db: Queryable,
  input: { companyId: string; projectId: string },
): Promise<number> {
  return new AccessRepository(db).activeProjectLearnerCount(input.companyId, input.projectId)
}

export function listActiveActorProjectScopes(
  db: Queryable,
  input: {
    actorUserId: string
    afterSortAt: string | null
    afterProjectId: string | null
    limit: number
  },
) {
  return new AccessRepository(db).activeActorProjectScopes(
    input.actorUserId,
    input.afterSortAt,
    input.afterProjectId,
    input.limit,
  )
}

export async function resolvePlanEntitlements(db: Queryable, planId: string): Promise<ResolvedEntitlements> {
  const result = await resolveEntitlements(new AccessRepository(db), planId)
  if (!result.allowed) throw new Error(`Plan entitlement resolution failed: ${result.reason}`)
  return result.entitlements
}

export const permissionService: PermissionService = {
  async can(request: PermissionRequest) {
    const { pool } = await import('../../db/pool.js')
    return createPermissionService(pool).can(request)
  },
  async assertCan(request: PermissionRequest): Promise<ResolvedAccessContext> {
    const { pool } = await import('../../db/pool.js')
    return createPermissionService(pool).assertCan(request)
  },
}
