import { createHash } from 'node:crypto'
import type { ActionLedgerPort } from './action-ledger.js'
import type { CliResult } from './cli-result.js'
import type { RuntimeTokenUsage } from './runtime/client.js'
import { parseSseStream } from './runtime/sse-parse.js'

export const LINGXIGRAPH_ACTION_LIMIT = 16

type Exact<T> = T

export type CommunicationAction =
  | Exact<{ type: 'message.send'; conversationId: string; body: string; quoteMessageId?: string }>
  | Exact<{ type: 'reaction.toggle'; messageId: string; emoji: string }>
  | Exact<{ type: 'conversation.dm.create'; participantId: string; topic: string; openingMessage: string }>
  | Exact<{ type: 'conversation.group.create'; title: string; memberIds: string[]; leaderId: string; reason: string; openingMessage: string }>
  | Exact<{ type: 'conversation.member.invite'; conversationId: string; participantId: string }>
  | Exact<{ type: 'conversation.member.remove'; conversationId: string; participantId: string }>
  | Exact<{ type: 'conversation.leave'; conversationId: string }>
  | Exact<{ type: 'email.send'; to: string[]; cc?: string[]; subject: string; body: string }>
  | Exact<{ type: 'email.reply'; messageId: string; body: string; cc?: string[] }>
  | Exact<{ type: 'poll.create'; conversationId: string; question: string; options: string[]; mode?: 'single' | 'multi'; expiresInMinutes?: number }>
  | Exact<{ type: 'poll.vote'; messageId: string; optionIds: string[] }>
  | Exact<{ type: 'poll.close'; messageId: string }>
  | Exact<{ type: 'document.create'; title: string; content?: string }>
  | Exact<{ type: 'document.read'; documentId: string }>
  | Exact<{ type: 'document.update'; documentId: string; find: string; replace: string }>
  | Exact<{ type: 'document.append'; documentId: string; content: string }>
  | Exact<{ type: 'document.share'; documentId: string; conversationId: string; comment?: string }>

export interface LingxiGraphRunRequest {
  version: 1
  runId: string
  agent: { id: string; name: string; role: string; model: string }
  trigger?: 'message.new' | 'idle' | 'manual' | 'background_scan' | 'poll.updated'
  systemPrompt: string
  contextPrompt: string
  /** Tenant is used only by LingxiGraph's explicitly enabled dev auth. */
  tenantId?: string
}

export interface LingxiGraphModelCall {
  model: string
  usage: RuntimeTokenUsage | null
}

export interface LingxiGraphRunResult {
  version: 1
  status: 'done' | 'needs_clarification' | 'blocked' | 'waiting'
  reason: string
  actions: CommunicationAction[]
  modelCalls: LingxiGraphModelCall[]
}

export interface LingxiGraphAdapterOptions {
  url?: string
  token?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Native provider deltas for message.send bodies from the runtime's NDJSON endpoint. */
  onMessageDelta?: (event: { actionIndex: number; conversationId: string; delta: string }) => void | Promise<void>
  onMessageReset?: () => void | Promise<void>
  /** Durable Runtime lifecycle events projected by the Runtime gateway. */
  onRunEvent?: (event: LingxiGraphRunEvent) => void | Promise<void>
  /** Use the official Run + SSE API instead of the removed stateless facade. */
  nativeRuns?: boolean
  assistantId?: string
  graphId?: string
  onRunAssigned?: (runtimeRunId: string) => void | Promise<void>
}

export type LingxiGraphRunEvent = {
  runId: string
  sequence: number
  kind: string
  data: Record<string, unknown>
}

export type LingxiGraphSteerResult = {
  outcome: 'accepted' | 'duplicate'
  eventId: string
  runId: string
  sequence: number
  status: 'pending' | 'delivered' | 'consumed' | 'superseded'
  kind: string
}

export class LingxiGraphRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'LingxiGraphRequestError'
  }
}

export interface LingxiGraphSteerRequest {
  runId: string
  kind: string
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
  idempotencyKey: string
}

export interface LingxiGraphRequestOptions {
  url?: string
  token?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  tenantId?: string | null
}

export async function getLingxiGraphRun(
  runId: string,
  tenantId: string | null,
  options: LingxiGraphRequestOptions = {},
): Promise<{ id: string; status: string; supersededByRunId: string | null }> {
  const baseUrl = options.url ?? process.env.LINGXIGRAPH_URL
  if (!baseUrl) throw new Error('LINGXIGRAPH_URL is required to reach the LingxiGraph runtime')
  const token = options.token ?? process.env.LINGXIGRAPH_TOKEN
  const controller = new AbortController()
  const timeoutMs = options.timeoutMs ?? 10_000
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await (options.fetchImpl ?? fetch)(new URL(`/v1/runs/${encodeURIComponent(runId)}`, baseUrl), {
      headers: graphHeaders(token, !token && tenantId ? { 'x-tenant-id': tenantId } : {}),
      signal: controller.signal,
    })
    const raw = await response.text()
    if (!response.ok) throw requestError(response.status, raw)
    const value = JSON.parse(raw) as Record<string, unknown>
    if (typeof value.id !== 'string' || typeof value.status !== 'string') {
      throw new LingxiGraphRequestError('invalid LingxiGraph run response schema', response.status, 'invalid_response', false)
    }
    return {
      id: value.id,
      status: value.status,
      supersededByRunId: typeof value.superseded_by_run_id === 'string' ? value.superseded_by_run_id : null,
    }
  } finally {
    clearTimeout(timer)
  }
}

function graphHeaders(token: string | undefined, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...extra,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

function tenantHeaders(request: LingxiGraphRunRequest, token: string | undefined): Record<string, string> {
  // Production tenant identity comes exclusively from the verified JWT. The
  // explicit header is only valid when no bearer token is configured (the
  // official Runtime's controlled insecure-dev mode).
  return !token && request.tenantId ? { 'x-tenant-id': request.tenantId } : {}
}

function problemDetails(raw: string, fallbackCode: string): { code: string; detail: string; retryable?: boolean } {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    return {
      code: typeof value.code === 'string' ? value.code : fallbackCode,
      detail: typeof value.detail === 'string' ? value.detail : raw,
      retryable: typeof value.retryable === 'boolean' ? value.retryable : undefined,
    }
  } catch {
    return { code: fallbackCode, detail: raw }
  }
}

function requestError(status: number, raw: string): LingxiGraphRequestError {
  const problem = problemDetails(raw, `http_${status}`)
  const retryable = problem.retryable ?? (status === 408 || status === 429 || status >= 500)
  return new LingxiGraphRequestError(
    `LingxiGraph runtime responded ${status}${problem.detail ? `: ${problem.detail}` : ''}`,
    status,
    problem.code,
    retryable,
  )
}

/**
 * Submit communication input to LingxiGraph's durable steering inbox.
 * The stable Loop message id travels in Idempotency-Key, so an ambiguous
 * network failure can be retried safely even after the run starts finalizing.
 */
export async function steerLingxiGraphRun(
  request: LingxiGraphSteerRequest,
  options: LingxiGraphRequestOptions = {},
): Promise<LingxiGraphSteerResult> {
  const baseUrl = options.url ?? process.env.LINGXIGRAPH_URL
  if (!baseUrl) throw new Error('LINGXIGRAPH_URL is required to reach the LingxiGraph runtime')
  const token = options.token ?? process.env.LINGXIGRAPH_TOKEN
  const timeoutMs = options.timeoutMs ?? Number(process.env.LINGXIGRAPH_STEER_TIMEOUT_MS ?? 10_000)
  const doFetch = options.fetchImpl ?? fetch
  let lastError: unknown

  // A retry is important here: the server may have durably accepted the row
  // while the 202 response was lost. LingxiGraph checks the idempotency key
  // before terminal/finalizing admission, so this retry returns that same row.
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await doFetch(new URL(`/v1/runs/${encodeURIComponent(request.runId)}/steer`, baseUrl), {
        method: 'POST',
        headers: graphHeaders(token, {
          'content-type': 'application/json',
          'idempotency-key': request.idempotencyKey,
        }),
        body: JSON.stringify({
          kind: request.kind,
          payload: request.payload,
          metadata: request.metadata ?? {},
        }),
        signal: controller.signal,
      })
      const raw = await response.text()
      if (!response.ok) {
        const error = requestError(response.status, raw)
        if (error.retryable && attempt === 0) { lastError = error; continue }
        throw error
      }
      let value: Record<string, unknown>
      try { value = JSON.parse(raw) as Record<string, unknown> } catch (error) {
        throw new LingxiGraphRequestError(
          `invalid LingxiGraph steering response: ${error instanceof Error ? error.message : String(error)}`,
          response.status,
          'invalid_response',
          false,
        )
      }
      if (typeof value.id !== 'string' || typeof value.run_id !== 'string' || typeof value.sequence !== 'number'
        || typeof value.kind !== 'string' || !['pending', 'delivered', 'consumed', 'superseded'].includes(String(value.status))) {
        throw new LingxiGraphRequestError('invalid LingxiGraph steering response schema', response.status, 'invalid_response', false)
      }
      return {
        // A replay can already be consumed/superseded. This distinction is
        // useful to routing observability; both refer to the same durable row.
        outcome: value.status === 'pending' ? 'accepted' : 'duplicate',
        eventId: value.id,
        runId: value.run_id,
        sequence: value.sequence,
        status: value.status as LingxiGraphSteerResult['status'],
        kind: value.kind,
      }
    } catch (error) {
      const normalized = error instanceof LingxiGraphRequestError
        ? error
        : error instanceof Error && error.name === 'AbortError'
          ? new LingxiGraphRequestError(`LingxiGraph steering timed out after ${timeoutMs}ms`, null, 'timeout', true)
          : new LingxiGraphRequestError(`LingxiGraph steering request failed: ${error instanceof Error ? error.message : String(error)}`, null, 'network_error', true)
      if (normalized.retryable && attempt === 0) { lastError = normalized; continue }
      throw normalized
    } finally {
      clearTimeout(timer)
    }
  }
  throw lastError
}

/** Read LingxiGraph's durable, resumable SSE event stream. */
export async function streamLingxiGraphRunEvents(
  runId: string,
  onEvent: (event: LingxiGraphRunEvent) => void | Promise<void>,
  options: LingxiGraphRequestOptions & { lastEventId?: number } = {},
): Promise<number> {
  const baseUrl = options.url ?? process.env.LINGXIGRAPH_URL
  if (!baseUrl) throw new Error('LINGXIGRAPH_URL is required to reach the LingxiGraph runtime')
  const token = options.token ?? process.env.LINGXIGRAPH_TOKEN
  const response = await (options.fetchImpl ?? fetch)(new URL(`/v1/runs/${encodeURIComponent(runId)}/stream`, baseUrl), {
    headers: graphHeaders(token, {
      ...(!token && options.tenantId ? { 'x-tenant-id': options.tenantId } : {}),
      accept: 'text/event-stream',
      ...(options.lastEventId ? { 'last-event-id': String(options.lastEventId) } : {}),
    }),
  })
  if (!response.ok) throw requestError(response.status, await response.text().catch(() => ''))
  if (!response.body) throw new LingxiGraphRequestError('LingxiGraph event stream had no body', response.status, 'invalid_response', true)
  let cursor = options.lastEventId ?? 0
  for await (const frame of parseSseStream(response.body as unknown as AsyncIterable<unknown>)) {
    if (!frame.data) continue
    let value: Record<string, unknown>
    try { value = JSON.parse(frame.data) as Record<string, unknown> } catch { continue }
    const sequence = typeof value.sequence === 'number' ? value.sequence : Number(frame.id)
    const eventRunId = typeof value.run_id === 'string' ? value.run_id : runId
    const kind = typeof value.kind === 'string' ? value.kind : frame.event
    if (!Number.isFinite(sequence) || !kind || eventRunId !== runId || sequence <= cursor) continue
    cursor = sequence
    const data = isRecord(value.data) ? value.data : {}
    await onEvent({ runId, sequence, kind, data })
  }
  return cursor
}

export interface CommunicationExecutionResult {
  completed: boolean
  results: CliResult[]
  failedActionIndex?: number
  error?: string
}

export const ACTION_KEYS: Record<CommunicationAction['type'], readonly string[]> = {
  'message.send': ['type', 'conversationId', 'body', 'quoteMessageId'],
  'reaction.toggle': ['type', 'messageId', 'emoji'],
  'conversation.dm.create': ['type', 'participantId', 'topic', 'openingMessage'],
  'conversation.group.create': ['type', 'title', 'memberIds', 'leaderId', 'reason', 'openingMessage'],
  'conversation.member.invite': ['type', 'conversationId', 'participantId'],
  'conversation.member.remove': ['type', 'conversationId', 'participantId'],
  'conversation.leave': ['type', 'conversationId'],
  'email.send': ['type', 'to', 'cc', 'subject', 'body'],
  'email.reply': ['type', 'messageId', 'body', 'cc'],
  'poll.create': ['type', 'conversationId', 'question', 'options', 'mode', 'expiresInMinutes'],
  'poll.vote': ['type', 'messageId', 'optionIds'],
  'poll.close': ['type', 'messageId'],
  'document.create': ['type', 'title', 'content'],
  'document.read': ['type', 'documentId'],
  'document.update': ['type', 'documentId', 'find', 'replace'],
  'document.append': ['type', 'documentId', 'content'],
  'document.share': ['type', 'documentId', 'conversationId', 'comment'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Stable, key-order-independent JSON serialization of a CommunicationAction —
 * uses the fixed field order from ACTION_KEYS rather than object insertion
 * order, so `{type,conversationId,body}` and `{body,type,conversationId}`
 * hash identically (issue #7, "canonical JSON key order 不影响 hash").
 */
export function canonicalActionJson(action: CommunicationAction): string {
  const record = action as unknown as Record<string, unknown>
  const keys = ACTION_KEYS[action.type]
  const parts = keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`)
  return `{${parts.join(',')}}`
}

/**
 * Stable scope key for "the input this turn actually processed" — sorted
 * message ids, not a timestamp, so a retried wake against the SAME inbox
 * produces the SAME scope (and a genuinely new message produces a
 * different one). See issue #7 §1.
 */
export function computeInputScopeKey(inputMessageIds: string[]): string {
  const sorted = [...inputMessageIds].sort()
  return createHash('sha256').update(sorted.join('\n')).digest('hex')
}

/**
 * Deterministic, LingxiLoop-generated (never model-controlled) idempotency
 * key for one action within one turn. Stable across retries of the same
 * (agent, input scope, index, action); changes when any of those change —
 * including a new inbox scope, so a new turn is free to repeat the same
 * content as a fresh, independent action. See issue #7 §1.
 */
export function computeActionKey(args: {
  agentId: string
  inputScopeKey: string
  actionIndex: number
  action: CommunicationAction
}): string {
  return createHash('sha256')
    .update('lingxiloop-action-v1')
    .update(args.agentId)
    .update(args.inputScopeKey)
    .update(String(args.actionIndex))
    .update(canonicalActionJson(args.action))
    .digest('hex')
}

/** P0 scope (issue #7): only these two action types carry a durable,
 *  crash-safe idempotency key all the way to the sink. Other action types
 *  still get ledger-level replay skipping, but no sink-level guarantee yet. */
const SINK_IDEMPOTENT_ACTION_TYPES = new Set<CommunicationAction['type']>(['message.send', 'reaction.toggle'])

function stringField(value: Record<string, unknown>, key: string, required = true): string | undefined {
  const raw = value[key]
  if (raw === undefined && !required) return undefined
  if (typeof raw !== 'string' || (required && raw.trim().length === 0)) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return raw
}

function stringArrayField(value: Record<string, unknown>, key: string, min = 1, required = true): string[] | undefined {
  const raw = value[key]
  if (raw === undefined && !required) return undefined
  if (!Array.isArray(raw) || raw.length < min || raw.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error(`${key} must be an array of at least ${min} non-empty strings`)
  }
  return raw as string[]
}

function assertExactKeys(value: Record<string, unknown>, type: CommunicationAction['type']): void {
  const allowed = new Set(ACTION_KEYS[type])
  const extra = Object.keys(value).filter((key) => !allowed.has(key))
  if (extra.length > 0) throw new Error(`${type} contains unsupported fields: ${extra.join(', ')}`)
}

export function parseCommunicationAction(raw: unknown): CommunicationAction {
  if (!isRecord(raw) || typeof raw.type !== 'string' || !(raw.type in ACTION_KEYS)) {
    throw new Error('unsupported communication action type')
  }
  const type = raw.type as CommunicationAction['type']
  assertExactKeys(raw, type)
  switch (type) {
    case 'message.send': return { type, conversationId: stringField(raw, 'conversationId')!, body: stringField(raw, 'body')!, ...(raw.quoteMessageId === undefined ? {} : { quoteMessageId: stringField(raw, 'quoteMessageId')! }) }
    case 'reaction.toggle': return { type, messageId: stringField(raw, 'messageId')!, emoji: stringField(raw, 'emoji')! }
    case 'conversation.dm.create': return { type, participantId: stringField(raw, 'participantId')!, topic: stringField(raw, 'topic')!, openingMessage: stringField(raw, 'openingMessage')! }
    case 'conversation.group.create': return { type, title: stringField(raw, 'title')!, memberIds: stringArrayField(raw, 'memberIds')!, leaderId: stringField(raw, 'leaderId')!, reason: stringField(raw, 'reason')!, openingMessage: stringField(raw, 'openingMessage')! }
    case 'conversation.member.invite': return { type, conversationId: stringField(raw, 'conversationId')!, participantId: stringField(raw, 'participantId')! }
    case 'conversation.member.remove': return { type, conversationId: stringField(raw, 'conversationId')!, participantId: stringField(raw, 'participantId')! }
    case 'conversation.leave': return { type, conversationId: stringField(raw, 'conversationId')! }
    case 'email.send': return { type, to: stringArrayField(raw, 'to')!, ...(raw.cc === undefined ? {} : { cc: stringArrayField(raw, 'cc', 1)! }), subject: stringField(raw, 'subject')!, body: stringField(raw, 'body')! }
    case 'email.reply': return { type, messageId: stringField(raw, 'messageId')!, body: stringField(raw, 'body')!, ...(raw.cc === undefined ? {} : { cc: stringArrayField(raw, 'cc', 1)! }) }
    case 'poll.create': {
      const mode = raw.mode
      if (mode !== undefined && mode !== 'single' && mode !== 'multi') throw new Error('mode must be single or multi')
      const expires = raw.expiresInMinutes
      if (expires !== undefined && (typeof expires !== 'number' || !Number.isFinite(expires) || expires <= 0)) throw new Error('expiresInMinutes must be positive')
      return { type, conversationId: stringField(raw, 'conversationId')!, question: stringField(raw, 'question')!, options: stringArrayField(raw, 'options', 2)!, ...(mode === undefined ? {} : { mode }), ...(expires === undefined ? {} : { expiresInMinutes: Number(expires) }) }
    }
    case 'poll.vote': return { type, messageId: stringField(raw, 'messageId')!, optionIds: stringArrayField(raw, 'optionIds')! }
    case 'poll.close': return { type, messageId: stringField(raw, 'messageId')! }
    case 'document.create': return { type, title: stringField(raw, 'title')!, ...(raw.content === undefined ? {} : { content: stringField(raw, 'content', false)! }) }
    case 'document.read': return { type, documentId: stringField(raw, 'documentId')! }
    case 'document.update': return { type, documentId: stringField(raw, 'documentId')!, find: stringField(raw, 'find')!, replace: stringField(raw, 'replace', false) ?? '' }
    case 'document.append': return { type, documentId: stringField(raw, 'documentId')!, content: stringField(raw, 'content')! }
    case 'document.share': return { type, documentId: stringField(raw, 'documentId')!, conversationId: stringField(raw, 'conversationId')!, ...(raw.comment === undefined ? {} : { comment: stringField(raw, 'comment', false)! }) }
  }
}

function parseUsage(raw: unknown): RuntimeTokenUsage | null {
  if (raw === null || raw === undefined) return null
  if (!isRecord(raw)) throw new Error('modelCalls usage must be an object or null')
  const number = (key: string): number => {
    const value = raw[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`usage.${key} must be non-negative`)
    return value
  }
  return {
    inputTokens: number('inputTokens'),
    cachedInputTokens: number('cachedInputTokens'),
    cacheCreationTokens: number('cacheCreationTokens'),
    outputTokens: number('outputTokens'),
  }
}

export function parseLingxiGraphRunResult(raw: unknown): LingxiGraphRunResult {
  if (!isRecord(raw)) throw new Error('LingxiGraph result must be an object')
  const allowed = new Set(['version', 'status', 'reason', 'actions', 'modelCalls'])
  const extra = Object.keys(raw).filter((key) => !allowed.has(key))
  if (extra.length > 0) throw new Error(`LingxiGraph result contains unsupported fields: ${extra.join(', ')}`)
  if (raw.version !== 1) throw new Error('LingxiGraph result version must be 1')
  if (!['done', 'needs_clarification', 'blocked', 'waiting'].includes(String(raw.status))) throw new Error('invalid LingxiGraph status')
  if (typeof raw.reason !== 'string') throw new Error('LingxiGraph reason must be a string')
  if (!Array.isArray(raw.actions) || raw.actions.length > LINGXIGRAPH_ACTION_LIMIT) throw new Error(`LingxiGraph actions must contain at most ${LINGXIGRAPH_ACTION_LIMIT} items`)
  if (!Array.isArray(raw.modelCalls)) throw new Error('LingxiGraph modelCalls must be an array')
  const modelCalls = raw.modelCalls.map((call) => {
    if (!isRecord(call) || Object.keys(call).some((key) => key !== 'model' && key !== 'usage')) throw new Error('invalid LingxiGraph modelCalls entry')
    return { model: stringField(call, 'model')!, usage: parseUsage(call.usage) }
  })
  return { version: 1, status: raw.status as LingxiGraphRunResult['status'], reason: raw.reason, actions: raw.actions.map(parseCommunicationAction), modelCalls }
}

export function communicationActionToArgv(action: CommunicationAction): string[] {
  switch (action.type) {
    case 'message.send': return ['reply', action.conversationId, action.body, ...(action.quoteMessageId ? ['--quote', action.quoteMessageId] : [])]
    case 'reaction.toggle': return ['react', action.messageId, action.emoji]
    case 'conversation.dm.create': return ['dm', action.participantId, action.topic, action.openingMessage]
    case 'conversation.group.create': return ['pull-group', action.title, '--members', action.memberIds.join(','), '--leader', action.leaderId, '--reason', action.reason, '--say', action.openingMessage]
    case 'conversation.member.invite': return ['invite', action.conversationId, action.participantId]
    case 'conversation.member.remove': return ['kick', action.conversationId, action.participantId]
    case 'conversation.leave': return ['leave', action.conversationId]
    case 'email.send': return ['email', 'send', '--to', action.to.join(','), ...(action.cc?.length ? ['--cc', action.cc.join(',')] : []), '--subject', action.subject, '--body', action.body]
    case 'email.reply': return ['email', 'reply', action.messageId, '--body', action.body, ...(action.cc?.length ? ['--cc', action.cc.join(',')] : [])]
    case 'poll.create': return ['poll', 'create', action.conversationId, action.question, ...action.options, '--mode', action.mode ?? 'single', ...(action.expiresInMinutes ? ['--expires-in', String(action.expiresInMinutes)] : [])]
    case 'poll.vote': return ['poll', 'vote', action.messageId, action.optionIds.join(',')]
    case 'poll.close': return ['poll', 'close', action.messageId]
    case 'document.create': return ['doc', 'create', action.title, ...(action.content ? ['--body', action.content] : [])]
    case 'document.read': return ['doc', 'read', action.documentId, '--json']
    case 'document.update': return ['doc', 'replace', action.documentId, '--find', action.find, '--replace', action.replace]
    case 'document.append': return ['doc', 'append', action.documentId, action.content]
    case 'document.share': return [
      'doc',
      'share',
      action.documentId,
      '--conversation',
      action.conversationId,
      ...(action.comment ? ['--comment', action.comment] : []),
    ]
  }
}

export interface CommunicationExecutionContext {
  /** The executing agent — first component of the idempotency key. */
  agentId: string
  /** Stable scope for "the input this turn is processing" — see
   *  computeInputScopeKey(). Same inbox retried ⇒ same scope ⇒ same
   *  action keys ⇒ replay-safe. New inbox ⇒ new scope ⇒ actions are
   *  free to repeat prior content as a legitimately new action. */
  inputScopeKey: string
  actions: CommunicationAction[]
  /** `internal` is the out-of-band idempotency channel (issue #7 review:
   *  argv is caller-controllable — a legacy bash-tool agent, human CLI, or
   *  BYOA pod could set an argv flag directly, letting them spoof or reuse
   *  a key across conversations). Only this executor ever populates it. */
  executeCli: (argv: string[], internal?: { idempotencyKey?: string; deferReadCursor?: boolean }) => Promise<CliResult>
  timeoutMs?: number
  /** Durable replay-detection ledger (Postgres-backed in production —
   *  see action-ledger.ts). Optional so callers/tests that don't care
   *  about idempotency can omit it; omitting it just means every retry
   *  re-executes for real. NOT consulted for the P0 sink-owned action
   *  types (message.send, reaction.toggle) — see the single-owner note
   *  below — only for other action types where no sink-level dedup
   *  exists yet. */
  ledger?: ActionLedgerPort
}

export async function executeCommunicationActions(
  ctx: CommunicationExecutionContext,
): Promise<CommunicationExecutionResult> {
  const timeoutMs = ctx.timeoutMs ?? Number(process.env.LINGXIGRAPH_ACTION_TIMEOUT_MS ?? 30_000)
  const results: CliResult[] = []
  for (let index = 0; index < ctx.actions.length; index++) {
    const action = ctx.actions[index]
    const key = computeActionKey({ agentId: ctx.agentId, inputScopeKey: ctx.inputScopeKey, actionIndex: index, action })
    // Single-owner rule (issue #7 review, P0-1): message.send and
    // reaction.toggle each own their idempotency key end-to-end inside
    // their OWN sink transaction (messages.idempotency_key's unique index;
    // tReact's claim+mutate+commit). This layer must NOT also claim the
    // same key via the generic ledger — doing so pre-inserts a 'pending'
    // row that the sink's own atomic claim then finds already taken,
    // self-conflicting on the very first (non-retry) execution. For these
    // two types we always call through and let the sink decide; for every
    // other action type (no sink-level dedup exists yet) the generic
    // ledger below is still the only protection, so it stays authoritative.
    const sinkOwned = SINK_IDEMPOTENT_ACTION_TYPES.has(action.type)
    try {
      if (ctx.ledger && !sinkOwned) {
        const claim = await ctx.ledger.claim({
          key,
          agentId: ctx.agentId,
          inputScopeKey: ctx.inputScopeKey,
          actionIndex: index,
          actionType: action.type,
          actionHash: canonicalActionJson(action),
        })
        if (!claim.claimed) {
          // Already succeeded — replay the stored result WITHOUT invoking
          // the real executor again (issue #7: "succeeded ledger replay
          // 不调用真实 executor").
          results.push(claim.result)
          continue
        }
      }
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`communication action timed out after ${timeoutMs}ms`)), timeoutMs)
      })
      const result = await Promise.race([
        ctx.executeCli(
          communicationActionToArgv(action),
          sinkOwned
            ? { idempotencyKey: key, ...(action.type === 'message.send' ? { deferReadCursor: true } : {}) }
            : undefined,
        ),
        timeout,
      ]).finally(() => { if (timer) clearTimeout(timer) })
      results.push(result)
      if (!result.ok || result.exitCode !== 0) {
        if (ctx.ledger && !sinkOwned) await ctx.ledger.markFailed(key, result.text).catch(() => { /* observability-only */ })
        return { completed: false, results, failedActionIndex: index, error: result.text }
      }
      if (ctx.ledger && !sinkOwned) await ctx.ledger.markSucceeded(key, result).catch(() => { /* observability-only */ })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (ctx.ledger && !sinkOwned) await ctx.ledger.markFailed(key, message).catch(() => { /* observability-only */ })
      return { completed: false, results, failedActionIndex: index, error: message }
    }
  }
  return { completed: true, results }
}

const assistantCache = new Map<string, string>()

async function runLingxiGraphNative(
  request: LingxiGraphRunRequest,
  options: LingxiGraphAdapterOptions,
): Promise<LingxiGraphRunResult> {
  const baseUrl = options.url ?? process.env.LINGXIGRAPH_URL
  if (!baseUrl) throw new Error('LINGXIGRAPH_URL is required to reach the LingxiGraph runtime')
  const token = options.token ?? process.env.LINGXIGRAPH_TOKEN
  const timeoutMs = options.timeoutMs ?? Number(process.env.LINGXIGRAPH_RUN_TIMEOUT_MS ?? 400_000)
  const originalFetch = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers = (extra: Record<string, string> = {}) => graphHeaders(token, {
    ...tenantHeaders(request, token),
    ...extra,
  })
  const doFetch: typeof fetch = ((input: Parameters<typeof fetch>[0], init?: RequestInit) => originalFetch(input, {
    ...init,
    signal: controller.signal,
  })) as typeof fetch
  const readJson = async (response: Response): Promise<Record<string, unknown>> => {
    const raw = await response.text()
    if (!response.ok) throw requestError(response.status, raw)
    try { return JSON.parse(raw) as Record<string, unknown> } catch (error) {
      throw new LingxiGraphRequestError(`invalid LingxiGraph runtime response: ${error instanceof Error ? error.message : String(error)}`, response.status, 'invalid_response', false)
    }
  }

  try {
    let assistantId = options.assistantId ?? process.env.LINGXIGRAPH_ASSISTANT_ID
    const graphId = options.graphId ?? process.env.LINGXIGRAPH_GRAPH_ID ?? 'lingxiloop-agent'
    if (!assistantId) {
      const cacheKey = `${baseUrl}\n${request.tenantId ?? ''}\n${graphId}`
      assistantId = assistantCache.get(cacheKey)
      if (!assistantId) {
        const listed = await readJson(await doFetch(new URL('/v1/assistants', baseUrl), { headers: headers() })) as unknown
        const assistants = Array.isArray(listed) ? listed as Array<Record<string, unknown>> : []
        const existing = assistants.find((item) => item.graph_id === graphId && item.name === 'LingxiLoop Runtime')
        if (typeof existing?.id === 'string') assistantId = existing.id
        else {
          const created = await readJson(await doFetch(new URL('/v1/assistants', baseUrl), {
            method: 'POST',
            headers: headers({ 'content-type': 'application/json' }),
            body: JSON.stringify({ graph_id: graphId, name: 'LingxiLoop Runtime', metadata: { owner: 'lingxiloop' } }),
          }))
          if (typeof created.id !== 'string') throw new LingxiGraphRequestError('assistant response did not contain id', 201, 'invalid_response', false)
          assistantId = created.id
        }
        assistantCache.set(cacheKey, assistantId)
      }
    }

    const created = await readJson(await doFetch(new URL('/v1/runs', baseUrl), {
      method: 'POST',
      headers: headers({ 'content-type': 'application/json', 'idempotency-key': `lingxiloop-run:${request.runId}` }),
      body: JSON.stringify({
        assistant_id: assistantId,
        input: request,
        metadata: {
          lingxiloop_run_id: request.runId,
          lingxiloop_agent_id: request.agent.id,
        },
        durability: 'sync',
        max_model_calls: 4,
        run_timeout: Math.max(1, Math.floor(timeoutMs / 1000)),
      }),
    }))
    if (typeof created.id !== 'string') throw new LingxiGraphRequestError('run response did not contain id', 202, 'invalid_response', false)
    const runtimeRunId = created.id
    await options.onRunAssigned?.(runtimeRunId)

    // The official stream is itself the low-latency output channel and the
    // durable steering lifecycle. Last-Event-ID makes reconnects safe; this
    // invocation normally needs one connection because the server closes it
    // only after terminal/paused state.
    await streamLingxiGraphRunEvents(runtimeRunId, async (event) => {
      await options.onRunEvent?.(event)
      if (event.kind !== 'custom') return
      const channel = event.data.channel
      const value = isRecord(event.data.value) ? event.data.value : null
      if (channel === 'message.delta' && value && typeof value.actionIndex === 'number'
        && typeof value.conversationId === 'string' && typeof value.delta === 'string') {
        await options.onMessageDelta?.({
          actionIndex: value.actionIndex,
          conversationId: value.conversationId,
          delta: value.delta,
        })
      } else if (channel === 'message.reset') {
        await options.onMessageReset?.()
      }
    }, { url: baseUrl, token, fetchImpl: doFetch })

    const finalRun = await readJson(await doFetch(new URL(`/v1/runs/${encodeURIComponent(runtimeRunId)}`, baseUrl), {
      headers: headers(),
    }))
    const status = String(finalRun.status ?? '')
    if (status !== 'succeeded') {
      const error = isRecord(finalRun.error) ? String(finalRun.error.message ?? finalRun.error.code ?? status) : status
      throw new LingxiGraphRequestError(`LingxiGraph run ${runtimeRunId} ended ${status}: ${error}`, 200, `run_${status || 'unknown'}`, false)
    }
    const output = isRecord(finalRun.output) ? finalRun.output : null
    const result = output && isRecord(output.result) ? output.result : output
    return parseLingxiGraphRunResult(result)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LingxiGraphRequestError(`LingxiGraph runtime timed out after ${timeoutMs}ms`, null, 'timeout', true)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function runLingxiGraph(
  request: LingxiGraphRunRequest,
  options: LingxiGraphAdapterOptions = {},
): Promise<LingxiGraphRunResult> {
  if (options.nativeRuns) return runLingxiGraphNative(request, options)
  const baseUrl = options.url ?? process.env.LINGXIGRAPH_URL
  if (!baseUrl) throw new Error('LINGXIGRAPH_URL is required to reach the LingxiGraph runtime')
  const token = options.token ?? process.env.LINGXIGRAPH_TOKEN
  const timeoutMs = options.timeoutMs ?? Number(process.env.LINGXIGRAPH_RUN_TIMEOUT_MS ?? 120_000)
  const doFetch = options.fetchImpl ?? fetch

  // The timer must stay armed for the full request lifecycle — fetch()
  // resolves as soon as headers arrive, so a controller aborted only
  // around the initial await would leave a slow/stuck response body
  // free to hang the agent turn forever. clearTimeout only runs once
  // headers, body, and parsing have all completed (success or error).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const asTimeoutOrRequestError = (error: unknown): Error =>
    error instanceof Error && error.name === 'AbortError'
      ? new Error(`LingxiGraph runtime timed out after ${timeoutMs}ms`)
      : new Error(`LingxiGraph runtime request failed: ${error instanceof Error ? error.message : String(error)}`)

  try {
    let response: Response
    try {
      response = await doFetch(new URL(options.onMessageDelta || options.onRunEvent ? '/v1/turn/stream' : '/v1/turn', baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })
    } catch (error) {
      throw asTimeoutOrRequestError(error)
    }

    if (options.onMessageDelta || options.onRunEvent) {
      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`LingxiGraph runtime responded ${response.status}${errorText ? `: ${errorText}` : ''}`)
      }
      if (!response.body) throw new Error('LingxiGraph streaming response had no body')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffered = ''
      let finalResult: unknown = null
      while (true) {
        const { done, value } = await reader.read()
        buffered += decoder.decode(value, { stream: !done })
        const lines = buffered.split('\n')
        buffered = done ? '' : (lines.pop() ?? '')
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as {
            type?: string; actionIndex?: number; conversationId?: string; delta?: string; result?: unknown; error?: string
            runId?: string; sequence?: number; kind?: string; data?: Record<string, unknown>
          }
          if (event.type === 'error') throw new Error(`LingxiGraph runtime stream failed: ${event.error ?? 'unknown error'}`)
          if (event.type === 'message.delta' && typeof event.actionIndex === 'number' && typeof event.conversationId === 'string') {
            await options.onMessageDelta?.({ actionIndex: event.actionIndex, conversationId: event.conversationId, delta: event.delta ?? '' })
          } else if (event.type === 'runtime.event' && typeof event.runId === 'string'
            && typeof event.sequence === 'number' && typeof event.kind === 'string') {
            await options.onRunEvent?.({ runId: event.runId, sequence: event.sequence, kind: event.kind, data: event.data ?? {} })
          } else if (event.type === 'result') {
            finalResult = event.result
          }
        }
        if (done) break
      }
      if (finalResult === null) throw new Error('LingxiGraph runtime stream ended without a result')
      return parseLingxiGraphRunResult(finalResult)
    }

    let bodyText: string
    try {
      bodyText = await response.text()
    } catch (error) {
      throw asTimeoutOrRequestError(error)
    }

    if (!response.ok) {
      throw new Error(`LingxiGraph runtime responded ${response.status}${bodyText ? `: ${bodyText}` : ''}`)
    }
    let parsedBody: unknown
    try {
      parsedBody = JSON.parse(bodyText)
    } catch (error) {
      throw new Error(`invalid LingxiGraph runtime response: ${error instanceof Error ? error.message : String(error)}`)
    }
    try {
      return parseLingxiGraphRunResult(parsedBody)
    } catch (error) {
      throw new Error(`invalid LingxiGraph runtime response: ${error instanceof Error ? error.message : String(error)}`)
    }
  } finally {
    clearTimeout(timer)
  }
}
