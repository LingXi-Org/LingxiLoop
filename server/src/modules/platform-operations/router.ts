import { Router } from 'express'
import { z } from 'zod'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { imMessagesApplication } from '../../im/messages-facade.js'
import { readDocumentText } from '../documents/public.js'
import { audit } from '../identity/public.js'
import { platformApplication } from '../platform/facade.js'
import { requirePlatformAdmin, type PlatformAdminIdentity } from './authorization.js'
import {
  adminResourceCatalog,
  getAdminResource,
  getAdminResourceField,
  listAdminResources,
  type AdminListQuery,
} from './resources.js'
import { observabilityDashboard } from './observability-dashboard.js'
import { changeUserLifecycle } from './user-lifecycle.js'

export const adminRouter = Router()

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(280) }).strict()
const INLINE_CONTENT_LIMIT = 100_000

function requestMetadata(request: Parameters<typeof requirePlatformAdmin>[1]) {
  return {
    ip: request.socket.remoteAddress ?? null,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
  }
}

adminRouter.use((request, response, next) => {
  void requirePlatformAdmin(pool, request).then((identity) => {
    response.locals.platformAdmin = identity
    next()
  }, next)
})

adminRouter.use((request, response, next) => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
    next()
    return
  }
  const admin = identity(response)
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim().slice(0, 280) : null
  response.on('finish', () => {
    void audit({
      kind: 'platform_admin.command_result',
      userId: admin.id,
      ...requestMetadata(request),
      detail: {
        method: request.method,
        path: request.path,
        reason,
        status: response.statusCode,
      },
    }).catch((error: unknown) => console.error('[admin] command result audit failed', error))
  })
  next()
})

function identity(response: { locals: Record<string, unknown> }): PlatformAdminIdentity {
  return response.locals.platformAdmin as PlatformAdminIdentity
}

adminRouter.get('/session', (request, response) => {
  response.json({
    user: identity(response),
    version: env.APP_VERSION,
    commitSha: env.COMMIT_SHA,
    capabilities: {
      crossTenantRead: true,
      sensitiveContentRead: true,
      userLifecycle: ['suspend', 'restore', 'delete'],
      arbitraryCrud: false,
    },
  })
})

adminRouter.get('/resources', (_request, response) => {
  response.json({ data: adminResourceCatalog() })
})

adminRouter.get('/dashboard', safe(async (_request, response) => {
  const [counts, failures, recentAudit, dependencies] = await Promise.all([
    pool.query<{
      users: number
      companies: number
      projects: number
      active_runs: number
    }>(`SELECT
          (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS users,
          (SELECT COUNT(*)::int FROM companies WHERE status<>'DELETED') AS companies,
          (SELECT COUNT(*)::int FROM projects WHERE status<>'DELETED') AS projects,
          (SELECT COUNT(*)::int FROM agent_runs WHERE status='running') AS active_runs`),
    pool.query<{ failed_jobs: number }>(`SELECT
          (SELECT COUNT(*)::int FROM agent_work_items WHERE status='failed')+
          (SELECT COUNT(*)::int FROM knowledge_source_jobs WHERE status='failed')+
          (SELECT COUNT(*)::int FROM notification_deliveries WHERE status='FAILED') AS failed_jobs`),
    pool.query(`SELECT id,user_id,company_id,kind,detail,created_at
                  FROM audit_events ORDER BY created_at DESC,id DESC LIMIT 10`),
    platformApplication.dependencyReadiness(),
  ])
  const count = counts.rows[0] ?? { users: 0, companies: 0, projects: 0, active_runs: 0 }
  response.json({
    counts: {
      users: count.users,
      companies: count.companies,
      projects: count.projects,
      activeRuns: count.active_runs,
      failedJobs: failures.rows[0]?.failed_jobs ?? 0,
    },
    dependencies,
    recentAudit: recentAudit.rows,
  })
}))

adminRouter.get('/observability', safe(async (request, response) => {
  const dashboard = await observabilityDashboard(pool)
  const admin = identity(response)
  await audit({
    kind: 'platform_admin.sensitive_read',
    userId: admin.id,
    ...requestMetadata(request),
    detail: { resource: 'agent-runs', view: 'observability-dashboard', limit: 30 },
  })
  response.json(dashboard)
}))

adminRouter.get('/search', safe(async (request, response) => {
  const search = typeof request.query.q === 'string' ? request.query.q.trim() : ''
  if (search.length < 2 || search.length > 100) throw new HttpError(400, 'q must be between 2 and 100 characters')
  const pattern = `%${search}%`
  const [users, companies, projects, courses] = await Promise.all([
    pool.query(`SELECT 'users' AS resource,id,email AS label,display_name AS summary
                  FROM users WHERE deleted_at IS NULL AND (email ILIKE $1 OR display_name ILIKE $1) LIMIT 5`, [pattern]),
    pool.query(`SELECT 'companies' AS resource,id,name AS label,slug AS summary
                  FROM companies WHERE name ILIKE $1 OR slug ILIKE $1 LIMIT 5`, [pattern]),
    pool.query(`SELECT 'projects' AS resource,id,name AS label,description AS summary
                  FROM projects WHERE name ILIKE $1 OR description ILIKE $1 LIMIT 5`, [pattern]),
    pool.query(`SELECT 'courses' AS resource,id,id AS label,created_by AS summary
                  FROM courses WHERE id ILIKE $1 OR created_by ILIKE $1 LIMIT 5`, [pattern]),
  ])
  response.json({ data: [...users.rows, ...companies.rows, ...projects.rows, ...courses.rows] })
}))

adminRouter.get('/resources/:resource', safe(async (request, response) => {
  response.json(await listAdminResources(
    pool,
    String(request.params.resource),
    request.query as AdminListQuery,
  ))
}))

adminRouter.get('/resources/:resource/:id/content/:field', safe(async (request, response) => {
  const resource = String(request.params.resource)
  const resourceId = String(request.params.id)
  const field = String(request.params.field)
  let raw: unknown
  if (resource === 'documents' && field === 'body') {
    const document = await getAdminResource(pool, resource, resourceId)
    const companyId = typeof document?.data.company_id === 'string' ? document.data.company_id : ''
    if (!companyId) throw new HttpError(404, 'document not found')
    raw = await readDocumentText(resourceId, companyId)
  } else {
    raw = await getAdminResourceField(pool, resource, resourceId, field)
  }
  if (raw === undefined) throw new HttpError(404, 'resource field not found')
  const content = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
  const cursor = request.query.cursor
    ? Number(Buffer.from(String(request.query.cursor), 'base64url').toString('utf8'))
    : 0
  const limit = request.query.limit ? Number(request.query.limit) : INLINE_CONTENT_LIMIT
  if (!Number.isInteger(cursor) || cursor < 0) throw new HttpError(400, 'invalid cursor')
  if (!Number.isInteger(limit) || limit < 1 || limit > 250_000) throw new HttpError(400, 'invalid limit')
  const end = Math.min(content.length, cursor + limit)
  const admin = identity(response)
  await audit({
    kind: 'platform_admin.sensitive_read',
    userId: admin.id,
    ...requestMetadata(request),
    detail: { resource, resourceId, field, cursor, end },
  })
  response.json({
    data: content.slice(cursor, end),
    encoding: typeof raw === 'string' ? 'text' : 'json',
    nextCursor: end < content.length ? Buffer.from(String(end)).toString('base64url') : null,
    length: content.length,
  })
}))

adminRouter.get('/resources/:resource/:id', safe(async (request, response) => {
  const resource = String(request.params.resource)
  const resourceId = String(request.params.id)
  const result = await getAdminResource(pool, resource, resourceId)
  if (!result) throw new HttpError(404, 'resource not found')
  if (resource === 'documents') {
    const companyId = String(result.data.company_id ?? '')
    if (companyId) result.data.body = await readDocumentText(resourceId, companyId)
  }
  const admin = identity(response)
  await audit({
    kind: 'platform_admin.detail_read',
    userId: admin.id,
    companyId: typeof result.data.company_id === 'string' ? result.data.company_id : null,
    ...requestMetadata(request),
    detail: { resource, resourceId, sensitive: result.sensitive },
  })
  for (const [field, value] of Object.entries(result.data)) {
    const content = typeof value === 'string' ? value : value && typeof value === 'object' ? JSON.stringify(value) : ''
    if (content.length > INLINE_CONTENT_LIMIT) {
      result.data[field] = {
        truncated: true,
        length: content.length,
        contentUrl: `/admin/resources/${encodeURIComponent(resource)}/${encodeURIComponent(resourceId)}/content/${encodeURIComponent(field)}`,
      }
    }
  }
  response.json(result.data)
}))

adminRouter.get('/conversations/:id/messages', safe(async (request, response) => {
  const conversationId = String(request.params.id)
  const conversation = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM conversations WHERE id=$1 LIMIT 1`,
    [conversationId],
  )
  const companyId = conversation.rows[0]?.company_id
  if (!companyId) throw new HttpError(404, 'conversation not found')
  const limit = request.query.limit ? Number(request.query.limit) : 50
  const beforeSequence = request.query.beforeSeq ? Number(request.query.beforeSeq) : 0
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'limit must be between 1 and 100')
  if (!Number.isInteger(beforeSequence) || beforeSequence < 0) {
    throw new HttpError(400, 'invalid beforeSeq')
  }
  const messages = await imMessagesApplication.historyForPlatformAdmin({
    companyId,
    channelId: conversationId,
    limit,
    beforeSequence,
  })
  if (!messages) throw new HttpError(404, 'conversation not found')
  const admin = identity(response)
  await audit({
    kind: 'platform_admin.sensitive_read',
    userId: admin.id,
    companyId,
    ...requestMetadata(request),
    detail: { resource: 'messages', conversationId, limit, beforeSequence: beforeSequence ?? null },
  })
  response.json(messages)
}))

function userLifecycle(action: 'suspend' | 'restore' | 'delete') {
  return safe(async (request, response) => {
    const parsed = reasonSchema.safeParse(request.body ?? {})
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'reason required')
    const admin = identity(response)
    const targetId = String(request.params.id)
    if (targetId === admin.id) throw new HttpError(409, 'platform administrators cannot change their own access')
    const result = await withTransaction(pool, (db) => changeUserLifecycle(db, {
      action,
      targetId,
      adminId: admin.id,
      reason: parsed.data.reason,
      ...requestMetadata(request),
    }))
    response.json(result)
  })
}

adminRouter.post('/users/:id/suspend', userLifecycle('suspend'))
adminRouter.post('/users/:id/restore', userLifecycle('restore'))
adminRouter.post('/users/:id/delete', userLifecycle('delete'))
