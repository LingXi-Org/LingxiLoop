import type { Queryable } from '../../db/queryable.js'
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionService,
  ResolvedAccessContext,
} from './contracts.js'
import { resolveAccessContext } from './context-resolver.js'
import { ForbiddenError, PermissionResolutionError } from './errors.js'
import { evaluatePolicy } from './policy.js'
import { AccessRepository } from './repository.js'

export interface PermissionServiceOptions {
  lockDependencies?: boolean
}

export class ContextScopedPermissionService implements PermissionService {
  private readonly repository: AccessRepository

  constructor(db: Queryable, options: PermissionServiceOptions = {}) {
    this.repository = new AccessRepository(db, options.lockDependencies ?? false)
  }

  private async resolve(request: PermissionRequest): Promise<PermissionDecision> {
    const resolved = await resolveAccessContext(this.repository, request)
    if (!resolved.allowed) return { allowed: false, reason: resolved.reason, context: null }
    const reason = evaluatePolicy(request, resolved.context, resolved.resource)
    return reason === 'ALLOWED'
      ? { allowed: true, reason, context: resolved.context }
      : { allowed: false, reason, context: null }
  }

  async can(request: PermissionRequest): Promise<PermissionDecision> {
    try { return await this.resolve(request) }
    catch {
      console.warn('[access] permission resolution unavailable', { action: request.action })
      return { allowed: false, reason: 'DENY_BY_DEFAULT', context: null }
    }
  }

  async assertCan(request: PermissionRequest): Promise<ResolvedAccessContext> {
    let decision: PermissionDecision
    try { decision = await this.resolve(request) }
    catch (cause) { throw new PermissionResolutionError(cause) }
    if (!decision.allowed || !decision.context) throw new ForbiddenError(decision.reason)
    return decision.context
  }
}
