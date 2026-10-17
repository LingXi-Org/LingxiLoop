import type { PermissionReason } from './contracts.js'

const OPAQUE_REASONS = new Set<PermissionReason>([
  'COMPANY_NOT_FOUND',
  'PROJECT_NOT_FOUND',
  'COMPANY_MEMBERSHIP_REQUIRED',
  'ORGANIZATION_SEAT_REQUIRED',
  'PROJECT_MEMBERSHIP_REQUIRED',
  'RESOURCE_NOT_FOUND',
  'RESOURCE_SCOPE_MISMATCH',
  'RESOURCE_MEMBERSHIP_REQUIRED',
])

export class ForbiddenError extends Error {
  readonly status: 403 | 404

  constructor(readonly reason: PermissionReason) {
    const opaque = OPAQUE_REASONS.has(reason)
    super(opaque ? 'not found' : 'forbidden')
    this.name = 'ForbiddenError'
    this.status = opaque ? 404 : 403
  }
}

/** Authorization was not established; this is never a policy denial or permission grant. */
export class PermissionResolutionError extends Error {
  readonly code = 'authorization_unavailable'

  constructor(cause: unknown) {
    super('Permission resolution is unavailable', { cause })
    this.name = 'PermissionResolutionError'
  }
}
