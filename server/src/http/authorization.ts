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

export async function requireCanvasWorkspace(
  req: Request & AuthedRequest,
  canvasId: string,
  writable = false,
) {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  const context = await permissionService.assertCan({
    actorUserId: userId,
    action: writable ? 'canvas:write' : 'canvas:read',
    companyId,
    resource: { type: 'canvas', id: canvasId },
  })
  const { rows } = await pool.query<{ conversation_id: string | null }>(
    `SELECT conversation_id FROM canvases WHERE id=$1 AND company_id=$2`,
    [canvasId, companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'canvas not found')
  return {
    userId,
    companyId,
    projectId: context.project?.id ?? null,
    conversationId: rows[0].conversation_id,
  }
}

export async function requireCanvasFrameWorkspace(
  req: Request & AuthedRequest,
  frameId: string,
  writable = false,
) {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  const context = await permissionService.assertCan({
    actorUserId: userId,
    action: writable ? 'canvas:write' : 'canvas:read',
    companyId,
    resource: { type: 'canvas_frame', id: frameId },
  })
  return { userId, companyId, projectId: context.project?.id ?? null }
}
