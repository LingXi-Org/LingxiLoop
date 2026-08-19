/**
 * Regression test for the managed+server routing decision in
 * `wakeOne()` (via the exported `wakeAgent`). See PR #5 review:
 * the LINGXILOOP_MANAGED_AGENT_EXECUTION=server branch must be
 * decided BEFORE deliverWake() is attempted, otherwise a stale Pod
 * still subscribed to the wake-stream during a pod→server rollout
 * would silently keep winning every wake (deliverWake returns >0,
 * wakeOne returns early, scheduleManagedAgentTurn never runs).
 *
 * Strategy: mock the modules wakeOne's routing depends on
 * (computer/registry, tier, runtime/wake-bus, runtime/orchestrator,
 * managed-executor) via node:test's module mocking, then dynamically
 * import a fresh scheduler.js and drive it through `wakeAgent()`.
 *
 * Run: node --import tsx --experimental-test-module-mocks --test server/src/__tests__/agents-scheduler-managed-routing.test.ts
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../db/pool.js'
import { env as realEnv } from '../env.js'

after(async () => {
  try { await pool.end() } catch { /* ignore */ }
  try {
    const { redis, sub } = await import('../redis.js')
    redis.disconnect()
    sub.disconnect()
  } catch { /* ignore */ }
})

type HostResult = { kind: string | null; companyId: string | null }

// scheduler.ts reads `env.LINGXILOOP_MANAGED_AGENT_EXECUTION` /
// `env.LINGXILOOP_REASONING_RUNTIME` from the SINGLETON `env` object built
// once at module-load time from process.env — mutating process.env after
// that point has no effect (env.js already evaluated). Mock '../env.js'
// itself instead, per test, so each scenario gets the execution-mode
// combination it wants without racing env.js's real one-time evaluation.
async function setup(t: import('node:test').TestContext, opts: {
  host: HostResult
  tier?: 'free' | 'pro' | 'max'
  managedAgentExecution?: 'pod' | 'server'
  reasoningRuntime?: 'legacy' | 'lingxigraph'
}) {
  t.mock.module('../env.js', {
    namedExports: {
      env: {
        ...realEnv,
        LINGXILOOP_MANAGED_AGENT_EXECUTION: opts.managedAgentExecution ?? 'pod',
        LINGXILOOP_REASONING_RUNTIME: opts.reasoningRuntime ?? 'legacy',
      },
    },
  })
  const deliverWakeCalls: string[] = []
  const ensurePodCalls: string[] = []
  const scheduleManagedCalls: { agentId: string; options: unknown }[] = []

  t.mock.module('../agents/computer/registry.js', {
    namedExports: {
      resolveAgentHost: async () => opts.host,
      isByoaKind: (kind: string | null) => kind === 'byoa-mac' || kind === 'byoa-vps',
    },
  })
  t.mock.module('../tier.js', {
    namedExports: {
      companyTier: async () => opts.tier ?? 'pro',
    },
  })
  t.mock.module('../agents/runtime/wake-bus.js', {
    namedExports: {
      deliver: async (agentId: string) => { deliverWakeCalls.push(agentId); return 1 },
      deliverSteer: async () => {},
    },
  })
  t.mock.module('../agents/runtime/orchestrator.js', {
    namedExports: {
      ensurePod: async (agentId: string) => { ensurePodCalls.push(agentId); return { ok: true, created: true } },
    },
  })
  t.mock.module('../agents/managed-executor.js', {
    namedExports: {
      scheduleManagedAgentTurn: async (agentId: string, options: unknown) => {
        scheduleManagedCalls.push({ agentId, options })
      },
    },
  })

  const mod = await import(`../agents/scheduler.js?t=${Date.now()}-${Math.random()}`)
  return { wakeAgent: mod.wakeAgent as typeof import('../agents/scheduler.js').wakeAgent, deliverWakeCalls, ensurePodCalls, scheduleManagedCalls }
}

test('managed + lingxigraph + server: routes straight to scheduleManagedAgentTurn, never calls deliverWake or ensurePod', async (t) => {
  const { wakeAgent, deliverWakeCalls, ensurePodCalls, scheduleManagedCalls } = await setup(t, {
    host: { kind: 'managed', companyId: 'co-1' },
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  })

  await wakeAgent('agent-1', 'message.new', 'conv-1')

  assert.deepEqual(deliverWakeCalls, [], 'deliverWake must never be called for managed+server')
  assert.deepEqual(ensurePodCalls, [], 'ensurePod must never be called for managed+server')
  assert.equal(scheduleManagedCalls.length, 1)
  assert.equal(scheduleManagedCalls[0].agentId, 'agent-1')
})

test('managed + pod (default execution mode): still calls deliverWake -> ensurePod, never scheduleManagedAgentTurn', async (t) => {
  const { wakeAgent, deliverWakeCalls, ensurePodCalls, scheduleManagedCalls } = await setup(t, {
    host: { kind: 'managed', companyId: 'co-1' },
    managedAgentExecution: 'pod',
    reasoningRuntime: 'lingxigraph',
  })

  await wakeAgent('agent-2', 'message.new', 'conv-1')

  assert.deepEqual(scheduleManagedCalls, [], 'scheduleManagedAgentTurn must not run in pod mode')
  assert.deepEqual(deliverWakeCalls, ['agent-2'])
})

test('managed + server but legacy reasoning runtime: falls through to the pod path, not scheduleManagedAgentTurn', async (t) => {
  const { wakeAgent, deliverWakeCalls, scheduleManagedCalls } = await setup(t, {
    host: { kind: 'managed', companyId: 'co-1' },
    managedAgentExecution: 'server',
    reasoningRuntime: 'legacy',
  })

  await wakeAgent('agent-3', 'message.new', 'conv-1')

  assert.deepEqual(scheduleManagedCalls, [], 'legacy reasoning runtime must never use the server executor')
  assert.deepEqual(deliverWakeCalls, ['agent-3'])
})

test('BYOA host: unaffected by managed+server config, always goes through deliverWake', async (t) => {
  const { wakeAgent, deliverWakeCalls, scheduleManagedCalls } = await setup(t, {
    host: { kind: 'byoa-mac', companyId: 'co-1' },
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  })

  await wakeAgent('agent-4', 'message.new', 'conv-1')

  assert.deepEqual(scheduleManagedCalls, [], 'BYOA must never route to the managed server executor')
  assert.deepEqual(deliverWakeCalls, ['agent-4'])
})

test('free-tier unassigned agent: deferred before deliverWake, ensurePod, or scheduleManagedAgentTurn', async (t) => {
  const { wakeAgent, deliverWakeCalls, ensurePodCalls, scheduleManagedCalls } = await setup(t, {
    host: { kind: null, companyId: 'co-free' },
    tier: 'free',
    managedAgentExecution: 'server',
    reasoningRuntime: 'lingxigraph',
  })

  await wakeAgent('agent-5', 'message.new', 'conv-1')

  assert.deepEqual(deliverWakeCalls, [])
  assert.deepEqual(ensurePodCalls, [])
  assert.deepEqual(scheduleManagedCalls, [])
})
