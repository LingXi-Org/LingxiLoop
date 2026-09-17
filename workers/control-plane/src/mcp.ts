import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import {
  komodoTargetNames,
  type KomodoEnv,
  type KomodoTargetName,
  inspectKomodoTarget,
  listKomodoTargets,
  listKomodoUpdates,
  readKomodoLogs,
  runKomodoStackAction,
} from './komodo'

type Identity = { authUserId: string; appUserId: string }
type AuthSettings = { sessionExpiresIn: number; otpExpiresIn: number; rateLimitWindow: number; rateLimitMax: number }
export type McpEnvironment = KomodoEnv & { DB: D1Database; APP_VERSION: string }
export type McpOperations = {
  platform(path: string, init?: RequestInit): Promise<Response>
  health(): Promise<unknown>
  authSettings(): Promise<unknown>
  updateAuthSettings(values: AuthSettings, reason: string): Promise<unknown>
  userLifecycle(appUserId: string, action: 'suspend' | 'restore' | 'delete', reason: string): Promise<unknown>
}

const reason = z.string().trim().min(1).max(280)
const requestId = z.string().uuid()
const targetName = z.enum(komodoTargetNames)
const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const
const mutating = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const
const sensitiveKey = /(?:authorization|cookie|password|secret|credential|api.?key|prompt|envContent|composeContent|overrideContent|includeFiles|environment$|token(?:Hash|Value)?$)/i
const maxOutput = 250_000

function redact(value: unknown, secrets: string[]): unknown {
  if (typeof value === 'string') {
    let text = value
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/(https?:\/\/)[^/\s@]+@/gi, '$1[REDACTED]@')
      .replace(/([?&](?:token|key|secret)=)[^&\s]+/gi, '$1[REDACTED]')
    for (const secret of secrets) if (secret?.length >= 8) text = text.replaceAll(secret, '[REDACTED]')
    return text
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? '[REDACTED]' : redact(item, secrets)]))
  }
  return value
}

function result(value: unknown, secrets: string[], isError = false) {
  const text = JSON.stringify(redact(value, secrets), null, 2) ?? 'null'
  return { content: [{ type: 'text' as const, text: text.length <= maxOutput ? text : `${text.slice(0, maxOutput)}\n[output truncated]` }], ...(isError ? { isError: true } : {}) }
}

async function boundedResponseText(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  while (text.length < 262_144) {
    const { done, value } = await reader.read()
    if (done) return text + decoder.decode()
    text += decoder.decode(value, { stream: true }).slice(0, 262_144 - text.length)
  }
  await reader.cancel()
  return text
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await boundedResponseText(response)
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 1000)}`)
  if (!text) return { ok: true, status: response.status }
  try { return JSON.parse(text) } catch { return text }
}

async function fingerprint(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)))
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function command(env: McpEnvironment, identity: Identity, input: { requestId: string; reason: string },
  action: string, resource: string, args: unknown, run: () => Promise<unknown>): Promise<unknown> {
  const hash = await fingerprint({ action, resource, args })
  const now = Date.now()
  const inserted = await env.DB.prepare(
    `INSERT OR IGNORE INTO control_audit(id,actor_user_id,action,resource,reason,detail,created_at) VALUES(?,?,?,?,?,?,?)`,
  ).bind(input.requestId, identity.authUserId, `mcp:${action}`, resource, input.reason,
    JSON.stringify({ fingerprint: hash, status: 'started' }), now).run()
  if (inserted.meta.changes !== 1) {
    const row = await env.DB.prepare(`SELECT action,resource,detail FROM control_audit WHERE id=?`).bind(input.requestId)
      .first<{ action: string; resource: string; detail: string }>()
    const detail = row ? JSON.parse(row.detail || '{}') as { fingerprint?: string; status?: string } : null
    if (!row || row.action !== `mcp:${action}` || row.resource !== resource || detail?.fingerprint !== hash) {
      throw new Error('requestId was already used for a different command')
    }
    return { replayed: true, status: detail.status ?? 'unknown' }
  }
  try {
    const value = await run()
    await env.DB.prepare(`UPDATE control_audit SET detail=? WHERE id=?`)
      .bind(JSON.stringify({ fingerprint: hash, status: 'succeeded' }), input.requestId).run()
    return value
  } catch (error) {
    await env.DB.prepare(`UPDATE control_audit SET detail=? WHERE id=?`)
      .bind(JSON.stringify({ fingerprint: hash, status: 'failed' }), input.requestId).run()
    throw error
  }
}

function query(parameters: Record<string, string | number | undefined>): string {
  const result = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) if (value !== undefined && value !== '') result.set(key, String(value))
  const text = result.toString()
  return text ? `?${text}` : ''
}

export async function handleMcpRequest(request: Request, env: McpEnvironment, identity: Identity,
  operations: McpOperations, secrets: string[]): Promise<Response> {
  const server = new McpServer({ name: 'lingxiloop-production-operations', version: env.APP_VERSION })
  const safe = <T>(handler: () => Promise<T>) => handler().then((value) => result(value, secrets), (error: unknown) => result({ error: error instanceof Error ? error.message : String(error) }, secrets, true))

  server.registerTool('lingxiloop_health', {
    description: 'Read public Web/API, dependency, version, Cloudflare Admin and Uptime Kuma health.', annotations: readOnly,
  }, () => safe(operations.health))

  server.registerTool('lingxiloop_admin_overview', {
    description: 'Read the existing Refine administrator session, resource catalog, dashboard, or observability view.',
    inputSchema: { view: z.enum(['session', 'resources', 'dashboard', 'observability']) }, annotations: readOnly,
  }, ({ view }) => safe(() => operations.platform(`/api/admin/${view}`).then(responseJson)))

  server.registerTool('lingxiloop_admin_search', {
    description: 'Search users, companies, projects, and courses through the existing Refine administrator API.',
    inputSchema: { query: z.string().trim().min(2).max(100) }, annotations: readOnly,
  }, ({ query: value }) => safe(() => operations.platform(`/api/admin/search?q=${encodeURIComponent(value)}`).then(responseJson)))

  server.registerTool('lingxiloop_admin_resource_list', {
    description: 'List any resource exposed by the Refine administrator resource catalog.',
    inputSchema: {
      resource: z.string().trim().min(1).max(100), cursor: z.string().max(5000).optional(), limit: z.number().int().min(1).max(100).default(50),
      sort: z.enum(['newest', 'oldest', 'id']).optional(), search: z.string().max(200).optional(), companyId: z.string().max(200).optional(),
      status: z.string().max(100).optional(), filters: z.record(z.string().max(100), z.string().max(500)).optional(),
    }, annotations: readOnly,
  }, ({ resource, filters, ...parameters }) => safe(async () => {
    if (filters && Object.keys(filters).length > 20) throw new Error('at most 20 filters are allowed')
    return responseJson(await operations.platform(`/api/admin/resources/${encodeURIComponent(resource)}${query({ ...parameters, ...filters })}`))
  }))

  server.registerTool('lingxiloop_admin_resource_get', {
    description: 'Read one Refine administrator resource record, including Agent run diagnostics.',
    inputSchema: { resource: z.string().trim().min(1).max(100), id: z.string().trim().min(1).max(500) }, annotations: readOnly,
  }, ({ resource, id }) => safe(() => operations.platform(`/api/admin/resources/${encodeURIComponent(resource)}/${encodeURIComponent(id)}`).then(responseJson)))

  server.registerTool('lingxiloop_admin_resource_content', {
    description: 'Read one bounded page of a large administrator resource field.',
    inputSchema: { resource: z.string().trim().min(1).max(100), id: z.string().trim().min(1).max(500), field: z.string().trim().min(1).max(100), cursor: z.string().max(5000).optional(), limit: z.number().int().min(1).max(250_000).default(100_000) }, annotations: readOnly,
  }, ({ resource, id, field, cursor, limit }) => safe(() => operations.platform(`/api/admin/resources/${encodeURIComponent(resource)}/${encodeURIComponent(id)}/content/${encodeURIComponent(field)}${query({ cursor, limit })}`).then(responseJson)))

  server.registerTool('lingxiloop_admin_conversation_messages', {
    description: 'Read bounded conversation history through the Refine administrator API.',
    inputSchema: { conversationId: z.string().trim().min(1).max(500), beforeSeq: z.number().int().nonnegative().optional(), limit: z.number().int().min(1).max(100).default(50) }, annotations: readOnly,
  }, ({ conversationId, ...parameters }) => safe(() => operations.platform(`/api/admin/conversations/${encodeURIComponent(conversationId)}/messages${query(parameters)}`).then(responseJson)))

  server.registerTool('lingxiloop_auth_settings', {
    description: 'Read the current locked and tunable Better Auth administrator settings.', annotations: readOnly,
  }, () => safe(operations.authSettings))

  server.registerTool('lingxiloop_auth_settings_update', {
    description: 'Update the same bounded Better Auth settings exposed by Refine.',
    inputSchema: { requestId, reason, sessionExpiresIn: z.number().int().min(3600).max(2_592_000), otpExpiresIn: z.number().int().min(60).max(1800), rateLimitWindow: z.number().int().min(10).max(3600), rateLimitMax: z.number().int().min(5).max(1000) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'auth_settings.update', 'better-auth:settings', input,
    () => operations.updateAuthSettings(input, input.reason))))

  server.registerTool('lingxiloop_user_lifecycle', {
    description: 'Suspend, restore, or delete a user through the existing coordinated auth/business lifecycle.',
    inputSchema: { requestId, reason, appUserId: z.string().trim().min(1).max(500), action: z.enum(['suspend', 'restore', 'delete']) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, `user.${input.action}`, `user:${input.appUserId}`, input,
    () => operations.userLifecycle(input.appUserId, input.action, input.reason))))

  server.registerTool('lingxiloop_agent_run_operations', {
    description: 'Inspect one Agent run and its ordered operations without executing another model turn.',
    inputSchema: { runId: z.string().trim().min(1).max(500), afterSeq: z.number().int().nonnegative().default(0) }, annotations: readOnly,
  }, ({ runId, afterSeq }) => safe(() => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(runId)}/operations?afterSeq=${afterSeq}`).then(responseJson)))

  server.registerTool('lingxiloop_agent_run_revise', {
    description: 'Revise an Agent run from new administrator text.',
    inputSchema: { requestId, reason, runId: z.string().trim().min(1).max(500), text: z.string().trim().min(1).max(8000) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.revise', `agent-run:${input.runId}`, input,
    () => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(input.runId)}/revise`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: input.requestId, reason: input.reason, text: input.text }) }).then(responseJson))))

  server.registerTool('lingxiloop_agent_run_continue', {
    description: 'Continue an Agent run that is waiting for structured input.',
    inputSchema: { requestId, reason, runId: z.string().trim().min(1).max(500), inputId: z.string().trim().min(1).max(2000), requestVersion: z.number().int().positive(), text: z.string().trim().min(1).max(8000) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.continue', `agent-run:${input.runId}`, input,
    () => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(input.runId)}/continue`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: input.requestId, reason: input.reason, inputId: input.inputId, requestVersion: input.requestVersion, text: input.text }) }).then(responseJson))))

  server.registerTool('lingxiloop_agent_run_cancel', {
    description: 'Cancel an active Agent run.',
    inputSchema: { requestId, reason, runId: z.string().trim().min(1).max(500) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.cancel', `agent-run:${input.runId}`, input,
    () => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(input.runId)}/cancel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: input.requestId, reason: input.reason }) }).then(responseJson))))

  server.registerTool('lingxiloop_agent_approval_get', {
    description: 'Read one pending Agent approval.',
    inputSchema: { runId: z.string().trim().min(1).max(500), approvalId: z.string().trim().min(1).max(500) }, annotations: readOnly,
  }, ({ runId, approvalId }) => safe(() => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(runId)}/approvals/${encodeURIComponent(approvalId)}`).then(responseJson)))

  server.registerTool('lingxiloop_agent_approval_resolve', {
    description: 'Approve or deny one pending Agent approval.',
    inputSchema: { requestId, reason, runId: z.string().trim().min(1).max(500), approvalId: z.string().trim().min(1).max(500), approved: z.boolean() }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.approval.resolve', `agent-run:${input.runId}:approval:${input.approvalId}`, input,
    () => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(input.runId)}/approvals/${encodeURIComponent(input.approvalId)}/resolve`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: input.requestId, reason: input.reason, approved: input.approved }) }).then(responseJson))))

  server.registerTool('lingxiloop_agent_action_reconcile', {
    description: 'Reconcile one committed Agent effect after an uncertain delivery.',
    inputSchema: { requestId, reason, runId: z.string().trim().min(1).max(500), actionKey: z.string().trim().min(1).max(500) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.action.reconcile', `agent-run:${input.runId}:action:${input.actionKey}`, input,
    () => operations.platform(`/api/admin/agent-runs/${encodeURIComponent(input.runId)}/actions/${encodeURIComponent(input.actionKey)}/reconcile`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: input.requestId, reason: input.reason }) }).then(responseJson))))

  server.registerTool('lingxiloop_agent_delivery_retry', {
    description: 'Retry a run message/event/usage delivery or a native failed delivery.',
    inputSchema: { requestId, reason, runId: z.string().trim().min(1).max(500).optional(), channel: z.enum(['message', 'events', 'usage']).optional(), deliveryId: z.string().trim().min(1).max(500).optional() }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.delivery.retry', `agent-delivery:${input.deliveryId ?? `${input.runId}:${input.channel}`}`, input, async () => {
    if (input.deliveryId && !input.runId && !input.channel) {
      return responseJson(await operations.platform(`/api/admin/agent-deliveries/${encodeURIComponent(input.deliveryId)}/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: input.reason }) }))
    }
    if (!input.deliveryId && input.runId && input.channel) {
      return responseJson(await operations.platform(`/api/admin/agent-runs/${encodeURIComponent(input.runId)}/delivery/${input.channel}/retry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: input.reason }) }))
    }
    throw new Error('provide either deliveryId, or both runId and channel')
  })))

  server.registerTool('lingxiloop_agent_runtime_maintenance', {
    description: 'Run the bounded LingxiOS maintenance pass.', inputSchema: { requestId, reason }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, 'agent.runtime.maintenance', 'agent-runtime', input,
    () => operations.platform('/api/admin/agent-runtime/maintenance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }).then(responseJson))))

  server.registerTool('lingxiloop_komodo_targets', {
    description: 'List the six exact LingxiLoop production targets available to this MCP.', annotations: readOnly,
  }, () => safe(async () => listKomodoTargets(env)))

  server.registerTool('lingxiloop_komodo_inspect', {
    description: 'Read Komodo stack, service, and action state for one allowlisted target.',
    inputSchema: { target: targetName }, annotations: readOnly,
  }, ({ target }) => safe(() => inspectKomodoTarget(env, target)))

  server.registerTool('lingxiloop_komodo_updates', {
    description: 'Read recent Komodo updates for an allowlisted stack.',
    inputSchema: { target: targetName, limit: z.number().int().min(1).max(100).default(30) }, annotations: readOnly,
  }, ({ target, limit }) => safe(() => listKomodoUpdates(env, target, limit)))

  server.registerTool('lingxiloop_komodo_logs', {
    description: 'Read a bounded, redacted snapshot of stack logs.',
    inputSchema: { target: targetName, service: z.string().trim().min(1).max(200).optional(), tail: z.number().int().min(1).max(1000).default(200) }, annotations: readOnly,
  }, (input) => safe(async () => {
    await env.DB.prepare(`INSERT INTO control_audit(id,actor_user_id,action,resource,detail,created_at) VALUES(?,?,?,?,?,?)`)
      .bind(crypto.randomUUID(), identity.authUserId, 'mcp:komodo.logs.read', `komodo:${input.target}`, JSON.stringify({ service: input.service ?? null, tail: input.tail }), Date.now()).run()
    return readKomodoLogs(env, input.target, input)
  }))

  server.registerTool('lingxiloop_komodo_stack_action', {
    description: 'Deploy, start, stop, or restart an allowlisted Komodo stack. Destruction and configuration edits are unavailable.',
    inputSchema: { requestId, reason, target: targetName, action: z.enum(['deploy', 'start', 'stop', 'restart']) }, annotations: mutating,
  }, (input) => safe(() => command(env, identity, input, `komodo.stack.${input.action}`, `komodo:${input.target}`, input,
    () => runKomodoStackAction(env, input.target as KomodoTargetName, input.action))))

  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
  await server.connect(transport)
  try { return await transport.handleRequest(request) } finally { await server.close() }
}
