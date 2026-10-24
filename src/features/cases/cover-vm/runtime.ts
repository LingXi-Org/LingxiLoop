import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core'
import { QuickJSFFI } from '@jitl/quickjs-wasmfile-release-sync/ffi'
import type RawModule from '@jitl/quickjs-wasmfile-release-sync/emscripten-module'
import { COVER_GUEST_SOURCE } from './guest-source'
import { copyCoverFrameString, invalidCoverData } from './protocol'
import { parseCoverProgram, validateCoverEvent, type CoverVmEvent } from './program'

export const VM_BUDGET = Object.freeze({ heap: 8 * 1024 * 1024, wasmPages: 1024, stack: 256 * 1024, initializationCpuMs: 500, cpuMs: 100, interrupts: 10000, lifetimeTicks: 18000 })

// Keep the shared server source typed without adding browser DOM globals.
declare const WebAssembly: { Memory: new (descriptor: { initial: number; maximum: number }) => ReturnType<Awaited<ReturnType<typeof newQuickJSWASMModuleFromVariant>>['getWasmMemory']> }

/** Call ONLY from a disposable dedicated Worker. No newFunction/host references,
 * JS module loader, native timers, network, filesystem or DOM are given to guest.
 * The package's WASM imports implement memory/clock/interrupt/FFI machinery;
 * these are not a claim of an OS sandbox or protection against engine defects.
 */
export async function createCoverVm(wasmBinary: ArrayBuffer, programJson: string, rawModule: typeof RawModule) {
  const program = parseCoverProgram(programJson)
  // The published loader types omit its supported diagnostic callbacks.
  const emscriptenModule = { wasmBinary, print: () => {}, printErr: () => {} }
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', wasmBinary)), byte => byte.toString(16).padStart(2, '0')).join('')
  if (digest !== '105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232') throw Error('cover_vm_binary_integrity')
  const module = await newQuickJSWASMModuleFromVariant(newVariant({
    type: 'sync', importFFI: async () => QuickJSFFI, importModuleLoader: async () => rawModule,
  }, { wasmBinary, wasmMemory: new WebAssembly.Memory({ initial: 256, maximum: VM_BUDGET.wasmPages }),
    emscriptenModule }))
  const runtime = module.newRuntime()
  runtime.setMemoryLimit(VM_BUDGET.heap)
  runtime.setMaxStackSize(VM_BUDGET.stack)
  runtime.removeModuleLoader()
  const context = runtime.newContext()
  let disposed = false, ticks = 0
  // One shared allowance covers adapter, kernel, complete geometry mount and
  // first snapshot. Original figures construct 123/258 nodes synchronously;
  // the initial mount is materially larger than an incremental event/tick.
  const initializationDeadline = Date.now() + VM_BUDGET.initializationCpuMs
  function evaluate(source: string, frame: boolean, phase: 'bootstrap' | 'kernel' | 'mount' | 'snapshot' | 'step'): string {
    if (disposed) invalidCoverData()
    const deadline = phase === 'step' ? Date.now() + VM_BUDGET.cpuMs : initializationDeadline
    let interrupts = 0, interrupted = false
    runtime.setInterruptHandler(() => {
      interrupted = ++interrupts > VM_BUDGET.interrupts || Date.now() >= deadline
      return interrupted
    })
    const result = context.evalCode(source, `cover-${phase}.js`, { type: 'global' })
    try {
      // Guest exceptions stay inside VM; never dump/coerce guest objects in host.
      if (result.error) throw Error(`cover_vm_${phase}_${interrupted ? 'cpu_limit' : 'guest_exception'}`)
      if (runtime.hasPendingJob()) throw Error(`cover_vm_${phase}_pending_jobs`)
      if (!frame) return ''
      return copyCoverFrameString(context, result.value)
    } finally { if (result.error) result.error.dispose(); else result.value.dispose() }
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    context.dispose(); runtime.dispose()
  }
  try {
    evaluate(COVER_GUEST_SOURCE, false, 'bootstrap')
    evaluate(program.kernel, false, 'kernel')
    // Separate lexical scope avoids collisions with the pinned kernel's vars.
    evaluate(`(() => {\n${program.figure}\n})()`, false, 'mount')
    const firstFrame = evaluate('__coverDispatch({type:"snapshot"})', true, 'snapshot')
    return { firstFrame, step(event: CoverVmEvent) {
      validateCoverEvent(event)
      if (++ticks > VM_BUDGET.lifetimeTicks) throw Error('cover_vm_lifetime_exceeded')
      return evaluate(`__coverDispatch(${JSON.stringify(event)})`, true, 'step')
    }, dispose }
  } catch (error) { dispose(); throw error }
}
