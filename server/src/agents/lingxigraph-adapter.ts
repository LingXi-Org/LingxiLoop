import type { CliResult } from './cli-result.js'
import type { RuntimeTokenUsage } from './runtime/client.js'

export const LINGXIGRAPH_ACTION_LIMIT = 16

type Exact<T> = T

export type CommunicationAction =
  | Exact<{ type: 'message.send'; conversationId: string; body: string; quoteMessageId?: string }>
  | Exact<{ type: 'reaction.toggle'; messageId: string; emoji: string }>
  | Exact<{ type: 'conversation.dm.create'; participantId: string; topic: string; openingMessage: string }>
  | Exact<{ type: 'conversation.group.create'; title: string; memberIds: string[]; reason: string; openingMessage: string }>
  | Exact<{ type: 'conversation.member.invite'; conversationId: string; participantId: string }>
  | Exact<{ type: 'conversation.member.remove'; conversationId: string; participantId: string }>
  | Exact<{ type: 'conversation.leave'; conversationId: string }>
  | Exact<{ type: 'email.send'; to: string[]; cc?: string[]; subject: string; body: string }>
  | Exact<{ type: 'email.reply'; messageId: string; body: string; cc?: string[] }>
  | Exact<{ type: 'poll.create'; conversationId: string; question: string; options: string[]; mode?: 'single' | 'multi'; expiresInMinutes?: number }>
  | Exact<{ type: 'poll.vote'; messageId: string; optionIds: string[] }>
  | Exact<{ type: 'poll.close'; messageId: string }>

export interface LingxiGraphRunRequest {
  version: 1
  runId: string
  agent: { id: string; name: string; role: string; model: string }
  trigger?: 'message.new' | 'idle' | 'manual' | 'background_scan' | 'poll.updated'
  systemPrompt: string
  contextPrompt: string
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
}

export interface CommunicationExecutionResult {
  completed: boolean
  results: CliResult[]
  failedActionIndex?: number
  error?: string
}

const ACTION_KEYS: Record<CommunicationAction['type'], readonly string[]> = {
  'message.send': ['type', 'conversationId', 'body', 'quoteMessageId'],
  'reaction.toggle': ['type', 'messageId', 'emoji'],
  'conversation.dm.create': ['type', 'participantId', 'topic', 'openingMessage'],
  'conversation.group.create': ['type', 'title', 'memberIds', 'reason', 'openingMessage'],
  'conversation.member.invite': ['type', 'conversationId', 'participantId'],
  'conversation.member.remove': ['type', 'conversationId', 'participantId'],
  'conversation.leave': ['type', 'conversationId'],
  'email.send': ['type', 'to', 'cc', 'subject', 'body'],
  'email.reply': ['type', 'messageId', 'body', 'cc'],
  'poll.create': ['type', 'conversationId', 'question', 'options', 'mode', 'expiresInMinutes'],
  'poll.vote': ['type', 'messageId', 'optionIds'],
  'poll.close': ['type', 'messageId'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
    case 'conversation.group.create': return { type, title: stringField(raw, 'title')!, memberIds: stringArrayField(raw, 'memberIds')!, reason: stringField(raw, 'reason')!, openingMessage: stringField(raw, 'openingMessage')! }
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
    case 'conversation.group.create': return ['pull-group', action.title, '--members', action.memberIds.join(','), '--reason', action.reason, '--say', action.openingMessage]
    case 'conversation.member.invite': return ['invite', action.conversationId, action.participantId]
    case 'conversation.member.remove': return ['kick', action.conversationId, action.participantId]
    case 'conversation.leave': return ['leave', action.conversationId]
    case 'email.send': return ['email', 'send', '--to', action.to.join(','), ...(action.cc?.length ? ['--cc', action.cc.join(',')] : []), '--subject', action.subject, '--body', action.body]
    case 'email.reply': return ['email', 'reply', action.messageId, '--body', action.body, ...(action.cc?.length ? ['--cc', action.cc.join(',')] : [])]
    case 'poll.create': return ['poll', 'create', action.conversationId, action.question, ...action.options, '--mode', action.mode ?? 'single', ...(action.expiresInMinutes ? ['--expires-in', String(action.expiresInMinutes)] : [])]
    case 'poll.vote': return ['poll', 'vote', action.messageId, action.optionIds.join(',')]
    case 'poll.close': return ['poll', 'close', action.messageId]
  }
}

export async function executeCommunicationActions(
  actions: CommunicationAction[],
  executeCli: (argv: string[]) => Promise<CliResult>,
  timeoutMs = Number(process.env.LINGXIGRAPH_ACTION_TIMEOUT_MS ?? 30_000),
): Promise<CommunicationExecutionResult> {
  const results: CliResult[] = []
  for (let index = 0; index < actions.length; index++) {
    try {
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`communication action timed out after ${timeoutMs}ms`)), timeoutMs)
      })
      const result = await Promise.race([executeCli(communicationActionToArgv(actions[index])), timeout])
        .finally(() => { if (timer) clearTimeout(timer) })
      results.push(result)
      if (!result.ok || result.exitCode !== 0) return { completed: false, results, failedActionIndex: index, error: result.text }
    } catch (error) {
      return { completed: false, results, failedActionIndex: index, error: error instanceof Error ? error.message : String(error) }
    }
  }
  return { completed: true, results }
}

export async function runLingxiGraph(
  request: LingxiGraphRunRequest,
  options: LingxiGraphAdapterOptions = {},
): Promise<LingxiGraphRunResult> {
  const baseUrl = options.url ?? process.env.LINGXIGRAPH_URL
  if (!baseUrl) throw new Error('LINGXIGRAPH_URL is required to reach the LingxiGraph runtime')
  const token = options.token ?? process.env.LINGXIGRAPH_TOKEN
  const timeoutMs = options.timeoutMs ?? Number(process.env.LINGXIGRAPH_RUN_TIMEOUT_MS ?? 120_000)
  const doFetch = options.fetchImpl ?? fetch

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await doFetch(new URL('/v1/turn', baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`LingxiGraph runtime timed out after ${timeoutMs}ms`)
    }
    throw new Error(`LingxiGraph runtime request failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timer)
  }

  const bodyText = await response.text()
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
}
