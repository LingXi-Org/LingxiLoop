import type { Queryable } from '../../db/queryable.js'
import { ContextScopedPermissionService, type PermissionServiceOptions } from './application.js'
import type { PermissionRequest, PermissionService, ResolvedAccessContext } from './contracts.js'
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
