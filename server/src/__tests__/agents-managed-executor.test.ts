/**
 * Unit tests for the server-side managed executor (issue #4) —
 * busy/pendingRerun coalescing for managed + lingxigraph agents that
 * bypass the per-Agent Kubernetes Pod.
 *
 * Strategy: `managed-executor.ts` calls through an injectable
 * `turnRunner` seam (`_setTurnRunnerForTests`) instead of `runAgentTurn`
 * directly, so these tests never load turn.ts's heavy DB/Redis/OpenAI
 * dependency chain.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-managed-executor.test.ts
 */

import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import {
  _resetManagedExecutorForTests,
  _setConsumedMarkerForTests,
  _setReceiptStoreForTests,
  _setRuntimeControlForTests,
  _setSteerRunnerForTests,
  _setTurnRunnerForTests,
  activateManagedLingxiGraphRun,
  deactivateManagedLingxiGraphRun,
  isManagedAgentBusy,
  recordManagedLingxiGraphEvent,
  scheduleManagedAgentTurn,
} from '../agents/managed-executor.js'
import type { AgentTurnOptions } from '../agents/turn.js'

beforeEach(() => {
  _resetManagedExecutorForTests()
  _setTurnRunnerForTests()
  _setSteerRunnerForTests()
  _setConsumedMarkerForTests(async () => {})
  _setReceiptStoreForTests({
    async activate() {},
    async accepted() {},
    async resolve() { return null },
    async active() { return null },
  })
  _setRuntimeControlForTests()
})

test('busy LingxiGraph run steers a follow-up and never starts a second turn after consumption', async () => {
  let resolveFirst: (() => void) | undefined
  let starts = 0
  const steerCalls: Array<{ runId: string; key: string; phase: unknown }> = []
  _setTurnRunnerForTests(async (agentId) => {
    starts++
    activateManagedLingxiGraphRun(agentId, 'runtime-run-1', 'co-1')
    await new Promise<void>((resolve) => { resolveFirst = resolve })
    deactivateManagedLingxiGraphRun(agentId, 'runtime-run-1')
  })
  _setSteerRunnerForTests((async (request) => {
    steerCalls.push({ runId: request.runId, key: request.idempotencyKey, phase: request.metadata?.mailboxPhase })
    return { outcome: 'accepted', eventId: 'steer-1', runId: request.runId, sequence: 1, status: 'pending', kind: request.kind }
  }) as typeof import('../agents/lingxigraph-adapter.js').steerLingxiGraphRun)

  const first = scheduleManagedAgentTurn('agent-steer', { trigger: 'message.new' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  await scheduleManagedAgentTurn('agent-steer', { trigger: 'message.new' }, {
    messageId: 'message-1', conversationId: 'conv-1', authorId: 'human-1',
    authorName: 'Agent A', body: 'please adjust', companyId: 'co-1',
    authorKind: 'agent', activation: 'trigger',
  })
  recordManagedLingxiGraphEvent('agent-steer', {
    runId: 'runtime-run-1', sequence: 2, kind: 'run.steer.consumed', data: { steering_event_id: 'steer-1' },
  })
  resolveFirst?.()
  await first

  assert.deepEqual(steerCalls, [{ runId: 'runtime-run-1', key: 'message-1', phase: 'CURRENT_TURN' }])
  assert.equal(starts, 1, 'one input must not be both steered and rerun as a second turn')
})

test('terminal steering rejection falls back to exactly one new turn', async () => {
  let resolveFirst: (() => void) | undefined
  let starts = 0
  _setTurnRunnerForTests(async (agentId) => {
    starts++
    if (starts === 1) {
      activateManagedLingxiGraphRun(agentId, 'runtime-run-2', 'co-1')
      await new Promise<void>((resolve) => { resolveFirst = resolve })
      deactivateManagedLingxiGraphRun(agentId, 'runtime-run-2')
    }
  })
  _setSteerRunnerForTests((async () => {
    const { LingxiGraphRequestError } = await import('../agents/lingxigraph-adapter.js')
    throw new LingxiGraphRequestError('finalizing', 409, 'run_finalizing', false)
  }) as typeof import('../agents/lingxigraph-adapter.js').steerLingxiGraphRun)

  const first = scheduleManagedAgentTurn('agent-fallback', { trigger: 'message.new' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  await scheduleManagedAgentTurn('agent-fallback', { trigger: 'message.new' }, {
    messageId: 'message-2', conversationId: 'conv-1', authorId: 'human-1',
    authorName: 'Human', body: 'late follow-up', companyId: 'co-1',
  })
  resolveFirst?.()
  await first
  assert.equal(starts, 2)
})

test('restart recovery resolves the trusted persisted run and steers it without creating a replacement turn', async () => {
  let starts = 0
  let activeCalls = 0
  let streamed = false
  _setTurnRunnerForTests(async () => { starts++ })
  _setReceiptStoreForTests({
    async activate() {},
    async accepted() {},
    async resolve() { return null },
    async active() {
      activeCalls++
      return { loopRunId: 'loop-run-old', runtimeRunId: 'runtime-run-old', companyId: 'co-1' }
    },
  })
  _setRuntimeControlForTests({
    lookup: async () => ({ id: 'runtime-run-old', status: 'running', supersededByRunId: null }),
    stream: (async (runId, onEvent) => {
      streamed = true
      await onEvent({
        runId, sequence: 2, kind: 'run.steer.consumed', data: { steering_event_id: 'steer-recovered' },
      })
      return 2
    }) as typeof import('../agents/lingxigraph-adapter.js').streamLingxiGraphRunEvents,
  })
  _setSteerRunnerForTests((async (request) => ({
    outcome: 'accepted', eventId: 'steer-recovered', runId: request.runId,
    sequence: 1, status: 'pending', kind: request.kind,
  })) as typeof import('../agents/lingxigraph-adapter.js').steerLingxiGraphRun)

  await scheduleManagedAgentTurn('agent-recovered', { trigger: 'message.new' }, {
    messageId: 'message-after-restart', conversationId: 'conv-1', authorId: 'human-1',
    authorName: 'Human', body: 'continue with this', companyId: 'co-1',
  })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(activeCalls, 1)
  assert.equal(streamed, true)
  assert.equal(starts, 0, 'a persisted active Runtime run must win over a replacement Loop turn')
})

test('idle agent: a single wake starts exactly one turn', async () => {
  const calls: string[] = []
  _setTurnRunnerForTests(async (agentId) => { calls.push(agentId) })

  await scheduleManagedAgentTurn('agent-1', { trigger: 'message.new' })
  assert.deepEqual(calls, ['agent-1'])
})

test('ordinary peer delivery never starts or queues a managed turn', async () => {
  let starts = 0
  _setTurnRunnerForTests(async () => { starts++ })

  await scheduleManagedAgentTurn('agent-mailbox-only', { trigger: 'message.new' }, {
    messageId: 'peer-message-1', conversationId: 'conv-1', authorId: 'agent-a',
    authorName: 'Agent A', body: 'context for later', companyId: 'co-1',
    authorKind: 'agent', activation: 'deliver',
  })

  assert.equal(starts, 0)
  assert.equal(isManagedAgentBusy('agent-mailbox-only'), false)
})

test('busy agent: a second wake does not start a concurrent turn, only coalesces', async () => {
  let resolveFirst: (() => void) | undefined
  const started: string[] = []
  const finished: string[] = []
  _setTurnRunnerForTests(async (agentId) => {
    started.push(agentId)
    if (started.length === 1) {
      await new Promise<void>((resolve) => { resolveFirst = resolve })
    }
    finished.push(agentId)
  })

  const firstTurn = scheduleManagedAgentTurn('agent-2', { trigger: 'message.new' })
  // Give the first call a tick to enter the turn runner and register busy.
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(isManagedAgentBusy('agent-2'), true)
  assert.equal(started.length, 1)

  // Wake while busy: must NOT start a second concurrent turn.
  const secondWake = scheduleManagedAgentTurn('agent-2', { trigger: 'message.new' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(started.length, 1, 'busy wake must not start a concurrent turn')

  resolveFirst?.()
  await firstTurn
  await secondWake
  assert.equal(started.length, 2, 'pending rerun must run exactly once after the first turn finishes')
  assert.deepEqual(finished, ['agent-2', 'agent-2'])
  assert.equal(isManagedAgentBusy('agent-2'), false)
})

test('multiple busy wakes coalesce into exactly one rerun', async () => {
  let resolveFirst: (() => void) | undefined
  const started: string[] = []
  _setTurnRunnerForTests(async (agentId) => {
    started.push(agentId)
    if (started.length === 1) {
      await new Promise<void>((resolve) => { resolveFirst = resolve })
    }
  })

  const first = scheduleManagedAgentTurn('agent-3', { trigger: 'message.new' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(started.length, 1)

  // Five wakes while busy.
  const restPromise = Promise.all([
    scheduleManagedAgentTurn('agent-3', { triageNote: 'a' }),
    scheduleManagedAgentTurn('agent-3', { triageNote: 'b' }),
    scheduleManagedAgentTurn('agent-3', { triageNote: 'c' }),
    scheduleManagedAgentTurn('agent-3', { triageNote: 'd' }),
    scheduleManagedAgentTurn('agent-3', { triageNote: 'e' }),
  ])
  resolveFirst?.()
  await first
  await restPromise

  assert.equal(started.length, 2, 'five busy wakes must coalesce into exactly one rerun, not five')
})

test('a thrown turn still clears busy state in finally', async () => {
  _setTurnRunnerForTests(async () => { throw new Error('boom') })

  await scheduleManagedAgentTurn('agent-4', { trigger: 'message.new' })
  assert.equal(isManagedAgentBusy('agent-4'), false, 'busy must be released even when the turn runner throws')

  // A subsequent wake must be able to start a fresh turn, not be
  // stuck permanently busy.
  await scheduleManagedAgentTurn('agent-4', { trigger: 'message.new' })
  assert.equal(isManagedAgentBusy('agent-4'), false)
})

test('agent A and agent B run independently/in parallel', async () => {
  const inFlight = new Set<string>()
  let maxConcurrent = 0
  _setTurnRunnerForTests(async (agentId) => {
    inFlight.add(agentId)
    maxConcurrent = Math.max(maxConcurrent, inFlight.size)
    await new Promise((resolve) => setTimeout(resolve, 5))
    inFlight.delete(agentId)
  })

  await Promise.all([
    scheduleManagedAgentTurn('agent-A', { trigger: 'message.new' }),
    scheduleManagedAgentTurn('agent-B', { trigger: 'message.new' }),
  ])
  assert.equal(maxConcurrent, 2, 'different agents must be able to run turns concurrently')
})

test('pending turn options merge across coalesced wakes (background_scan replaces instead)', async () => {
  let resolveFirst: (() => void) | undefined
  const seenOptions: AgentTurnOptions[] = []
  _setTurnRunnerForTests(async (_agentId, options) => {
    seenOptions.push(options)
    if (seenOptions.length === 1) {
      await new Promise<void>((resolve) => { resolveFirst = resolve })
    }
  })

  const first = scheduleManagedAgentTurn('agent-5', { trigger: 'message.new' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  await scheduleManagedAgentTurn('agent-5', { triageNote: 'note-1' })
  await scheduleManagedAgentTurn('agent-5', { trigger: 'background_scan', backgroundBrief: { title: 't', body: 'b' } })

  resolveFirst?.()
  await first

  assert.equal(seenOptions.length, 2)
  assert.deepEqual(seenOptions[1], { trigger: 'background_scan', backgroundBrief: { title: 't', body: 'b' } })
})
