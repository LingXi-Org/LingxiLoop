import { Router } from 'express'
import { z } from 'zod'
import type { RunRecord } from '@lyyzka/lingxios'
import { lingxiOSControl } from '../../agent-runtime/runtime.js'
import { pool } from '../../db/pool.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { imMessagesApplication } from '../../im/messages-facade.js'
import { readDocumentText } from '../documents/public.js'
import { audit } from '../identity/public.js'
import { companiesRouter } from '../companies/router.js'
import { projectsRouter } from '../projects/router.js'
import type { PermissionAction } from '../access/public.js'
import { requirePlatformAdmin } from './authorization.js'
import { companyManagementSession, requireCompanyAdmin, type CompanyAdmin } from './company-authorization.js'
import { COMPANY_RESOURCES, companyResource, companyResourceList } from './company-resources.js'
import { adminResourceCatalog, cursorOffset, type AdminListQuery } from './resources.js'

export const managementRouter = Router()
managementRouter.get('/session', safe(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.gatewayPlatformAdmin) {
    res.json({ mode: 'platform', companyId: null, user: await requirePlatformAdmin(pool, req), capabilities: { crossTenantRead: true } })
  } else res.json({ ...await companyManagementSession(await requireCompanyAdmin(pool, req)), resources: COMPANY_RESOURCES })
}))

export const companyAdminRouter = Router()
companyAdminRouter.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  void requireCompanyAdmin(pool, req).then(admin => { res.locals.companyAdmin = admin; next() }, next)
})
const identity = (res: { locals: Record<string, unknown> }) => res.locals.companyAdmin as CompanyAdmin
companyAdminRouter.use('/business', (req, res, next) => {
  const match = /^\/(companies|projects)\/([^/]+)(?:\/|$)/.exec(req.path)
  if (!match) { next(new HttpError(404, 'command not available')); return }
  const admin = identity(res)
  if (match[1] === 'companies') {
    if (decodeURIComponent(match[2]) !== admin.companyId) { next(new HttpError(404, 'company not accessible')); return }
    next()
  } else void companyResource(pool, admin, 'projects', decodeURIComponent(match[2])).then(() => next(), next)
}, companiesRouter, projectsRouter)
companyAdminRouter.get('/session', safe(async (_req, res) => { res.json(await companyManagementSession(identity(res))) }))
companyAdminRouter.get('/resources', (_req, res) => res.json({ data: adminResourceCatalog().filter(item => COMPANY_RESOURCES.includes(item.name)) }))

async function runAllowed(admin: CompanyAdmin, run: RunRecord, action: 'conversation:read' | 'agent_run:control' = 'conversation:read') {
  if (run.identity.tenantId !== admin.companyId) return false
  const binding = (await pool.query<{ conversation_id: string }>(`SELECT conversation_id FROM agent_run_bindings
    WHERE run_id=$1 AND company_id=$2 AND session_id=$3 AND agent_id=$4 AND principal_id=$5 AND thread_id IS NOT DISTINCT FROM $6 AND NOT internal`,
  [run.id, admin.companyId, run.identity.sessionId, run.identity.agentId, run.identity.principalId, run.identity.threadId ?? null])).rows[0]
  if (!binding) return false
  return (await admin.permissions.can({ actorUserId: admin.user.id, companyId: admin.companyId, action, resource: { type: 'conversation', id: binding.conversation_id } })).allowed
}
async function readRun(admin: CompanyAdmin, id: string, action: 'conversation:read' | 'agent_run:control' = 'conversation:read') {
  const runtime = await lingxiOSControl()
  const run = (await runtime.listRuns({ tenantId: admin.companyId, id, limit: 1 })).items[0]
  if (!run || !await runAllowed(admin, run, action)) throw new HttpError(404, 'run not accessible')
  return { runtime, run }
}
const runFilters = z.object({ companyId: z.string().optional(), search: z.string().max(200).optional(), cursor: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50), sort: z.enum(['newest', 'oldest', 'id']).optional(),
  status: z.enum(['queued', 'leased', 'waiting', 'succeeded', 'partial', 'blocked', 'failed', 'cancelled']).optional(), period: z.literal('24h').optional() }).strict()
async function list(admin: CompanyAdmin, resource: string, query: AdminListQuery) {
  if (resource !== 'agent-runs') return companyResourceList(pool, admin, resource, query)
  const parsed = runFilters.parse(query)
  if (parsed.companyId && parsed.companyId !== admin.companyId) throw new HttpError(404, 'company not accessible')
  const runtime = await lingxiOSControl(), data: RunRecord[] = []
  const start = cursorOffset(parsed.cursor)
  let offset = 0, total = 0, more = false
  do {
    const page = await runtime.listRuns({ tenantId: admin.companyId, search: parsed.search, status: parsed.status, order: parsed.sort, offset, limit: 100 })
    for (const run of page.items) {
      if (parsed.period && Date.parse(run.createdAt) < Date.now() - 86_400_000) continue
      if (await runAllowed(admin, run)) { if (total >= start && data.length < parsed.limit) data.push(run); total++ }
    }
    offset += page.items.length; more = !!page.nextCursor
    if (more && offset >= 10_000) throw new HttpError(503, 'narrow the run filters')
  } while (more)
  return { data, total, nextCursor: total > start + parsed.limit ? Buffer.from(String(start + parsed.limit)).toString('base64url') : null }
}
companyAdminRouter.get('/resources/:resource', safe(async (req, res) => { res.json(await list(identity(res), String(req.params.resource), req.query as AdminListQuery)) }))

async function detail(admin: CompanyAdmin, resource: string, id: string): Promise<Record<string, unknown>> {
  if (resource === 'agent-runs') { const { run, runtime } = await readRun(admin, id); return { ...run, diagnostics: await runtime.readDiagnostics(run.identity), management_actions: await runAllowed(admin, run, 'agent_run:control') ? ['retry'] : [] } }
  const row = await companyResource(pool, admin, resource, id)
  if (resource === 'documents') row.body = await readDocumentText(id, admin.companyId)
  if (resource === 'companies' || resource === 'projects') {
    const actions: Array<[string, PermissionAction]> = resource === 'companies'
      ? [['activate', 'company:activate'], ['enter-read-only', 'company:enter_read_only'], ['archive', 'company:archive']]
      : [['activate', 'project:activate'], ['end', 'project:end'], ['enter-read-only', 'project:enter_read_only'], ['archive', 'project:archive']]
    row.management_actions = (await Promise.all(actions.map(async ([name, action]) =>
      (await admin.permissions.can({ actorUserId: admin.user.id, companyId: admin.companyId, ...(resource === 'projects' ? { projectId: id } : {}), action })).allowed ? name : null))).filter(Boolean)
  }
  return row
}
async function recordRead(admin: CompanyAdmin, resource: string, id: string) {
  await audit({ kind: 'company_admin.read', userId: admin.user.id, companyId: admin.companyId, detail: { resource, resourceId: id } })
}
companyAdminRouter.get('/resources/:resource/:id/content/:field', safe(async (req, res) => {
  const admin = identity(res), resource = String(req.params.resource), id = String(req.params.id), field = String(req.params.field)
  const row = await detail(admin, resource, id)
  if (!Object.hasOwn(row, field)) throw new HttpError(404, 'field not accessible')
  const raw = row[field], content = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
  const offset = cursorOffset(req.query.cursor as string | undefined), limit = Number(req.query.limit ?? 100_000)
  if (!Number.isInteger(limit) || limit < 1 || limit > 250_000) throw new HttpError(400, 'invalid limit')
  await recordRead(admin, resource, id)
  res.json({ data: content.slice(offset, offset + limit), encoding: typeof raw === 'string' ? 'text' : 'json', length: content.length, nextCursor: offset + limit < content.length ? Buffer.from(String(offset + limit)).toString('base64url') : null })
}))
companyAdminRouter.get('/resources/:resource/:id/summary', safe(async (req, res) => {
  const admin = identity(res), resource = String(req.params.resource), id = String(req.params.id)
  await detail(admin, resource, id)
  const related = resource === 'companies' ? ['company-memberships', 'projects', 'education-contracts', 'organization-seats'] : resource === 'projects' ? ['project-memberships', 'courses', 'learning-activities', 'knowledge-sources'] : resource === 'users' ? ['company-memberships', 'project-memberships'] : []
  const filter = resource === 'companies' ? { companyId: id } : resource === 'projects' ? { projectId: id } : { userId: id }
  res.json({ metrics: await Promise.all(related.map(async name => ({ label: adminResourceCatalog().find(item => item.name === name)?.label, resource: name, value: (await list(admin, name, filter)).total }))) })
}))
companyAdminRouter.get('/resources/:resource/:id', safe(async (req, res) => {
  const admin = identity(res), resource = String(req.params.resource), id = String(req.params.id)
  const row = await detail(admin, resource, id)
  await recordRead(admin, resource, id)
  for (const [field, value] of Object.entries(row)) {
    const content = typeof value === 'string' ? value : value && typeof value === 'object' ? JSON.stringify(value) : ''
    if (content.length > 100_000) row[field] = { truncated: true, length: content.length, contentUrl: `/admin/resources/${encodeURIComponent(resource)}/${encodeURIComponent(id)}/content/${encodeURIComponent(field)}` }
  }
  res.json(row)
}))
companyAdminRouter.get('/search', safe(async (req, res) => {
  const search = z.string().trim().min(2).max(200).parse(req.query.q), admin = identity(res)
  const groups = await Promise.all(['users', 'companies', 'projects', 'courses'].map(async resource =>
    (await companyResourceList(pool, admin, resource, { search, limit: '20' })).data.map(row => ({ resource, id: row.id, label: row.name ?? row.display_name ?? row.title ?? row.id, company_name: admin.user.company_name }))))
  res.json({ data: groups.flat() })
}))
companyAdminRouter.get('/dashboard', safe(async (_req, res) => {
  const admin = identity(res)
  const metrics = await Promise.all(['users', 'projects', 'knowledge-sources', 'llm-calls'].map(async resource => ({ resource, label: adminResourceCatalog().find(item => item.name === resource)?.label, value: (await list(admin, resource, { limit: '1' })).total })))
  res.json({ companyId: admin.companyId, companyName: admin.user.company_name, metrics })
}))
companyAdminRouter.get('/usage', safe(async (_req, res) => {
  res.json((await companyResourceList(pool, identity(res), 'llm-calls', { limit: '1' })).usage)
}))
companyAdminRouter.get('/conversations/:id/messages', safe(async (req, res) => {
  const admin = identity(res), id = String(req.params.id)
  await companyResource(pool, admin, 'conversations', id)
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(req.query.limit)
  const beforeSequence = z.coerce.number().int().nonnegative().default(0).parse(req.query.beforeSeq)
  const messages = await imMessagesApplication.history({ companyId: admin.companyId, userId: admin.user.id, channelId: id, limit, beforeSequence })
  if (!messages) throw new HttpError(404, 'conversation not accessible')
  await recordRead(admin, 'conversations', id)
  res.json(messages)
}))
companyAdminRouter.post('/agent-runs/:id/delivery/:channel/retry', safe(async (req, res) => {
  const reason = z.string().trim().min(1).max(280).parse(req.body?.reason)
  const channel = z.enum(['message', 'events', 'usage']).parse(req.params.channel)
  const admin = identity(res), { run, runtime } = await readRun(admin, String(req.params.id), 'agent_run:control')
  await audit({ kind: 'company_admin.retry', userId: admin.user.id, companyId: admin.companyId, detail: { runId: run.id, channel, reason } })
  res.json({ retried: await runtime.retryDelivery(run.identity, channel), run })
}))
