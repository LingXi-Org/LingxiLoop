import { z } from 'zod'
import { TextDecoderStream, type ReadableStream } from 'node:stream/web'
import type { RunEvent, RunStreamEvent } from '@lyyzka/lingxios/ui'
import { toolCardResult } from '../../../src/lib/agentToolCards.js'
import { researchSources } from '../../../src/lib/researchSources.js'

const memories = z.object({ documents: z.array(z.object({ id: z.string().max(500), description: z.string().max(500), status: z.enum(['active','candidate','retired','expired']) })).max(256), deleted: z.array(z.string().max(500)).max(256) })
/** User transport allowlist; full results remain private to the native runtime. */
export function publicToolValue(action: string, value: unknown): unknown {
  const card = toolCardResult(action, value)
  if (card !== undefined) return action === 'learning.propose_evaluation' ? { result: card } : card
  if (action === 'research.search') { const results = researchSources(value); return results === null ? undefined : { results } }
  if (['memory.apply','memory.restore'].includes(action)) {
    const parsed = memories.safeParse(value)
    return parsed.success ? parsed.data : undefined
  }
  if (action.startsWith('knowledge.') && value && typeof value === 'object') {
    const status = Reflect.get(value, 'status')
    if (typeof status === 'string' && status.length <= 80) return { status }
  }
  return undefined
}

export function publicRunEvent(event: RunEvent, action = ''): RunEvent {
  if (event.kind === 'tool.started') return { ...event, data: { toolCallId: event.data.toolCallId, partIndex: event.data.partIndex, name: event.data.name } }
  if (event.kind !== 'tool.completed') return event
  const raw = event.data.result && typeof event.data.result === 'object' ? event.data.result : {}
  const value = publicToolValue(action, Reflect.get(raw, 'value'))
  return { ...event, data: { toolCallId: event.data.toolCallId, partIndex: event.data.partIndex, isError: event.data.isError === true,
    result: { status: Reflect.get(raw, 'status'), ...(value === undefined ? {} : { value }),
      ...(typeof Reflect.get(raw, 'approvalId') === 'string' ? { approvalId: Reflect.get(raw, 'approvalId') } : {}) } } }
}

/** Preserve native framing and immediate body previews; only tool events are projected. */
export async function* publicRunStream(body: ReadableStream<Uint8Array>, lookup: (id: string) => Promise<string | undefined>) {
  const names = new Map<string,string>()
  let pending = ''
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    pending += chunk
    if (pending.length > 2_000_000) throw new Error('runtime stream frame exceeds limit')
    let end: number
    while ((end = pending.indexOf('\n\n')) >= 0) {
      const frame = pending.slice(0,end); pending = pending.slice(end+2)
      const lines = frame.split('\n'), data = lines.findIndex(line => line.startsWith('data: '))
      if (data >= 0) {
        const item = JSON.parse(lines[data].slice(6)) as RunStreamEvent
        if (item.type === 'event' && item.event.kind.startsWith('tool.')) {
          const id = String(item.event.data.toolCallId)
          if (item.event.kind === 'tool.started' && typeof item.event.data.name === 'string') names.set(id,item.event.data.name)
          const name = names.get(id) ?? await lookup(id)
          item.event = publicRunEvent(item.event,name)
          if (item.event.kind === 'tool.completed') names.delete(id)
          lines[data] = 'data: ' + JSON.stringify(item)
        }
      }
      yield lines.join('\n') + '\n\n'
    }
  }
  if (pending.trim()) throw new Error('runtime stream ended inside a frame')
}

/** Recover names when reconnect or pagination starts after the matching tool.started. */
export async function priorToolNames(read: (after: number) => Promise<{ events: RunEvent[]; nextSeq: number }>, ids: Set<string>): Promise<Map<string,string>> {
  const names = new Map<string,string>()
  let cursor = 0
  // ponytail: cap replay lookup at 10,000 events; older unknown calls omit values safely.
  for(let page=0; page<100 && names.size<ids.size; page++) {
    const result=await read(cursor)
    for(const event of result.events) if(event.kind==='tool.started' && typeof event.data.toolCallId==='string' && ids.has(event.data.toolCallId) && typeof event.data.name==='string') names.set(event.data.toolCallId,event.data.name)
    if(result.events.length<100) break
    if(result.nextSeq<=cursor)throw new Error('runtime event cursor did not advance')
    cursor=result.nextSeq
  }
  return names
}
