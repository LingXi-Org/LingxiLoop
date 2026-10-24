import { parseCoverFrame } from './protocol'
import { parseCoverProgram, validateCoverEvent, type CoverVmEvent } from './program'

export interface CoverWorkerPort {
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: Event) => void) | null
  onmessageerror: ((event: MessageEvent) => void) | null
  postMessage(value: unknown): void
  terminate(): void
}

/** One pending request; coalesce bounded event categories instead of queueing ticks.
 * Worker termination is outside QuickJS so it still runs after an engine hang.
 */
export function createCoverSession(input: {
  program: string; scope: string; worker: CoverWorkerPort; onFrame: (json: string) => void; onFailure: () => void
  timeoutMs?: number
}) {
  parseCoverProgram(input.program)
  if (!input.scope || input.scope.length > 2048) throw Error('invalid_cover_scope')
  let disposed = false, pending = true, requestId = 0, sequence = -1
  let timer: ReturnType<typeof setTimeout>
  const queue = new Map<string, CoverVmEvent>()
  function dispose() {
    if (disposed) return
    disposed = true; clearTimeout(timer); queue.clear()
    input.worker.onmessage = null; input.worker.onerror = null; input.worker.onmessageerror = null
    input.worker.terminate()
  }
  function fail() { if (!disposed) { dispose(); input.onFailure() } }
  function arm(initial = false) { clearTimeout(timer); timer = setTimeout(fail, input.timeoutMs ?? (initial ? 8000 : 1000)) }
  function pump() {
    if (disposed || pending || !queue.size) return
    const [key, event] = queue.entries().next().value!
    queue.delete(key); pending = true; requestId++; arm()
    try { input.worker.postMessage({ type: 'step', scope: input.scope, requestId, event }) } catch { fail() }
  }
  input.worker.onmessage = ({ data }: MessageEvent<unknown>) => {
    if (disposed) return
    if (!data || typeof data !== 'object' || Array.isArray(data)) { fail(); return }
    const message = data as Record<string, unknown>
    // Scope fence is checked before interpreting output from an old generation.
    if (message.scope !== input.scope) return
    if (!pending || message.requestId !== requestId) { fail(); return }
    try {
      if (Object.keys(message).sort().join(',') !== 'json,requestId,scope,type' || message.type !== 'frame' || typeof message.json !== 'string') throw Error()
      const frame = parseCoverFrame(message.json)
      if (frame.sequence <= sequence) throw Error()
      sequence = frame.sequence; clearTimeout(timer); pending = false
      input.onFrame(message.json); pump()
    } catch { fail() }
  }
  input.worker.onerror = fail; input.worker.onmessageerror = fail
  arm(true)
  try { input.worker.postMessage({ type: 'init', scope: input.scope, requestId: 0, program: input.program }) } catch { fail() }
  return {
    send(event: CoverVmEvent) {
      if (disposed) return
      validateCoverEvent(event)
      // Preserve down/leave separately from the latest move; at most 6 slots.
      const key = event.type === 'pointer' ? event.kind : event.type
      queue.set(key, event); pump()
    }, dispose,
  }
}
