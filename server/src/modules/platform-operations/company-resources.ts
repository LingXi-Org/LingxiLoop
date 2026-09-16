import type { Queryable } from '../../db/queryable.js'
import { HttpError } from '../../http/errors.js'
import type { PermissionAction, PermissionResource } from '../access/public.js'
import type { CompanyAdmin } from './company-authorization.js'
import { cursorOffset, getAdminResource, listAdminResources, type AdminListQuery } from './resources.js'

const companyReads: Record<string, PermissionAction> = {
  users: 'company_member:list', companies: 'company:read', 'company-memberships': 'company_member:list',
  'company-invitations': 'company_invitation:list', 'organization-units': 'company:read',
  'education-contracts': 'company:read', 'organization-seats': 'company_member:list', 'governance-policies': 'company:read',
}
const projectReads: Record<string, PermissionAction> = {
  projects: 'project:read', 'project-memberships': 'project_member:list', 'project-invitations': 'project_invitation:list',
  'project-transfers': 'project:read', courses: 'course:read', 'knowledge-units': 'learning:read',
  'learning-activities': 'learning:read', 'learning-attempts': 'learning:review', 'learning-missions': 'learning:read',
  'learning-cases': 'learning:review', 'learning-evaluations': 'learning:review', 'evidence-records': 'learning:review',
  'trust-snapshots': 'trust:read_l2',
}
const resourceReads: Record<string, [PermissionAction, PermissionResource['type']]> = {
  conversations: ['conversation:read', 'conversation'], documents: ['document:read', 'document'],
  canvases: ['canvas:read', 'canvas'], 'calendar-events': ['calendar:read', 'calendar_event'],
  'email-messages': ['email:read', 'message'], 'knowledge-sources': ['knowledge:read', 'knowledge_source'],
  participants: ['agent:read', 'agent'], 'agent-routines': ['agent_approval:list', 'routine'],
}
export const COMPANY_RESOURCES = [...Object.keys(companyReads), ...Object.keys(projectReads), ...Object.keys(resourceReads), 'knowledge-jobs', 'presentations', 'llm-calls', 'agent-runs']

export function companyResourceAllowed(resource: string) {
  if (!COMPANY_RESOURCES.includes(resource)) throw new HttpError(404, 'resource not available')
}

export async function canReadCompanyRecord(db: Queryable, admin: CompanyAdmin, resource: string, row: Record<string, unknown>): Promise<boolean> {
  companyResourceAllowed(resource)
  if (row.visibility_scope === 'PRIVATE' && row.owner_user_id !== admin.user.id && row.authorization_user_id !== admin.user.id) return false
  if (resource === 'users') {
    const membership = await db.query(`SELECT 1 FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND status='ACTIVE' AND ended_at IS NULL`, [admin.companyId, row.id])
    if (!membership.rows.length) return false
  } else if (!['knowledge-jobs', 'project-transfers'].includes(resource) && (resource === 'companies' ? row.id : row.company_id) !== admin.companyId) return false
  let action = companyReads[resource] ?? projectReads[resource]
  let target: PermissionResource | undefined
  let projectId = typeof row.project_id === 'string' ? row.project_id : undefined
  if (resource === 'projects') projectId = String(row.id)
  if (resourceReads[resource]) {
    const definition = resourceReads[resource]
    action = definition[0]; target = { type: definition[1], id: String(row.id) }
  }
  if (resource === 'knowledge-jobs') { action = 'knowledge:read'; target = { type: 'knowledge_source', id: String(row.source_id) } }
  if (resource === 'llm-calls' || resource === 'presentations') {
    if (typeof row.conversation_id !== 'string') return false
    action = 'conversation:read'; target = { type: 'conversation', id: row.conversation_id }
  }
  if (!action) return false
  const decision = await admin.permissions.can({ actorUserId: admin.user.id, companyId: admin.companyId, projectId, action, resource: target })
  if (decision.reason === 'DENY_BY_DEFAULT') throw new HttpError(503, 'authorization temporarily unavailable')
  return decision.allowed
}

export function companyRecord(resource: string, row: Record<string, unknown>) {
  if (resource === 'users') return Object.fromEntries(['id', 'display_name', 'email', 'image', 'created_at'].filter(key => row[key] !== undefined).map(key => [key, row[key]]))
  // Product attribution is retained; internal billing/debug payloads are not management content.
  const { extras: _extras, token_hash: _token, password_hash: _password, lease_token: _lease, ...record } = row
  return record
}

export async function companyResource(db: Queryable, admin: CompanyAdmin, resource: string, id: string) {
  companyResourceAllowed(resource)
  const result = await getAdminResource(db, resource, id)
  if (!result || !await canReadCompanyRecord(db, admin, resource, result.data)) throw new HttpError(404, 'resource not accessible')
  return companyRecord(resource, result.data)
}

export async function companyResourceList(db: Queryable, admin: CompanyAdmin, resource: string, query: AdminListQuery) {
  companyResourceAllowed(resource)
  if (query.companyId && query.companyId !== admin.companyId) throw new HttpError(404, 'company not accessible')
  const limit = Number(query.limit ?? 50), offset = cursorOffset(query.cursor)
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'invalid limit')
  let cursor: string | undefined, total = 0, scanned = 0
  const data: Record<string, unknown>[] = []
  const usage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 }
  // ponytail: bounded server-side permission scan; replace with shared ACL SQL when a tenant exceeds 10k matching records.
  do {
    const page = await listAdminResources(db, resource, { ...query, companyId: admin.companyId, cursor, limit: '100' })
    for (const row of page.data) {
      if (await canReadCompanyRecord(db, admin, resource, row)) {
        if (total >= offset && data.length < limit) data.push(companyRecord(resource, row))
        total++
        if (resource === 'llm-calls') {
          usage.calls++; usage.inputTokens += Number(row.input_tokens); usage.outputTokens += Number(row.output_tokens); usage.costUsd += Number(row.cost_usd)
        }
      }
    }
    scanned += page.data.length
    cursor = page.nextCursor ?? undefined
    if (cursor && scanned >= 10_000) throw new HttpError(503, 'narrow the resource filters')
  } while (cursor)
  return { data, total, ...(resource === 'llm-calls' ? { usage } : {}), nextCursor: total > offset + limit ? Buffer.from(String(offset + limit)).toString('base64url') : null }
}
