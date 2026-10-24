import { Worker } from 'node:worker_threads'
import { access } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isCoverVmFailureCode, parseCoverProgram } from '../../../../src/features/cases/cover-vm/program.js'
import { coverFrameSvg } from '../../../../src/features/cases/cover-vm/svg.js'
import { CaseCoverGenerationError } from './cover-validation.js'

export interface CoverRenderer {
  assertAvailable(signal: AbortSignal): Promise<void>
  render(input: { validatedHtml: string; program: string; signal: AbortSignal }): Promise<string>
}
export const COVER_WORKER_LIMITS = Object.freeze({ maxOldGenerationSizeMb: 32, maxYoungGenerationSizeMb: 8, stackSizeMb: 2 })
const require = createRequire(import.meta.url)
const renderFailure = (code: string) => new CaseCoverGenerationError('render_failed', [code])
/** QuickJS is the generated-code boundary. The Worker supplies termination and
 * host-heap limits, not OS isolation. The guest has no host callbacks or loader.
 */
export const isolatedCoverRenderer: CoverRenderer = {
  async assertAvailable(signal) {
    signal.throwIfAborted()
    try {
      await access(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'))
      await access(require.resolve('quickjs-emscripten-core'))
      await access(new URL('./cover-vm-worker.mjs', import.meta.url))
    } catch { throw new CaseCoverGenerationError('renderer_unavailable') }
    signal.throwIfAborted()
  },
  async render({ program, signal }) {
    signal.throwIfAborted()
    try { parseCoverProgram(program) } catch { throw renderFailure('cover_vm_program_invalid') }
    return new Promise<string>((resolve, reject) => {
      const worker = new Worker(new URL('./cover-vm-worker.mjs', import.meta.url), {
        workerData: { program }, env: {}, execArgv: [], resourceLimits: COVER_WORKER_LIMITS,
        stdout: true, stderr: true,
      })
      worker.stdout?.resume(); worker.stderr?.resume()
      let done = false
      const finish = (error?: unknown, svg?: string) => {
        if (done) return
        done = true; clearTimeout(timer); signal.removeEventListener('abort', abort)
        // Await actual termination before releasing the job/worker budget.
        void worker.terminate().then(() => error ? reject(error) : resolve(svg!), () => reject(renderFailure('cover_vm_worker_termination')))
      }
      const abort = () => finish(signal.reason ?? new CaseCoverGenerationError('render_failed'))
      const timer = setTimeout(() => finish(renderFailure('cover_vm_worker_timeout')), 8000)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
      worker.once('message', (message: unknown) => {
        if (message && typeof message === 'object' && Object.keys(message).sort().join(',') === 'code,type' && (message as { type: unknown }).type === 'error') {
          const code = (message as { code: unknown }).code
          finish(renderFailure(isCoverVmFailureCode(code) ? code : 'cover_vm_worker_protocol'))
          return
        }
        try {
          if (!message || typeof message !== 'object' || Object.keys(message).sort().join(',') !== 'frame,type' || (message as { type?: unknown }).type !== 'frame' || typeof (message as { frame?: unknown }).frame !== 'string') { finish(renderFailure('cover_vm_worker_protocol')); return }
          finish(undefined, coverFrameSvg((message as { frame: string }).frame, 'light', true))
        } catch { finish(renderFailure('cover_vm_render_output')) }
      })
      worker.once('error', (error: Error & { code?: string }) => finish(renderFailure(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'cover_vm_worker_heap_limit' : 'cover_vm_worker_error')))
      worker.once('exit', () => { if (!done) finish(renderFailure('cover_vm_worker_exit')) })
    })
  },
}
