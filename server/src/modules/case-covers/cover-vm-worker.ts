import { parentPort, workerData } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type RawModule from '@jitl/quickjs-wasmfile-release-sync/emscripten-module'
import { createCoverVm } from '../../../../src/features/cases/cover-vm/runtime.js'

const port = parentPort
if (!port) throw Error('cover_worker_required')
try {
  const require = createRequire(import.meta.url)
  const bytes = await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'))
  if (bytes.byteLength !== 503134) throw Error()
  // Explicit published browser loader, including on the server. Its verified
  // in-memory wasmBinary path does not load Node's filesystem/module shims.
  const loaderPath = join(dirname(require.resolve('@jitl/quickjs-wasmfile-release-sync/package.json')), 'dist/emscripten-module.browser.mjs')
  const { default: rawModule } = await import(pathToFileURL(loaderPath).href) as { default: typeof RawModule }
  const vm = await createCoverVm(Uint8Array.from(bytes).buffer, workerData.program, rawModule)
  try {
    // register() draws tick zero synchronously; one zero delta flushes callbacks
    // queued during mount using the very same virtual clock as the browser.
    const frame = vm.step({ type: 'tick', delta: 0 })
    port.postMessage({ type: 'frame', frame })
  } finally { vm.dispose() }
} catch { port.postMessage({ type: 'error' }) }
