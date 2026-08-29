import type { Request } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { assertTeacherRoomAccessible } from '../modules/learning/public.js'
import { HttpError } from './errors.js'
import { assertProjectWritable, requireCompany } from './request-context.js'

export { ADMIN_ROLES, OWNER_ONLY, PRIVILEGED_ROLES } from './roles.js'

import { PRIVILEGED_ROLES } from './roles.js'

export async function requireCompanyRole(
  req: Request & AuthedRequest,
  allowedRoles: ReadonlySet<string> = PRIVILEGED_ROLES,
): Promise<{ userId: string; companyId: string; role: string }> {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ role: string }>(
    `SELECT LOWER(role) AS role FROM company_memberships
      WHERE company_id = $1 AND user_id = $2 AND status='ACTIVE' LIMIT 1`,
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
             OR company_member.role IN ('OWNER','ADMIN')
             OR course_member.user_id IS NOT NULL) AS project_allowed
       FROM conversations conversation
       LEFT JOIN projects project ON project.id=conversation.project_id
       JOIN company_memberships company_member
         ON company_member.company_id=conversation.company_id AND company_member.user_id=$3
        AND company_member.status='ACTIVE'
       LEFT JOIN project_memberships course_member
         ON course_member.project_id=project.id AND course_member.company_id=conversation.company_id
        AND course_member.user_id=$3 AND course_member.status='ACTIVE'
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
    `SELECT LOWER(role) AS role FROM company_memberships
      WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' LIMIT 1`,
    [membership.companyId, membership.userId],
  )
  return { ...membership, role: rows[0]?.role ?? 'member' }
}

export async function requireCanvasWorkspace(req: Request & AuthedRequest, canvasId: string, writable = false) {
  const { userId, companyId } = await requireCompany(req)
  const { rows } = await pool.query<{ conversation_id: string; project_id: string | null }>(
    `SELECT cv.conversation_id,c.project_id FROM canvases cv JOIN conversations c ON c.id=cv.conversation_id
      JOIN projects project ON project.id=c.project_id
      JOIN company_memberships company_member ON company_member.company_id=c.company_id AND company_member.user_id=$3
        AND company_member.status='ACTIVE'
      LEFT JOIN project_memberships course_member
        ON course_member.project_id=project.id AND course_member.company_id=c.company_id
       AND course_member.user_id=$3 AND course_member.status='ACTIVE'
      WHERE cv.id=$1 AND cv.company_id=$2 AND c.kind='group' AND c.members @> to_jsonb(ARRAY[$3::text])
        AND (project.is_general=TRUE OR company_member.role IN ('OWNER','ADMIN') OR course_member.user_id IS NOT NULL)
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
      JOIN company_memberships company_member ON company_member.company_id=c.company_id AND company_member.user_id=$3
        AND company_member.status='ACTIVE'
      LEFT JOIN project_memberships course_member
        ON course_member.project_id=project.id AND course_member.company_id=c.company_id
       AND course_member.user_id=$3 AND course_member.status='ACTIVE'
      WHERE f.id=$1 AND cv.company_id=$2 AND c.kind='group' AND c.members @> to_jsonb(ARRAY[$3::text])
        AND (project.is_general=TRUE OR company_member.role IN ('OWNER','ADMIN') OR course_member.user_id IS NOT NULL)
      LIMIT 1`,
    [frameId, companyId, userId],
  )
  if (!rows[0]) throw new HttpError(404, 'canvas frame not found')
  if (writable) await assertProjectWritable(rows[0].project_id)
  return { userId, companyId, projectId: rows[0].project_id }
}
