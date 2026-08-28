import type { Request } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { HttpError } from './errors.js'
import { PRIVILEGED_ROLES } from './roles.js'

/** Throw 401 if the request has no valid session. Returns the user_id. */
export function requireAuth(req: Request & AuthedRequest): string {
  const id = req.authUserId
  if (!id) throw new HttpError(401, 'authentication required')
  return id
}

export type Queryable = {
  query<T extends object = Record<string, unknown>>(text: string, params?: readonly unknown[]): Promise<{ rows: T[] }>
}

/**
 * Resolve the active company for an authenticated request.
 *  - Reads `x-company-id` header for the requested tenant
 *  - Verifies the authed user is a member of it (company_members)
 *  - Requires an explicit company header
 *  - Throws 403 on any membership mismatch — never trusts the header alone
 *
 * Async + DB-validated by design: there's no scenario where a header alone
 * grants access to a company.
 */
export async function requireCompany(req: Request & AuthedRequest): Promise<{ userId: string; companyId: string }> {
  const userId = requireAuth(req)
  const requested = (() => {
    const h = req.headers['x-company-id']
    return typeof h === 'string' && h ? h.trim() : null
  })()
  if (requested) {
    const { rows } = await pool.query(
      `SELECT 1 FROM company_members WHERE company_id = $1 AND user_id = $2 LIMIT 1`,
      [requested, userId],
    )
    if (rows.length === 0) throw new HttpError(403, 'not a member of this company')
    return { userId, companyId: requested }
  }
  throw new HttpError(400, 'x-company-id is required')
}

export async function requireCompanyArtifactContext(req: Request & AuthedRequest, writable = false) {
  const header = typeof req.headers['x-project-id'] === 'string' ? req.headers['x-project-id'].trim() : ''
  if (!header) throw new HttpError(400, 'x-project-id is required')
  const workspace = await requireWorkspace(req, header)
  if (writable && workspace.projectStatus !== 'active') throw new HttpError(409, 'archived courses are read-only')
  return { userId: workspace.userId, companyId: workspace.companyId, projectId: workspace.projectId }
}

export async function assertProjectWritable(projectId: string | null): Promise<void> {
  if (!projectId) return
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM projects WHERE id=$1 LIMIT 1`, [projectId])
  if (!rows[0] || rows[0].status !== 'active') throw new HttpError(409, 'archived courses are read-only')
}

export async function assertConversationWritable(companyId: string, conversationId: string): Promise<void> {
  const { rows } = await pool.query<{ project_id: string | null }>(
    `SELECT project_id FROM conversations WHERE id=$1 AND company_id=$2`, [conversationId, companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'not found')
  await assertProjectWritable(rows[0].project_id)
}

export async function assertPollConversationWritable(companyId: string, messageId: string): Promise<void> {
  const { rows } = await pool.query<{ channel_id: string }>(
    `SELECT channel_id FROM im_polls WHERE poll_client_msg_no=$1 AND company_id=$2`,
    [messageId, companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'poll not found')
  await assertConversationWritable(companyId, rows[0].channel_id)
}

export async function requireWorkspace(
  req: Request & AuthedRequest,
  explicitProjectId?: string,
): Promise<{
  userId: string; companyId: string; projectId: string; role: string
  projectCreatedBy: string; isGeneral: boolean; projectStatus: string
  courseId: string | null; courseRole: 'teacher' | 'learner' | null
}> {
  const { userId, companyId } = await requireCompany(req)
  const header = typeof req.headers['x-project-id'] === 'string' ? req.headers['x-project-id'].trim() : ''
  const projectId = explicitProjectId?.trim() || header
  if (!projectId) throw new HttpError(400, 'x-project-id is required inside a knowledge workspace')
  if (explicitProjectId && header && header !== explicitProjectId) throw new HttpError(409, 'workspace header does not match route')
  const { rows } = await pool.query<{
    created_by: string; is_general: boolean; status: string; role: string
    course_id: string | null; course_role: 'teacher' | 'learner' | null
  }>(
    `SELECT p.created_by, p.is_general, p.status, cm.role,
            course.id AS course_id, course_member.role AS course_role
       FROM projects p JOIN company_members cm ON cm.company_id = p.company_id AND cm.user_id = $2
       LEFT JOIN courses course ON course.project_id = p.id AND course.company_id = p.company_id
       LEFT JOIN course_members course_member
         ON course_member.course_id = course.id AND course_member.user_id = $2
      WHERE p.id = $1 AND p.company_id = $3 LIMIT 1`, [projectId, userId, companyId],
  )
  const row = rows[0]
  if (!row || (
    !row.is_general
    && !PRIVILEGED_ROLES.has(row.role)
    && (!row.course_id || !row.course_role)
  )) {
    throw new HttpError(404, 'workspace not found')
  }
  return {
    userId, companyId, projectId, role: row.role,
    projectCreatedBy: row.created_by, isGeneral: row.is_general,
    projectStatus: row.status, courseId: row.course_id, courseRole: row.course_role,
  }
}
