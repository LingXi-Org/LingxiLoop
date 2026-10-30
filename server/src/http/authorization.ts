import type { Request } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import type { PermissionAction } from '../domain/public.js'
import { permissionService } from '../modules/access/public.js'
import { HttpError } from './errors.js'
import { requireAuth, requestedCompanyId } from './request-context.js'

export async function requireConversationMember(
  req: Request & AuthedRequest,
  conversationId: string,
  action: PermissionAction = 'conversation:read',
): Promise<{ userId: string; companyId: string; projectId: string | null; members: string[]; kind: string }> {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  const context = await permissionService.assertCan({
    actorUserId: userId,
    action,
    companyId,
    resource: { type: 'conversation', id: conversationId },
  })
  const { rows } = await pool.query<{ members: string[]; kind: string }>(
    `SELECT members,kind FROM conversations WHERE id=$1 AND company_id=$2`,
    [conversationId, companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'not found')
  return {
    userId,
    companyId,
    projectId: context.project?.id ?? null,
    members: rows[0].members,
    kind: rows[0].kind,
  }
}

export async function requireGroupConversation(
  req: Request & AuthedRequest,
  conversationId: string,
  action: PermissionAction = 'conversation:read',
) {
  const membership = await requireConversationMember(req, conversationId, action)
  if (membership.kind !== 'group') throw new HttpError(404, 'not found')
  return { ...membership, role: 'member' }
}

export async function requireArtifact(
  req: Request & AuthedRequest,
  artifactId: string,
  writable = false,
) {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  await permissionService.assertCan({
    actorUserId: userId,
    action: writable ? 'artifact:write' : 'artifact:read',
    companyId,
    resource: { type: 'artifact', id: artifactId },
  })
  const { rows } = await pool.query<{ kind: 'design' | 'slides'; project_id: string; conversation_id: string | null }>(
    `SELECT kind,project_id,conversation_id FROM artifacts WHERE id=$1 AND company_id=$2`,
    [artifactId, companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'artifact not found')
  return {
    userId,
    companyId,
    kind: rows[0].kind,
    projectId: rows[0].project_id,
    conversationId: rows[0].conversation_id,
  }
}
