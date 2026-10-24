// Fixed Worker bootstrap; no generated code is evaluated by Node/tsx.
import { parentPort } from 'node:worker_threads'
try {
  const { register } = await import('tsx/esm/api')
  register({ tsconfig: false })
  await import('./cover-vm-worker.ts')
} catch {
  parentPort?.postMessage({ type: 'error', code: 'cover_vm_worker_bootstrap' })
}
