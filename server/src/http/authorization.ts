import type { Request } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { assertTeacherRoomAccessible } from '../learning/visibility.js'
import { HttpError } from './errors.js'
import { assertProjectWritable, requireCompany } from './request-context.js'

export { DEVTOOLS_ROLES, OWNER_ONLY, PRIVILEGED_ROLES } from './roles.js'

import { DEVTOOLS_ROLES, PRIVILEGED_ROLES } from './roles.js'

export const DEVTOOLS_HEADER = 'x-lingxiloop-dev-mode'

export function requestedDevMode(req: Request): boolean {
  const header = req.headers[DEVTOOLS_HEADER]
  return header === '1' || header === 'true'
}

export async function requireCompanyRole(
  req: Request & AuthedRequest,
  allowedRoles: ReadonlySet<string> = PRIVILEGED_ROLES,
): Promise<{ userId: string; companyId: string; role: string }> {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2 LIMIT 1`,
    [companyId, userId],
  )
  const role = rows[0]?.role ?? 'member'
  if (!allowedRoles.has(role)) {
    throw new HttpError(403, 'this action requires an owner or admin of the workspace')
  }
  return { userId, companyId, role }
}

export async function requireConversationMember(
  req: Request & AuthedRequest,
  conversationId: string,
): Promise<{ userId: string; companyId: string; projectId: string | null; members: string[]; kind: string }> {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ project_id: string | null; members: string[]; kind: string; project_allowed: boolean }>(
    `SELECT conversation.project_id,conversation.members,conversation.kind,
            (conversation.project_id IS NULL OR project.is_general=TRUE
             OR company_member.role IN ('owner','admin')
             OR course_member.user_id IS NOT NULL) AS project_allowed
       FROM conversations conversation
       LEFT JOIN projects project ON project.id=conversation.project_id
       JOIN company_members company_member
         ON company_member.company_id=conversation.company_id AND company_member.user_id=$3
       LEFT JOIN courses course ON course.project_id=project.id
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id AND course_member.user_id=$3
      WHERE conversation.id=$1 AND conversation.company_id=$2 LIMIT 1`,
    [conversationId, companyId, userId],
  )
  if (!rows[0] || !rows[0].project_allowed) throw new HttpError(404, 'not found')
  if (!rows[0].members.includes(userId)) throw new HttpError(404, 'not found')
  await assertTeacherRoomAccessible(conversationId, companyId, userId)
  return { userId, companyId, projectId: rows[0].project_id, members: rows[0].members, kind: rows[0].kind }
}

export async function requireGroupConversation(req: Request & AuthedRequest, conversationId: string) {
  const membership = await requireConversationMember(req, conversationId)
  if (membership.kind !== 'group') throw new HttpError(404, 'not found')
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id=$1 AND user_id=$2 LIMIT 1`,
    [membership.companyId, membership.userId],
  )
  return { ...membership, role: rows[0]?.role ?? 'member' }
}

export async function requireCanvasWorkspace(req: Request & AuthedRequest, canvasId: string, writable = false) {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ conversation_id: string; project_id: string | null }>(
    `SELECT cv.conversation_id,c.project_id FROM canvases cv JOIN conversations c ON c.id=cv.conversation_id
      JOIN projects project ON project.id=c.project_id
      JOIN company_members company_member ON company_member.company_id=c.company_id AND company_member.user_id=$3
      LEFT JOIN courses course ON course.project_id=project.id
      LEFT JOIN course_members course_member ON course_member.course_id=course.id AND course_member.user_id=$3
      WHERE cv.id=$1 AND cv.company_id=$2 AND c.kind='group' AND c.members @> to_jsonb(ARRAY[$3::text])
        AND (project.is_general=TRUE OR company_member.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)
      LIMIT 1`,
    [canvasId, companyId, userId],
  )
  if (!rows[0]) throw new HttpError(404, 'canvas not found')
  if (writable) await assertProjectWritable(rows[0].project_id)
  return { userId, companyId, projectId: rows[0].project_id, conversationId: rows[0].conversation_id }
}

export async function requireCanvasFrameWorkspace(req: Request & AuthedRequest, frameId: string, writable = false) {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ project_id: string | null }>(
    `SELECT c.project_id FROM canvas_frames f JOIN canvases cv ON cv.id=f.canvas_id JOIN conversations c ON c.id=cv.conversation_id
      JOIN projects project ON project.id=c.project_id
      JOIN company_members company_member ON company_member.company_id=c.company_id AND company_member.user_id=$3
      LEFT JOIN courses course ON course.project_id=project.id
      LEFT JOIN course_members course_member ON course_member.course_id=course.id AND course_member.user_id=$3
      WHERE f.id=$1 AND cv.company_id=$2 AND c.kind='group' AND c.members @> to_jsonb(ARRAY[$3::text])
        AND (project.is_general=TRUE OR company_member.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)
      LIMIT 1`,
    [frameId, companyId, userId],
  )
  if (!rows[0]) throw new HttpError(404, 'canvas frame not found')
  if (writable) await assertProjectWritable(rows[0].project_id)
  return { userId, companyId, projectId: rows[0].project_id }
}

export async function getDevtoolsState(req: Request & AuthedRequest): Promise<{
  userId: string
  companyId: string
  role: string
  localDev: boolean
  requested: boolean
  canEnable: boolean
  enabled: boolean
}> {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ role: string }>(
    `SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2 LIMIT 1`,
    [companyId, userId],
  )
  const role = rows[0]?.role ?? 'member'
  const localDev = env.NODE_ENV !== 'production'
  const requested = requestedDevMode(req)
  const privileged = DEVTOOLS_ROLES.has(role)
  const canEnable = localDev || privileged
  const enabled = localDev || (requested && privileged)
  return { userId, companyId, role, localDev, requested, canEnable, enabled }
}

export async function requireDevtools(
  req: Request & AuthedRequest,
): Promise<{ userId: string; companyId: string; role: string }> {
  const state = await getDevtoolsState(req)
  if (!state.enabled) throw new HttpError(403, 'developer tools are not enabled')
  return { userId: state.userId, companyId: state.companyId, role: state.role }
}
