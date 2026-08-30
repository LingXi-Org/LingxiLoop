import type { EvalCitationObservation, EvalObservation } from './contracts.js'

const REDACTED = '[redacted]'
const SENSITIVE_KEY = /(?:password|secret|token|authorization|cookie|excerpt|content|body|code|html|markdown|stdout|stderr|payload|messages?)/i
const SECRET_VALUE = /(?:bearer\s+[a-z0-9._~+/=-]+|sk-[a-z0-9_-]{8,}|whsec_[a-z0-9+/=_-]{8,})/gi
const KNOWLEDGE_METADATA_KEYS = new Set([
  'id', 'sourceId', 'chunkId', 'marker', 'title', 'sourceTitle', 'status', 'kind',
  'position', 'count', 'ok', 'deleted', 'enabled', 'revision', 'citations', 'results',
])

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function unwrapHostActionValue(result: unknown): unknown {
  const wrapper = record(result)
  return wrapper.__hostActionResult === true && 'value' in wrapper ? wrapper.value : result
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') {
    const bounded = value.length > 500 ? `${value.slice(0, 500)}…` : value
    return bounded.replace(SECRET_VALUE, REDACTED)
  }
  if (depth >= 4) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1))
  const source = record(value)
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(source).slice(0, 30)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitizeValue(item, depth + 1)
  }
  return output
}

function sanitizeKnowledgeValue(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}…` : value
  if (depth >= 4) return '[truncated]'
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeKnowledgeValue(item, depth + 1))
  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record(value))) {
    if (!KNOWLEDGE_METADATA_KEYS.has(key)) continue
    output[key === 'sourceTitle' ? 'title' : key] = sanitizeKnowledgeValue(item, depth + 1)
  }
  return output
}

function citationFrom(value: unknown): EvalCitationObservation | null {
  const item = record(value)
  const sourceId = typeof item.sourceId === 'string' ? item.sourceId : ''
  if (!sourceId) return null
  return {
    sourceId,
    ...(typeof item.chunkId === 'string' ? { chunkId: item.chunkId } : {}),
    ...(typeof item.marker === 'string' ? { marker: item.marker } : {}),
    ...(typeof item.title === 'string' ? { title: item.title } :
      typeof item.sourceTitle === 'string' ? { title: item.sourceTitle } : {}),
  }
}

export function extractKnowledgeCitations(action: string, result: unknown): EvalCitationObservation[] {
  if (action !== 'knowledge.search') return []
  const value = unwrapHostActionValue(result)
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(record(value).citations)
      ? record(value).citations as unknown[]
      : Array.isArray(record(value).results)
        ? record(value).results as unknown[]
        : []
  return candidates.flatMap((candidate) => {
    const citation = citationFrom(candidate)
    return citation ? [citation] : []
  })
}

export function dedupeCitations(citations: EvalCitationObservation[]): EvalCitationObservation[] {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = `${citation.sourceId}\u0000${citation.chunkId ?? ''}\u0000${citation.marker ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function sanitizeHostActionArgs(action: string, args: unknown): unknown {
  if (action === 'knowledge.search') {
    const input = record(args)
    return {
      ...(typeof input.query === 'string' ? { query: input.query.slice(0, 500) } : {}),
      ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
    }
  }
  return sanitizeValue(args)
}

export function sanitizeHostActionResult(action: string, result: unknown): unknown {
  const value = unwrapHostActionValue(result)
  if (action === 'knowledge.search') return { citations: extractKnowledgeCitations(action, result) }
  if (action.startsWith('knowledge.')) return sanitizeKnowledgeValue(value)
  return sanitizeValue(value)
}

/** Removes message bodies and secret-bearing trace fields before an Eval observation
 * is returned in a report or handed to the persistence boundary. */
export function sanitizeEvalObservation(observation: EvalObservation): EvalObservation {
  return {
    ...(observation.input !== undefined ? { input: REDACTED } : {}),
    ...(observation.answer !== undefined ? { answer: REDACTED } : {}),
    ...(observation.retrievedSourceIds ? { retrievedSourceIds: [...observation.retrievedSourceIds] } : {}),
    ...(observation.citedSourceIds ? { citedSourceIds: [...observation.citedSourceIds] } : {}),
    ...(observation.citations ? { citations: observation.citations.map((citation) => ({ ...citation })) } : {}),
    ...(observation.toolCalls ? {
      toolCalls: observation.toolCalls.map((call) => ({
        ...call,
        ...(call.args !== undefined ? { args: sanitizeHostActionArgs(call.name, call.args) } : {}),
        ...(call.result !== undefined ? { result: sanitizeHostActionResult(call.name, call.result) } : {}),
      })),
    } : {}),
    ...(observation.agentTurns ? {
      agentTurns: observation.agentTurns.map((turn) => ({
        ...turn,
        ...(turn.error ? { error: String(sanitizeValue(turn.error)) } : {}),
      })),
    } : {}),
    ...(observation.approvals ? { approvals: observation.approvals.map((approval) => ({ ...approval })) } : {}),
    ...(observation.artifacts ? { artifacts: observation.artifacts.map((artifact) => ({ ...artifact })) } : {}),
    ...(observation.trace ? {
      trace: observation.trace.map((event) => ({
        ...event,
        ...(event.input !== undefined ? { input: event.kind === 'input' ? REDACTED : sanitizeValue(event.input) } : {}),
        ...(event.output !== undefined ? { output: sanitizeValue(event.output) } : {}),
        ...(event.metadata ? { metadata: record(sanitizeValue(event.metadata)) } : {}),
      })),
    } : {}),
    ...(observation.taskCompletion ? { taskCompletion: { ...observation.taskCompletion } } : {}),
    ...(observation.policyViolations ? {
      policyViolations: observation.policyViolations.map((violation) => String(sanitizeValue(violation))),
    } : {}),
    ...(observation.latencyMs !== undefined ? { latencyMs: observation.latencyMs } : {}),
    ...(observation.tokenCount !== undefined ? { tokenCount: observation.tokenCount } : {}),
    ...(observation.costUsd !== undefined ? { costUsd: observation.costUsd } : {}),
    ...(observation.error !== undefined ? { error: String(sanitizeValue(observation.error)) } : {}),
    ...(observation.metadata ? { metadata: record(sanitizeValue(observation.metadata)) } : {}),
  }
}

export function sanitizeEvalMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  return record(sanitizeValue(metadata ?? {}))
}
