import assert from 'node:assert/strict'
import test from 'node:test'
import type { HostPort } from '../src/host/port.js'
import { MetricsRegistry } from '../src/metrics.js'
import type { WorkItem } from '../src/protocol/types.js'
import type { AgentRuntime } from '../src/runtime/runtime.js'
import { AgentWorker } from '../src/worker/worker.js'

const work: WorkItem = {
  id: 'worker-health', fence: 1, homeEpoch: 1, tenantId: 'tenant', agentId: 'agent',
  sessionId: 'session', kind: 'turn', lane: 'interactive', triggerRef: 'message', leaseToken: 'lease',
}

test('worker exposes health, readiness, and metrics while draining', async () => {
  let claimed = false
  let finishRun!: () => void
  const host = {
    claimWork: async () => claimed ? null : (claimed = true, work),
  } as unknown as HostPort
  const runtime = {
    runWork: async () => new Promise<void>((resolve) => { finishRun = resolve }),
  } as unknown as AgentRuntime
  const worker = new AgentWorker({
    host, runtime, workerId: 'worker-test', maxConcurrentRuns: 1,
    shutdownGraceMs: 2_000, pollIdleMs: 5, healthPort: 0, metrics: new MetricsRegistry(),
  })
  const { healthPort } = await worker.start()
  assert.ok(healthPort)
  while (worker.activeRuns === 0) await new Promise((resolve) => setTimeout(resolve, 1))
  const root = `http://127.0.0.1:${healthPort}`
  assert.equal((await fetch(`${root}/healthz`)).status, 200)
  assert.match(await (await fetch(`${root}/metrics`)).text(), /agentos_worker_active_runs 1/)

  const stopped = worker.stop()
  assert.equal((await fetch(`${root}/readyz`)).status, 503)
  finishRun()
  assert.deepEqual(await stopped, { timedOut: false })
})
