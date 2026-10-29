// Separate real Worker process; only the model is deterministic. No product
// credentials, database mutations, internal runtime imports or kernel bypass.
import { createWorker } from '@lyyzka/lingxios/worker'

const usage = { available: true, inputTokens: 100, outputTokens: 20 }
let calls = 0
const worker = createWorker({
  controlPlane: { url: process.env.BASIC_CONTROL_URL, serviceToken: 'basic-recovery-synthetic-service-token' },
  worker: { id: process.env.BASIC_WORKER_ID, concurrency: 1, healthPort: 0, pollIdleMs: 50, shutdownGraceMs: 1000 },
  model: {
    modelId: 'basic-recovery-fixture', contextWindowTokens: 200000,
    async run(request) {
      calls++
      process.send?.({ kind: 'model', calls })
      if (process.env.BASIC_WRITE === '1' && calls === 1) {
        if (!request.tools?.some(tool => tool.name === 'chat__send')) throw new Error('native chat tool unavailable')
        return { text: '', output: [{ type: 'function_call', callId: 'basic-write', name: 'chat__send',
          arguments: JSON.stringify({ body: 'Synthetic committed action.' }) }], usage }
      }
      return { text: 'Synthetic recovery complete.', output: [{ role: 'assistant', content: 'Synthetic recovery complete.' }], usage }
    },
    async structured() { return { value: { missing: [] }, model: 'basic-recovery-fixture', usage } },
    async compact() { throw new Error('unexpected fixture compaction') },
  },
})
process.on('SIGTERM', async () => { await worker.stop(); process.disconnect?.() })
try {
  const { healthPort } = await worker.start()
  process.send?.({ kind: 'started', healthPort })
} catch (error) {
  process.send?.({ kind: 'failed', error: error instanceof Error ? error.name : 'error' })
  await worker.stop()
  process.exitCode = 1
  process.disconnect?.()
}
