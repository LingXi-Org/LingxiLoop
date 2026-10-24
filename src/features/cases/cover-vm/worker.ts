import wasmUrl from '@jitl/quickjs-wasmfile-release-sync/wasm?url'
import rawModule from '@jitl/quickjs-wasmfile-release-sync/emscripten-module'
import { createCoverVm } from './runtime'
import { parseCoverProgram, validateCoverEvent } from './program'

let scope = '', requestId = 0, started = false, busy = false
let vm: Awaited<ReturnType<typeof createCoverVm>> | undefined
const host = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage: (value: unknown) => void; close: () => void }
host.onmessage = async ({ data }: MessageEvent<unknown>) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return
  const message = data as Record<string, unknown>
  try {
    if (!started) {
      if (Object.keys(message).sort().join(',') !== 'program,requestId,scope,type' || message.type !== 'init' || typeof message.scope !== 'string' || !message.scope || message.scope.length > 2048 || message.requestId !== 0 || typeof message.program !== 'string') throw Error()
      parseCoverProgram(message.program)
      started = true; busy = true; scope = message.scope
      // Trusted deployment asset only. Guest cannot choose this URL or call fetch.
      const response = await fetch(wasmUrl, { credentials: 'omit' })
      if (!response.ok) throw Error()
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength !== 503134) throw Error()
      vm = await createCoverVm(bytes, message.program, rawModule)
      host.postMessage({ type: 'frame', scope, requestId, json: vm.firstFrame })
    } else {
      if (message.scope !== scope) return
      if (busy || !vm || Object.keys(message).sort().join(',') !== 'event,requestId,scope,type' || message.type !== 'step' || message.requestId !== requestId + 1) throw Error()
      busy = true; requestId++
      const json = vm.step(validateCoverEvent(message.event))
      host.postMessage({ type: 'frame', scope, requestId, json })
    }
    busy = false
  } catch {
    host.postMessage({ type: 'error', scope, requestId })
    // Termination by the owner is the final cleanup boundary, including traps.
    try { vm?.dispose() } finally { host.close() }
  }
}
