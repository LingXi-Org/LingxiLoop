import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import type { AssistantStreamChunk } from 'assistant-stream'
import type { ReadonlyJSONObject } from 'assistant-stream/utils'
import type { ActiveAgentRun } from './store'

const DEFAULT_SEQUENCE_LIMIT = 2_000
const finishedToolArgs = new WeakSet<object>()

function parseToolArgs(text: string): ReadonlyJSONObject {
  const value: unknown = JSON.parse(text)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Assistant stream tool arguments must be a JSON object')
  }
  return value as ReadonlyJSONObject
}

export class StreamSequenceTracker {
  private readonly latest = new Map<string, number>()

  constructor(private readonly limit = DEFAULT_SEQUENCE_LIMIT) {}

  accept(messageId: string, sequence: number): boolean {
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new Error(`Invalid assistant stream sequence: ${sequence}`)
    }
    const previous = this.latest.get(messageId)
    if (previous !== undefined && sequence <= previous) return false
    this.latest.delete(messageId)
    this.latest.set(messageId, sequence)
    if (this.latest.size > this.limit) {
      const oldest = this.latest.keys().next().value
      if (oldest) this.latest.delete(oldest)
    }
    return true
  }

  clear(): void {
    this.latest.clear()
  }
}

export function runningAgentIds(runs: Record<string, ActiveAgentRun>): string[] {
  return [...new Set(Object.values(runs)
    .filter((run) => run.state === 'queued' || run.state === 'running')
    .map((run) => run.agentId))]
}

export function applyAssistantStreamChunks(
  current: readonly ThreadAssistantMessagePart[],
  chunks: readonly AssistantStreamChunk[],
): ThreadAssistantMessagePart[] {
  if (chunks.length === 0) throw new Error('Assistant stream event contains no chunks')
  let parts = [...current]
  for (const [chunkIndex, chunk] of chunks.entries()) {
    if (chunk.type === 'step-start') {
      if (chunk.path.length !== 0 || !chunk.messageId) throw new Error('Invalid assistant stream step-start')
      continue
    }
    if (chunk.type === 'message-finish' || chunk.type === 'error') {
      if (chunk.path.length !== 0 || chunkIndex !== chunks.length - 1) {
        throw new Error(`Invalid terminal assistant stream chunk: ${chunk.type}`)
      }
      if (chunk.type === 'message-finish' && (
        !['stop', 'length', 'content-filter', 'tool-calls', 'error', 'other', 'unknown'].includes(chunk.finishReason)
        || !Number.isFinite(chunk.usage?.inputTokens)
        || chunk.usage.inputTokens < 0
        || !Number.isFinite(chunk.usage?.outputTokens)
        || chunk.usage.outputTokens < 0
      )) throw new Error('Invalid assistant stream message-finish payload')
      if (chunk.type === 'error' && !chunk.error) throw new Error('Invalid assistant stream error payload')
      if (chunk.type === 'message-finish' && parts.some((part) => part.type === 'tool-call' && part.result === undefined)) {
        throw new Error('Assistant stream finished with an unresolved tool call')
      }
      parts = parts.map((part) => (
        part.type === 'text' || part.type === 'reasoning'
          ? chunk.type === 'error'
            ? { ...part, status: { type: 'incomplete' as const, reason: 'error' as const, error: chunk.error } }
            : { ...part, status: { type: 'complete' as const } }
          : part
      ))
      continue
    }
    if (chunk.path.length !== 1 || !Number.isSafeInteger(chunk.path[0]) || chunk.path[0]! < 0) {
      throw new Error(`Unsupported assistant stream path: [${chunk.path.join(',')}]`)
    }
    const index = chunk.path[0]!
    if (chunk.type === 'part-start') {
      if (index !== parts.length) throw new Error(`Assistant stream part-start is out of order at [${index}]`)
      if (chunk.part.type === 'text' || chunk.part.type === 'reasoning') {
        parts.push({ type: chunk.part.type, text: '', status: { type: 'running' } })
      } else if (chunk.part.type === 'tool-call') {
        if (!chunk.part.toolCallId || !chunk.part.toolName) throw new Error('Invalid assistant stream tool-call identity')
        parts.push({
          type: 'tool-call',
          toolCallId: chunk.part.toolCallId,
          toolName: chunk.part.toolName,
          args: {},
          argsText: '',
        })
      } else if (chunk.part.type === 'source') {
        if (!chunk.part.id || !chunk.part.url) throw new Error('Invalid assistant stream source part')
        parts.push({
          type: 'source', sourceType: 'url', id: chunk.part.id,
          url: chunk.part.url, ...(chunk.part.title ? { title: chunk.part.title } : {}),
        })
      } else if (chunk.part.type === 'file') {
        if (!chunk.part.data || !chunk.part.mimeType) throw new Error('Invalid assistant stream file part')
        parts.push({ type: 'file', data: chunk.part.data, mimeType: chunk.part.mimeType })
      } else if (chunk.part.type === 'data') {
        parts.push({ type: 'data', name: chunk.part.name, data: chunk.part.data })
      } else {
        throw new Error(`Unsupported assistant stream part: ${(chunk.part as { type: string }).type}`)
      }
      continue
    }
    if (chunk.type === 'text-delta') {
      if (typeof chunk.textDelta !== 'string' || chunk.textDelta.length === 0) {
        throw new Error('Assistant stream text-delta must be non-empty text')
      }
      const part = parts[index]
      if (part?.type === 'text' || part?.type === 'reasoning') {
        parts[index] = { ...part, text: `${part.text}${chunk.textDelta}`, status: { type: 'running' } }
      } else if (part?.type === 'tool-call') {
        const argsText = `${part.argsText}${chunk.textDelta}`
        let args = part.args
        try { args = parseToolArgs(argsText) } catch { /* native partial JSON */ }
        parts[index] = { ...part, argsText, args }
      } else {
        throw new Error(`Assistant stream text-delta has no text or tool part at [${index}]`)
      }
      continue
    }
    if (chunk.type === 'tool-call-args-text-finish') {
      const part = parts[index]
      if (!part || part.type !== 'tool-call') {
        throw new Error(`Assistant stream args finish has no tool part at [${index}]`)
      }
      const finished = { ...part, args: parseToolArgs(part.argsText) }
      finishedToolArgs.add(finished)
      parts[index] = finished
      continue
    }
    if (chunk.type === 'result') {
      const part = parts[index]
      if (!part || part.type !== 'tool-call') {
        throw new Error(`Assistant stream result has no tool part at [${index}]`)
      }
      if (!finishedToolArgs.has(part) || part.result !== undefined || chunk.result === undefined || typeof chunk.isError !== 'boolean') {
        throw new Error(`Assistant stream result violates the tool lifecycle at [${index}]`)
      }
      parts[index] = {
        ...part,
        result: chunk.result,
        isError: chunk.isError,
        ...(chunk.artifact === undefined ? {} : { artifact: chunk.artifact }),
      }
      continue
    }
    if (chunk.type === 'part-finish') {
      const part = parts[index]
      if (!part) throw new Error(`Assistant stream part-finish has no part at [${index}]`)
      if (part.type === 'text' || part.type === 'reasoning') {
        if (!part.text) throw new Error(`Assistant stream cannot finish an empty ${part.type} part at [${index}]`)
        parts[index] = { ...part, status: { type: 'complete' } }
      } else if (part.type === 'tool-call' && part.result === undefined) {
        throw new Error(`Assistant stream cannot finish an unresolved tool call at [${index}]`)
      }
      continue
    }
    throw new Error(`Unsupported assistant stream chunk: ${chunk.type}`)
  }
  return parts
}
