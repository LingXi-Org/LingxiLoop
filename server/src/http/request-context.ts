import type { Request } from 'express'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import type { PermissionAction, ProjectKind } from '../domain/public.js'
import { permissionService } from '../modules/access/public.js'
import { HttpError } from './errors.js'

/** Throw 401 if the request has no valid session. Returns the user_id. */
export function requireAuth(req: Request & AuthedRequest): string {
  const id = req.authUserId
  if (!id) throw new HttpError(401, 'authentication required')
  return id
}

export function requestedCompanyId(req: Request): string {
  const header = req.headers['x-company-id']
  const companyId = typeof header === 'string' ? header.trim() : ''
  if (!companyId) throw new HttpError(400, 'x-company-id is required')
  return companyId
}

export function requestedProjectId(req: Request): string {
  const header = req.headers['x-project-id']
  return typeof header === 'string' ? header.trim() : ''
}

/** Resolve Company access exclusively through the product Permission Resolver. */
export async function requireCompany(req: Request & AuthedRequest): Promise<{ userId: string; companyId: string }> {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  await permissionService.assertCan({ actorUserId: userId, action: 'company:read', companyId })
  return { userId, companyId }
}

export async function requireCompanyArtifactContext(
  req: Request & AuthedRequest,
  action: PermissionAction = 'project:read',
): Promise<{ userId: string; companyId: string; projectId: string }> {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  let projectId = requestedProjectId(req)
  if (!projectId) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM projects
        WHERE company_id=$1 AND is_default=TRUE AND status='ACTIVE'
        ORDER BY id LIMIT 1`,
      [companyId],
    )
    projectId = rows[0]?.id ?? ''
  }
  if (!projectId) throw new HttpError(409, 'company has no active default Project')
  await permissionService.assertCan({
    actorUserId: userId,
    action,
    companyId,
    projectId,
  })
  return { userId, companyId, projectId }
}

export async function requireWorkspace(
  req: Request & AuthedRequest,
  explicitProjectId?: string,
  action: PermissionAction = 'project:read',
): Promise<{
  userId: string
  companyId: string
  projectId: string
  role: string
  projectCreatedBy: string
  projectKind: ProjectKind
  isDefault: boolean
  projectStatus: string
  courseId: string | null
  courseRole: 'teacher' | 'learner' | null
}> {
  const userId = requireAuth(req)
  const companyId = requestedCompanyId(req)
  const header = requestedProjectId(req)
  const projectId = explicitProjectId?.trim() || header
  if (!projectId) throw new HttpError(400, 'x-project-id is required inside a knowledge workspace')
  const context = await permissionService.assertCan({ actorUserId: userId, action, companyId, projectId })
  const { rows } = await pool.query<{
    created_by: string | null
    kind: ProjectKind
    is_default: boolean
    status: string
    course_id: string | null
  }>(
    `SELECT project.created_by,project.kind,project.is_default,project.status,course.id AS course_id
       FROM projects project
       LEFT JOIN courses course ON course.project_id=project.id AND course.company_id=project.company_id
      WHERE project.id=$1 AND project.company_id=$2 LIMIT 1`,
    [projectId, companyId],
  )
  const row = rows[0]
  if (!row || !context.projectMembership) throw new HttpError(404, 'workspace not found')
  const projectRole = context.projectMembership.role
  return {
    userId,
    companyId,
    projectId,
    role: context.companyMembership.role.toLowerCase(),
    projectCreatedBy: row.created_by ?? '',
    projectKind: row.kind,
    isDefault: row.is_default,
    projectStatus: row.status,
    courseId: row.course_id,
    courseRole: projectRole === 'STUDENT' || projectRole === 'OBSERVER' ? 'learner' : 'teacher',
  }
}
