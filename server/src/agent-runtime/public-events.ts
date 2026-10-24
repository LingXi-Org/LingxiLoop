import type { RunEvent, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { researchSources } from '../../../src/lib/researchSources.js'
import { publicActivitySchema, canonicalToolName } from '../../../src/lib/runActivity.js'
import { toolCardResult } from '../../../src/lib/agentToolCards.js'
import { userFacingError } from '../../../src/lib/userFacingError.js'
import { memoryActivity } from '../../../src/lib/memoryActivity.js'
import { z } from 'zod'

const presentation = z.object({ purpose: z.enum(['process', 'result']) }).strict()
const executionTiming = z.object({ version: z.literal(1),at: z.number().finite().nonnegative(),
  requestVersion: z.number().int().positive().safe(),fence: z.number().int().positive().safe() })
function displayPurpose(action: string, value: unknown, presentationVersion?: 1) {
  if (action === 'research.search' && value !== undefined) {
    const parsed = value && typeof value === 'object' ? presentation.safeParse(Reflect.get(value, 'presentation')) : null
    return parsed?.success ? parsed.data : undefined
  }
  // Native memory receipts predate the display contract. Replaying an old
  // receipt cannot establish whether its chips were an explicitly requested result.
  if (action.startsWith('memory.') && value !== undefined && presentationVersion !== 1) return undefined
  return { purpose: 'process' as const }
}

/** User transport allowlist; full results remain private to the native runtime. */
export function publicToolValue(action: string, value: unknown): unknown {
  action = canonicalToolName(action)
  if (action === 'teacher.draft_homework') return toolCardResult(action, value)
  if (action.startsWith('memory.')) return memoryActivity(action, value)
  if (action === 'chat.report_progress') {
    const parsed = publicActivitySchema.safeParse(value)
    return parsed.success ? parsed.data : undefined
  }
  if (action === 'research.search') {
    const results = researchSources(value), purpose = displayPurpose(action, value)
    return results === null ? undefined : { results,...(purpose ? { presentation: purpose } : {}) }
  }
  if (action.startsWith('knowledge.') && value && typeof value === 'object') {
    const status = Reflect.get(value, 'status')
    if (typeof status === 'string' && status.length <= 80) return { status }
  }
  return undefined
}

export function publicRunEvent(event: RunEvent, action = '', presentationVersion?: 1): RunEvent {
  action = canonicalToolName(action)
  if (event.visibility !== 'user') return { ...event, data: {} }
  if (event.kind === 'run.failed' || event.kind === 'run.cancelled') return { ...event, data: {
    ...(event.kind === 'run.failed' ? { error: userFacingError(event.data.error, '这次任务未能完成，请稍后重试。') } : {}),
  } }
  const identity = { requestVersion: event.data.requestVersion,fence: event.data.fence,attemptId: event.data.attemptId }
  const parsedTiming = executionTiming.safeParse(event.data._executionTrace)
  const timing = parsedTiming.success && parsedTiming.data.requestVersion === identity.requestVersion && parsedTiming.data.fence === identity.fence
    ? { _executionTrace: parsedTiming.data } : {}
  if (['public.text.operation','public.text.delta','public.text.ended','public.text.sealed'].includes(event.kind)) return { ...event,data: {
    version: event.data.version,...identity,partId: event.data.partId,partIndex: event.data.partIndex,
    ...([2,3].includes(Number(event.data.version)) && (event.data.purpose === 'commentary' || event.data.purpose === 'answer') ? { purpose: event.data.purpose } : {}),
    ...(event.data.version === 3 ? { messageId: event.data.messageId,segmentId: event.data.segmentId,
      operation: event.data.operation,supersedes: event.data.supersedes } : {}),
    ...(event.kind === 'public.text.delta' ? { chunkIndex: event.data.chunkIndex,text: event.data.text }
      : event.kind === 'public.text.ended' ? { chunkCount: event.data.chunkCount,reason: event.data.reason }
      : event.kind === 'public.text.sealed' ? { chunkCount: event.data.chunkCount,bodyHash: event.data.bodyHash } : {}),
  } }
  if (event.kind === 'tool.started') return { ...event, data: { ...identity,...timing,toolCallId: event.data.toolCallId, partIndex: event.data.partIndex, name: event.data.name,
    presentation: { purpose: 'process' } } }
  if (event.kind !== 'tool.completed') return event
  const raw = event.data.result && typeof event.data.result === 'object' ? event.data.result : {}
  const value = action.startsWith('memory.') && Reflect.get(raw, 'status') !== 'completed' ? undefined : publicToolValue(action, Reflect.get(raw, 'value'))
  const purpose = displayPurpose(action, value, presentationVersion)
  return { ...event, data: { ...identity,...timing,toolCallId: event.data.toolCallId, partIndex: event.data.partIndex, isError: event.data.isError === true,
    result: { status: Reflect.get(raw, 'status'), ...(purpose ? { presentation: purpose } : {}), ...(value === undefined ? {} : { value }),
      ...(typeof Reflect.get(raw, 'approvalId') === 'string' ? { approvalId: Reflect.get(raw, 'approvalId') } : {}) } } }
}

/** Read the published runtime's private upstream transport; it is never forwarded. */
export async function* nativeRunEvents(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<RunStreamEvent | null> {
  let pending = ''
  const reader = body.getReader(), decoder = new TextDecoder()
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    if (signal?.aborted) return
    while (true) {
      const { value, done } = await reader.read()
      if (signal?.aborted) return
      pending += decoder.decode(value, { stream: !done })
      if (pending.length > 2_000_000) throw new Error('runtime stream frame exceeds limit')
      let end: number
      while ((end = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, end); pending = pending.slice(end + 2)
        const data = frame.split('\n').find(line => line.startsWith('data: '))
        yield data ? JSON.parse(data.slice(6)) as RunStreamEvent : null
      }
      if (done) break
    }
    if (pending.trim()) throw new Error('runtime stream ended inside a frame')
  } finally { signal?.removeEventListener('abort', abort); await reader.cancel(); reader.releaseLock() }
}
