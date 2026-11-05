/** Controlled public Worker/ModelDriver boundary. This fixture owns an in-memory
 * host, not the SDK PostgreSQL scheduler or production quota/lease semantics. */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { createLogger, MetricsRegistry, releaseVersions, type RunEvent, type WorkItem } from '@lingxi-org/lingxios'
import { createWorker, type HostPort, type ModelDriver } from '@lingxi-org/lingxios/worker'
import { agentRunTiming } from '../modules/platform-operations/agent-run-timing.js'

async function scenario(lanes: WorkItem['lane'][], modelMs = 25, processorMs = 10, recoveryMs = 0) {
  const createdMonotonic = performance.now()
  const events: RunEvent[] = [], finished = new Map<string, { start: number; end: number; status: string }>()
  const started = new Map<string, number>(), calls = new Set<string>(), created = Date.now()
  let modelActive = 0, maxModelActive = 0, maxActive = 0
  const queue: WorkItem[] = lanes.map((lane, i) => ({ id: `fixture-${i}`, kind: 'queue_probe', lane, fence: 1, attempts: 1,
    requestVersion: 1, homeEpoch: 1, tenantId: 'synthetic', agentId: 'agent', sessionId: `room-${i}`,
    triggerRef: 'synthetic', leaseToken: 'synthetic-only', createdAt: new Date(created).toISOString(), availableAt: new Date(created).toISOString() }))
  const host = {
    claimWork: async (_signal: AbortSignal, allowed?: WorkItem['lane'][], executionClass?: string) => {
      const index = queue.findIndex(work => (!allowed || allowed.includes(work.lane)) && (!executionClass || executionClass === (['interactive', 'approval'].includes(work.lane) ? 'conversation' : 'operation')))
      if (index < 0) return null
      const [work] = queue.splice(index, 1)
      started.set(work.id, performance.now()); maxActive = Math.max(maxActive, started.size - finished.size)
      return work
    },
    // A fixed short wake delay avoids a busy fixture loop; stopping aborts it.
    waitForWork: async (_cursor: string | undefined, _timeoutMs: number, signal: AbortSignal) => { await delay(2, undefined, { signal }); return 'fixture' },
    heartbeat: async () => ({ ok: true }),
    recoverWork: async () => { if (recoveryMs) await delay(recoveryMs); return false },
    emitEvent: async (_work: WorkItem, event: RunEvent) => { events.push(event) },
    reserveModelCall: async (_work: WorkItem, callId: string, limits: { deadlineAt: string }) => { calls.add(callId); return { allowed: true, deadlineAt: limits.deadlineAt } },
    recordModelUsage: async () => {},
    completeWork: async (work: WorkItem, result: { status: string }) => { finished.set(work.id, { start: started.get(work.id)!, end: performance.now(), status: result.status }) },
  } as unknown as HostPort
  const model: ModelDriver = { modelId: 'synthetic-queue-fixture', countTokens: () => 1,
    run: async request => { modelActive++; maxModelActive = Math.max(maxModelActive, modelActive)
      try { await delay(modelMs, undefined, { signal: request.signal }); return { output: [], text: '', model: 'synthetic-queue-fixture', usage: { available: true, inputTokens: 1, outputTokens: 1 } } }
      finally { modelActive-- } },
    structured: async () => { throw Error('unexpected structured model') }, compact: async () => { throw Error('unexpected compact model') } }
  const worker = createWorker({ controlPlane: { connectWorker: () => host }, model,
    worker: { concurrency: 2, reservedInteractiveRuns: 1, pollIdleMs: 2, shutdownGraceMs: 1000 }, resources: { model: 2 },
    logger: createLogger({ level: 'error', sink: () => {} }), metrics: new MetricsRegistry(),
    kernelFactory: () => ({ size: 0, close: () => {}, execute: async () => { throw Error('no Python in capacity fixture') } }),
    processors: { queue_probe: { process: async (_work, context) => {
      await context.model.run({ instructions: 'synthetic', items: [], signal: context.signal })
      await delay(processorMs, undefined, { signal: context.signal })
    } } } })
  try {
    await worker.start()
    const deadline = performance.now() + 5000
    while (finished.size < lanes.length && performance.now() < deadline) await delay(2)
    assert.equal(finished.size, lanes.length, 'bounded completion of every fixture task')
    assert.ok(maxActive <= 2); assert.ok(maxModelActive <= 2)
    assert.equal(calls.size, lanes.length)
    assert.ok([...finished.values()].every(result => result.status === 'completed'))
    return { maxActive, maxModelActive, durationMs: performance.now() - createdMonotonic, samples: lanes.map((lane, i) => {
      const id = `fixture-${i}`, record = finished.get(id)!
      const projection = agentRunTiming({ id, status: 'succeeded', fence: 1, requestVersion: 1, attempts: 1,
        availableAt: new Date(created).toISOString(), executionMs: record.end - record.start }, { events, afterSeq: 0 })
      assert.ok(projection.initialEligibleToStartedMs !== null)
      assert.equal(projection.endToEndMs, null, 'product never invents terminal wall time from attempt sums')
      return { lane, queueMs: projection.initialEligibleToStartedMs!, executionMs: projection.attemptExecutionTotalMs!, endToEndMs: record.end - createdMonotonic }
    }) }
  } finally { assert.equal((await worker.stop()).timedOut, false) }
}

test('formal public Worker keeps interactive/background/mixed fixture load bounded and both phases separate', { timeout: 15000 }, async context => {
  const locked = JSON.parse(readFileSync(new URL('../../../package-lock.json', import.meta.url), 'utf8')).packages['node_modules/@lingxi-org/lingxios'].version
  assert.equal(releaseVersions.runtime, locked)
  const interactive = await scenario(Array(6).fill('interactive'))
  const background = await scenario(Array(6).fill('background'))
  const mixed = await scenario(['background', 'background', 'interactive', 'interactive', 'background', 'interactive'])
  assert.equal(interactive.maxActive, 2)
  assert.equal(background.maxActive, 1, 'existing interactive reservation retains one background progress slot')
  assert.equal(mixed.maxActive, 2)
  assert.ok(mixed.samples.some(row => row.lane === 'background'))
  context.diagnostic('queue-fixture/v1 ' + JSON.stringify({ runtime: releaseVersions.runtime, synthetic: true, realProviderCalls: 0, costs: 'synthetic_no_billing', interactive, background, mixed }))
  assert.ok(interactive.samples.at(-1)!.queueMs > interactive.samples[0].queueMs, 'bounded slots create measurable queue wait')
})

test('synthetic slow model and slow processor both count inside attempt execution, not as first queue', { timeout: 5000 }, async () => {
  for (const [modelMs, processorMs] of [[80, 0], [0, 80]]) {
    const { samples } = await scenario(['interactive'], modelMs, processorMs)
    assert.ok(samples[0].executionMs >= 65)
    // Claim/start was observed separately before duration injection; no phase subtraction.
    assert.ok(Number.isFinite(samples[0].queueMs))
  }
})

test('public recovery runs after claim, so eligible-to-started and execution can overlap', { timeout: 5000 }, async () => {
  const { samples } = await scenario(['interactive'], 0, 0, 80)
  const observed = samples[0]
  assert.ok(observed.queueMs >= 65)
  assert.ok(observed.executionMs >= 65)
  assert.ok(observed.endToEndMs < observed.queueMs + observed.executionMs - 40,
    'claim recovery is in both observed intervals; adding them would double count it')
})
