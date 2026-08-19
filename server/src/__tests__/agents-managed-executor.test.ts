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
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  scheduleManagedAgentTurn,
  isManagedAgentBusy,
  _resetManagedExecutorForTests,
  _setTurnRunnerForTests,
} from '../agents/managed-executor.js'
import type { AgentTurnOptions } from '../agents/turn.js'

beforeEach(() => {
  _resetManagedExecutorForTests()
  _setTurnRunnerForTests()
})

test('idle agent: a single wake starts exactly one turn', async () => {
  const calls: string[] = []
  _setTurnRunnerForTests(async (agentId) => { calls.push(agentId) })

  await scheduleManagedAgentTurn('agent-1', { trigger: 'message.new' })
  assert.deepEqual(calls, ['agent-1'])
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
