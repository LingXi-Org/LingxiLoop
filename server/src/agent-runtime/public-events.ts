import type { RunEvent, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { researchSources } from '../../../src/lib/researchSources.js'
import { publicActivitySchema } from '../../../src/lib/runActivity.js'
import { userFacingError } from '../../../src/lib/userFacingError.js'

/** User transport allowlist; full results remain private to the native runtime. */
export function publicToolValue(action: string, value: unknown): unknown {
  if (action === 'chat.report_progress') {
    const parsed = publicActivitySchema.safeParse(value)
    return parsed.success ? parsed.data : undefined
  }
  if (action === 'research.search') { const results = researchSources(value); return results === null ? undefined : { results } }
  if (action.startsWith('knowledge.') && value && typeof value === 'object') {
    const status = Reflect.get(value, 'status')
    if (typeof status === 'string' && status.length <= 80) return { status }
  }
  return undefined
}

export function publicRunEvent(event: RunEvent, action = ''): RunEvent {
  if (event.visibility !== 'user') return { ...event, data: {} }
  if (event.kind === 'run.failed' || event.kind === 'run.cancelled') return { ...event, data: {
    ...(event.kind === 'run.failed' ? { error: userFacingError(event.data.error, '这次任务未能完成，请稍后重试。') } : {}),
  } }
  if (event.kind === 'tool.started') return { ...event, data: { toolCallId: event.data.toolCallId, partIndex: event.data.partIndex, name: event.data.name } }
  if (event.kind !== 'tool.completed') return event
  const raw = event.data.result && typeof event.data.result === 'object' ? event.data.result : {}
  const value = publicToolValue(action, Reflect.get(raw, 'value'))
  return { ...event, data: { toolCallId: event.data.toolCallId, partIndex: event.data.partIndex, isError: event.data.isError === true,
    result: { status: Reflect.get(raw, 'status'), ...(value === undefined ? {} : { value }),
      ...(typeof Reflect.get(raw, 'approvalId') === 'string' ? { approvalId: Reflect.get(raw, 'approvalId') } : {}) } } }
}

/** Read the published runtime's private upstream transport; it is never forwarded. */
export async function* nativeRunEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<RunStreamEvent | null> {
  let pending = ''
  const reader = body.getReader(), decoder = new TextDecoder()
  try {
    while (true) {
      const { value, done } = await reader.read()
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
  } finally { await reader.cancel(); reader.releaseLock() }
}
