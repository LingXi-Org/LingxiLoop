import { educationRouter } from '../education/router.js'
import { Router } from 'express'
import { z } from 'zod'
import { lingxiOSControl } from '../../agent-runtime/runtime.js'
import { listNativeDeliveryFailures, retryNativeDelivery } from '../../agents/delivery-operations.js'
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
  resourceSummary,
  adminResourceCatalog,
  cursorOffset,
  getAdminResource,
  getAdminResourceField,
  listAdminResources,
  type AdminListQuery,
} from './resources.js'
import { observabilityDashboard } from './observability-dashboard.js'
import { changeUserLifecycle } from './user-lifecycle.js'
import {
  cancelPlatformAgentRun,
  continuePlatformAgentRun,
  decidePlatformAgentApproval,
  inspectPlatformAgentRun,
  platformAgentApproval,
  reconcilePlatformAgentAction,
  retryPlatformAgentDelivery,
  revisePlatformAgentRun,
} from './agent-operations.js'

export const adminRouter = Router()

const reasonSchema = z.object({ reason: z.string().trim().min(1).max(280) }).strict()
const commandSchema = z.object({ requestId: z.string().uuid(), reason: z.string().trim().min(1).max(280) }).strict()
const revisionSchema = commandSchema.extend({ text: z.string().trim().min(1).max(8000) }).strict()
const continuationSchema = commandSchema.extend({ inputId: z.string().trim().min(1).max(2000),
  requestVersion: z.number().int().positive(), text: z.string().trim().min(1).max(8000) }).strict()
const INLINE_CONTENT_LIMIT = 100_000
const runQuerySchema = z.object({
  period: z.literal('24h').optional(),
  companyId: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().max(200).optional(), cursor: z.string().max(5000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), sort: z.enum(['newest','oldest','id']).optional(),
  status: z.enum(['queued','leased','waiting','succeeded','partial','blocked','failed','cancelled']).optional(),
}).strict()

async function readAgentRun(id: string) {
  const runtime = await lingxiOSControl()
  const { items } = await runtime.listRuns({ id, limit: 1 })
  const run = items[0]
  return run ? { data: { ...run, diagnostics: await runtime.readDiagnostics(run.identity) } as Record<string, unknown>, sensitive: true } : null
}

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

adminRouter.use(educationRouter)

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
  const [counts, failures, recentAudit, dependencies, operations] = await Promise.allSettled([
    pool.query<{
      users: number
      companies: number
      projects: number
    }>(`SELECT
          (SELECT COUNT(*)::int FROM users WHERE deleted_at IS NULL) AS users,
          (SELECT COUNT(*)::int FROM companies WHERE status<>'DELETED') AS companies,
          (SELECT COUNT(*)::int FROM projects WHERE status<>'DELETED') AS projects`),
    pool.query<{ knowledge: number; notifications: number; deliveries: number }>(`SELECT
          (SELECT COUNT(*)::int FROM knowledge_source_jobs WHERE status='failed') AS knowledge,
          (SELECT COUNT(*)::int FROM notification_deliveries WHERE status='FAILED') AS notifications,
          (SELECT COUNT(*)::int FROM agent_native_event_outbox WHERE failed_at IS NOT NULL AND delivered_at IS NULL) +
          (SELECT COUNT(*)::int FROM lingxios_ingress_outbox WHERE failed_at IS NOT NULL AND delivered_at IS NULL) AS deliveries`),
    pool.query(`SELECT id,user_id,company_id,kind,detail,created_at
                  FROM audit_events ORDER BY created_at DESC,id DESC LIMIT 10`),
    platformApplication.dependencyReadiness(),
    lingxiOSControl().then(runtime => runtime.readOperations()),
  ])
  const count = counts.status === 'fulfilled' ? counts.value.rows[0] : null
  const failed = failures.status === 'fulfilled' ? failures.value.rows[0] : null
  const runtime = operations.status === 'fulfilled' ? operations.value : null
  response.json({
    counts: { users: count?.users ?? null, companies: count?.companies ?? null, projects: count?.projects ?? null,
      activeRuns: runtime?.active ?? null,
      failedJobs: failed && runtime ? failed.knowledge + failed.notifications + runtime.failures + runtime.failedDeliveries + runtime.failedUsageDeliveries + runtime.failedMemoryCaptures : null },
    attention: { runs: runtime?.failures ?? null, deliveries: failed?.deliveries ?? null,
      knowledge: failed?.knowledge ?? null, notifications: failed?.notifications ?? null },
    modules: { counts: counts.status, failures: failures.status, runtime: operations.status, dependencies: dependencies.status, audit: recentAudit.status },
    dependencies: dependencies.status === 'fulfilled' ? dependencies.value : null,
    recentAudit: recentAudit.status === 'fulfilled' ? recentAudit.value.rows : null,
    observedAt: new Date().toISOString(),
  })
}))

adminRouter.get('/observability', safe(async (request, response) => {
  const dashboard = await observabilityDashboard(await lingxiOSControl())
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
    pool.query(`SELECT 'users' AS resource,id,display_name AS label,email AS summary,CASE WHEN suspended_at IS NULL THEN 'active' ELSE 'suspended' END AS status
                  FROM users WHERE deleted_at IS NULL AND (email ILIKE $1 OR display_name ILIKE $1) LIMIT 5`, [pattern]),
    pool.query(`SELECT 'companies' AS resource,id,name AS label,slug AS summary,status
                  FROM companies WHERE name ILIKE $1 OR slug ILIKE $1 LIMIT 5`, [pattern]),
    pool.query(`SELECT 'projects' AS resource,p.id,p.name AS label,p.description AS summary,p.status,c.name AS company_name
                  FROM projects p LEFT JOIN companies c ON c.id=p.company_id WHERE p.name ILIKE $1 OR p.description ILIKE $1 LIMIT 5`, [pattern]),
    pool.query(`SELECT 'courses' AS resource,course.id,COALESCE(p.name,course.id) AS label,course.created_by AS summary,c.name AS company_name
                  FROM courses course LEFT JOIN projects p ON p.id=course.project_id LEFT JOIN companies c ON c.id=course.company_id WHERE course.id ILIKE $1 OR p.name ILIKE $1 OR course.created_by ILIKE $1 LIMIT 5`, [pattern]),
  ])
  response.json({ data: [...users.rows, ...companies.rows, ...projects.rows, ...courses.rows] })
}))

adminRouter.get('/resources/:resource', safe(async (request, response) => {
  if (request.params.resource === 'agent-deliveries') {
    const query = z.object({ companyId: z.string().max(200).optional(),cursor: z.string().max(100).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50), search: z.string().trim().max(200).optional(),
      sort: z.enum(['newest', 'oldest']).optional() }).strict().parse(request.query)
    response.json(await listNativeDeliveryFailures(pool,{ ...query,offset: cursorOffset(query.cursor) }))
    return
  }
  if (request.params.resource === 'agent-runs') {
    const parsed = runQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new HttpError(400, 'invalid run filters')
    const { companyId, sort, cursor, period, ...query } = parsed.data
    if (period && sort && sort !== "newest") throw new HttpError(400, "period requires newest order")
    const offset = cursorOffset(cursor)
    if (offset > 10000) throw new HttpError(400, 'run pagination is limited to 10000 rows; narrow the filters')
    const result = await (await lingxiOSControl()).listRuns({ ...query, tenantId: companyId, offset, order: sort })
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    const data = period ? result.items.filter(item => Date.parse(item.createdAt) >= cutoff) : result.items
    response.json({ data, nextCursor: result.nextCursor && data.length === result.items.length ? Buffer.from(String(offset + query.limit)).toString('base64url') : null })
    return
  }
  response.json(await listAdminResources(
    pool,
    String(request.params.resource),
    request.query as AdminListQuery,
  ))
}))

adminRouter.get('/runtime-metrics', safe(async (_request,response) => {
  response.type('text/plain; version=0.0.4').send((await lingxiOSControl()).metrics())
}))

adminRouter.post('/agent-runs/:id/delivery/:channel/retry', safe(async (request, response) => {
  const channel = z.enum(['message','events','usage']).parse(request.params.channel)
  const { reason } = reasonSchema.parse(request.body)
  const runtime = await lingxiOSControl()
  const result = await retryPlatformAgentDelivery(runtime, String(request.params.id), channel)
  const run = result.run
  await audit({ kind: 'platform_admin.delivery_retry', userId: identity(response).id, companyId: run.identity.tenantId,
    ...requestMetadata(request), detail: { runId: run.id, channel, reason } })
  response.json({ retried: result.retried })
}))

adminRouter.get('/agent-runs/:id/operations', safe(async (request, response) => {
  const afterSeq = z.coerce.number().int().nonnegative().safe().default(0).parse(request.query.afterSeq)
  response.json(await inspectPlatformAgentRun(await lingxiOSControl(), String(request.params.id), afterSeq))
}))

adminRouter.post('/agent-runs/:id/revise', safe(async (request, response) => {
  const { text } = revisionSchema.parse(request.body)
  const { revised } = await revisePlatformAgentRun(await lingxiOSControl(), String(request.params.id), text)
  response.json({ revised })
}))

adminRouter.post('/agent-runs/:id/continue', safe(async (request, response) => {
  const { inputId, requestVersion, text } = continuationSchema.parse(request.body)
  const { result } = await continuePlatformAgentRun(await lingxiOSControl(), String(request.params.id), { inputId, requestVersion, text })
  response.json(result)
}))

adminRouter.post('/agent-runs/:id/cancel', safe(async (request, response) => {
  commandSchema.parse(request.body)
  const { cancelled } = await cancelPlatformAgentRun(await lingxiOSControl(), String(request.params.id))
  response.json({ cancelled })
}))

adminRouter.get('/agent-runs/:id/approvals/:approvalId', safe(async (request, response) => {
  const { approval } = await platformAgentApproval(await lingxiOSControl(), String(request.params.id), String(request.params.approvalId))
  response.json(approval)
}))

adminRouter.post('/agent-runs/:id/approvals/:approvalId/resolve', safe(async (request, response) => {
  const input = commandSchema.extend({ approved: z.boolean() }).strict().parse(request.body)
  const { result } = await decidePlatformAgentApproval(await lingxiOSControl(), String(request.params.id), String(request.params.approvalId), input.approved)
  response.json(result)
}))

adminRouter.post('/agent-runs/:id/actions/:actionKey/reconcile', safe(async (request, response) => {
  commandSchema.parse(request.body)
  const { result } = await reconcilePlatformAgentAction(await lingxiOSControl(), String(request.params.id), String(request.params.actionKey))
  response.json(result)
}))

adminRouter.post('/agent-runtime/maintenance', safe(async (request, response) => {
  commandSchema.parse(request.body)
  response.json(await (await lingxiOSControl()).maintenance())
}))

adminRouter.post('/agent-deliveries/:id/retry', safe(async (request, response) => {
  const id = String(request.params.id), { reason } = reasonSchema.parse(request.body)
  const delivery = (await listNativeDeliveryFailures(pool,{ id,limit: 1 })).data[0]
  if (!delivery) throw new HttpError(404,'failed delivery not found')
  await audit({ kind: 'platform_admin.delivery_retry',userId: identity(response).id,companyId: String(delivery.company_id),
    ...requestMetadata(request),detail: { deliveryId: id,reason } })
  response.json({ retried: await retryNativeDelivery(pool,id) })
}))

adminRouter.get('/resources/:resource/:id/content/:field', safe(async (request, response) => {
  const resource = String(request.params.resource)
  const resourceId = String(request.params.id)
  const field = String(request.params.field)
  let raw: unknown
  if (resource === 'agent-runs') {
    raw = (await readAgentRun(resourceId))?.data[field]
  } else if (resource === 'documents' && field === 'body') {
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

adminRouter.get('/resources/:resource/:id/summary', safe(async (request, response) => {
  response.json(await resourceSummary(pool, String(request.params.resource), String(request.params.id)))
}))

adminRouter.get('/resources/:resource/:id', safe(async (request, response) => {
  const resource = String(request.params.resource)
  const resourceId = String(request.params.id)
  const result = resource === 'agent-runs' ? await readAgentRun(resourceId)
    : resource === 'agent-deliveries' ? { data: (await listNativeDeliveryFailures(pool,{ id: resourceId,limit: 1 })).data[0],sensitive: false }
    : await getAdminResource(pool, resource, resourceId)
  if (!result?.data) throw new HttpError(404, 'resource not found')
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
    if (action !== 'restore') {
      const { disconnectUserFromCompany } = await import('../../ws.js')
      const { rows } = await pool.query<{ company_id: string }>(
        `SELECT company_id FROM company_memberships WHERE user_id=$1`, [targetId],
      )
      for (const membership of rows) disconnectUserFromCompany(targetId, membership.company_id)
    }
    response.json(result)
  })
}

adminRouter.post('/users/:id/suspend', userLifecycle('suspend'))
adminRouter.post('/users/:id/restore', userLifecycle('restore'))
adminRouter.post('/users/:id/delete', userLifecycle('delete'))
