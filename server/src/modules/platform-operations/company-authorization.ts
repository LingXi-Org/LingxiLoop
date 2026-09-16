import type { AuthedRequest } from '../../auth.js'
import type { Request } from 'express'
import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import { createPermissionService, type PermissionAction, type PermissionRequest, type PermissionDecision } from '../access/public.js'

export async function requireCompanyAdmin(db: Queryable, request: Request & AuthedRequest) {
  if (!request.gatewayAuthenticated || !request.authUserId) throw new HttpError(401, 'valid gateway identity required')
  const { rows } = await db.query<{ id: string; name: string; email: string; company_id: string; company_name: string }>(
    `SELECT u.id,u.display_name AS name,u.email,c.id AS company_id,c.name AS company_name
     FROM users u JOIN company_memberships m ON m.user_id=u.id
     JOIN companies c ON c.id=m.company_id
     WHERE u.id=$1 AND u.deleted_at IS NULL AND u.suspended_at IS NULL
       AND m.status='ACTIVE' AND m.ended_at IS NULL AND m.is_admin AND m.role='TEACHER'
       AND c.status<>'DELETED' LIMIT 2`, [request.authUserId])
  if (rows.length !== 1) throw new HttpError(403, 'company administrator access required')
  const user = rows[0]
  const service = createPermissionService(db)
  // Read decisions live for this HTTP request only; the next request rechecks membership and state.
  const decisions = new Map<string, Promise<PermissionDecision>>()
  const permissions = { can(request: PermissionRequest) {
    const key = JSON.stringify(request)
    let decision = decisions.get(key)
    if (!decision) { decision = service.can(request); decisions.set(key, decision) }
    return decision
  } }
  if (!(await permissions.can({ actorUserId: user.id, companyId: user.company_id, action: 'company_member:list' })).allowed) {
    throw new HttpError(403, 'company administrator access required')
  }
  return { user, permissions, companyId: user.company_id }
}

export type CompanyAdmin = Awaited<ReturnType<typeof requireCompanyAdmin>>

export async function companyManagementSession(admin: CompanyAdmin) {
  const commands: Record<string, PermissionAction> = {
    invite: 'company_invitation:create', updateMember: 'company_member:update', removeMember: 'company_member:remove',
    updateCompany: 'company:update', activateCompany: 'company:activate', readOnlyCompany: 'company:enter_read_only', archiveCompany: 'company:archive',
  }
  const capabilities = Object.fromEntries(await Promise.all(Object.entries(commands).map(async ([name, action]) =>
    [name, (await admin.permissions.can({ actorUserId: admin.user.id, companyId: admin.companyId, action })).allowed])))
  return { mode: 'company', companyId: admin.companyId, companyName: admin.user.company_name, user: admin.user, capabilities }
}
