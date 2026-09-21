import type { RunEvent } from '@lyyzka/lingxios/ui'
import type { MemoryChip } from '@/components/assistant-ui/elements/memory-chips'

export interface RunMemory {
  chips: MemoryChip[]
  calls: Record<string, { action: string; seq: number; unavailable?: boolean }>
  revision: number
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Persist only display text and replay cursors, never the native memory body or sources. */
export function projectRunMemory(runId: string, events: readonly RunEvent[], current?: RunMemory): RunMemory | undefined {
  let next = current
  for (const event of events) {
    if (event.runId !== runId || event.visibility !== 'user') continue
    const id = event.data.toolCallId
    if (typeof id !== 'string' || !id.startsWith('host:')) continue
    const previous = next?.calls[id]
    if (previous && event.seq <= previous.seq) continue
    if (event.kind === 'tool.started' && ['memory.apply', 'memory.restore', 'memory.forget'].includes(String(event.data.name))) {
      next = { chips: next?.chips ?? [], revision: next?.revision ?? 0,
        calls: { ...next?.calls, [id]: { action: String(event.data.name), seq: event.seq } } }
      // ponytail: retain 256 recent calls; use a paged projection if a single run needs more concurrent writes.
      next.calls = Object.fromEntries(Object.entries(next.calls).slice(-256))
      continue
    }
    if (event.kind !== 'tool.completed' || !previous || !next) continue
    const result = record(event.data.result)
    const succeeded = event.stage === 'completed' && event.data.isError !== true && result?.status === 'completed'
    const call = { action: previous.action, seq: event.seq, unavailable: false }
    next = { ...next, calls: { ...next.calls, [id]: call } }
    if (!succeeded) continue
    next.revision = Math.max(next.revision, event.seq)
    // A confirmed forget invalidates earlier chips; it never creates a user-facing removal action.
    if (previous.action === 'memory.forget') { next.chips = []; continue }
    const value = record(result.value)
    if (!value || value.truncated === true || !Array.isArray(value.documents) || !Array.isArray(value.deleted)) {
      call.unavailable = true
      continue
    }
    const chips = new Map(next.chips.map(chip => [chip.id, chip]))
    for (const deleted of value.deleted) {
      if (typeof deleted === 'string') chips.delete(deleted)
      else call.unavailable = true
    }
    for (const raw of value.documents) {
      const document = record(raw)
      if (!document || typeof document.id !== 'string' || !document.id || typeof document.description !== 'string'
        || !document.description.trim() || document.description.length > 500) { call.unavailable = true; continue }
      if (document.status === 'active') chips.set(document.id, { id: document.id, text: document.description })
      else if (['candidate', 'retired', 'expired'].includes(String(document.status))) chips.delete(document.id)
      else call.unavailable = true
    }
    if (chips.size > 256) call.unavailable = true
    next.chips = [...chips.values()].slice(-256)
  }
  return next
}
