import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ImMessagesApplication } from '../im/messages-application.js'
import { listNativeDeliveryFailures, retryNativeDelivery } from '../agents/delivery-operations.js'
import { observabilityDashboard } from '../modules/platform-operations/observability-dashboard.js'
import { listAdminResources } from '../modules/platform-operations/resources.js'
import { changeUserLifecycle } from '../modules/platform-operations/user-lifecycle.js'
import {
  cancelPlatformAgentRun,
  decidePlatformAgentApproval,
  inspectPlatformAgentRun,
  revisePlatformAgentRun,
  type PlatformAgentRuntime,
} from '../modules/platform-operations/agent-operations.js'

test('admin resource lists enforce bounds and return an opaque next cursor', async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = []
  const db = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      calls.push({ sql, params })
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 7 }] }
      return { rows: [{ data: { id: '1' } }, { data: { id: '2' } }, { data: { id: '3' } }] }
    },
  } as unknown as Queryable

  const result = await listAdminResources(db, 'companies', { limit: '2', search: 'lingxi' })
  assert.deepEqual(result, {
    data: [{ id: '1' }, { id: '2' }],
    nextCursor: Buffer.from('2').toString('base64url'),
    total: 7,
  })
  assert.equal(calls.length, 2)
  assert.match(calls[0]!.sql, /ILIKE \$1/)
  assert.equal(calls[0]!.params[0], '%lingxi%')

  await assert.rejects(() => listAdminResources(db, 'companies', { limit: '101' }), /between 1 and 100/)
  await assert.rejects(() => listAdminResources(db, 'knowledge-jobs', { companyId: 'tenant' }), /not available/)
  await assert.rejects(() => listAdminResources(db, 'companies', { cursor: 'not-a-cursor' }), /invalid cursor/)
})

test('native delivery operations page failures and retry only a validated identity', async () => {
  const calls: Array<{ sql: string; params: readonly unknown[] }> = []
  const db = { query: async (sql: string, params: readonly unknown[] = []) => {
    calls.push({ sql,params })
    if (sql.includes('SELECT * FROM')) return { rows: [{ id: '["event","one"]' },{ id: '["event","two"]' },{ id: '["event","three"]' }] }
    return { rows: [{ company_id: 'company-1' }] }
  } } as unknown as Queryable

  assert.deepEqual(await listNativeDeliveryFailures(db,{ limit: 2,offset: 4 }),{
    data: [{ id: '["event","one"]' },{ id: '["event","two"]' }],
    nextCursor: Buffer.from('6').toString('base64url'),
  })
  assert.deepEqual(calls[0]?.params,[null,null,3,4])
  assert.equal(await retryNativeDelivery(db,'["event","event-1"]'),true)
  assert.match(calls[1]?.sql ?? '',/agent_native_event_outbox/)
  assert.equal(await retryNativeDelivery(db,'["ingress","message-1","agent-1"]'),true)
  assert.match(calls[2]?.sql ?? '',/lingxios_ingress_outbox/)
  await assert.rejects(() => retryNativeDelivery(db,'["ingress","message-1"]'),/invalid delivery identity/)
})

test('suspending revokes WS tickets while restore creates no ticket', async () => {
  const statements: string[] = []
  const db = {
    query: async (sql: string) => {
      statements.push(sql)
      return { rows: sql.startsWith('SELECT id FROM users') ? [{ id: 'user-1' }] : [] }
    },
  } as unknown as Queryable

  assert.deepEqual(await changeUserLifecycle(db, {
    action: 'suspend', targetId: 'user-1', adminId: 'admin-1', reason: 'security response', ip: null, userAgent: null,
  }), { id: 'user-1', suspended: true, deleted: false })
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM ws_tickets')))

  statements.length = 0
  assert.deepEqual(await changeUserLifecycle(db, {
    action: 'restore', targetId: 'user-1', adminId: 'admin-1', reason: 'review complete', ip: null, userAgent: null,
  }), { id: 'user-1', suspended: false, deleted: false })
  assert.ok(statements.some((sql) => sql.includes('suspended_at=NULL')))
  assert.equal(statements.some((sql) => /INSERT INTO ws_tickets/.test(sql)), false)
})

test('platform message history uses the company-scoped channel profile', async () => {
  let syncUser = ''
  const application = new ImMessagesApplication({
    db: {
      query: async () => ({ rows: [{ profile: { channelType: 2, title: 'Private', members: ['tenant-user'] } }] }),
    },
    syncMessages: async (_channelId: string, _channelType: number, _limit: number, userId: string) => {
      syncUser = userId
      return []
    },
    reactions: async () => ({}),
  } as never)
  assert.deepEqual(await application.historyForPlatformAdmin({
    companyId: 'tenant-2', channelId: 'private-channel', limit: 50, beforeSequence: 0,
  }), [])
  assert.equal(syncUser, 'tenant-user')
})

test('observability dashboard returns validated OpenPlait frames with collapsed run detail data', async () => {
  const run = {
    id: 'run-1', identity: { runId: 'run-1', agentId: 'agent-1', tenantId: 'company-1', sessionId: 'room', principalId: 'human' },
    fence: 1, resultId: 'result-1', resultFence: 1, requestVersion: 1, kind: 'turn', attempts: 1,
    model: 'gpt-test', status: 'succeeded' as const, createdAt: '2026-09-03T12:00:00.000Z', availableAt: '2026-09-03T12:00:00.000Z',
    heartbeatAt: null, lastProgressAt: null, goalOutcome: null, executionMs: 2500, tokens: 300, costMicros: 40, unmeasuredCalls: 1, error: null,
  }
  const response = await observabilityDashboard({
    listRuns: async query => { assert.deepEqual(query, { limit: 30 }); return { items: [run], nextCursor: null } },
    readOperations: async () => ({ periodHours: 24, runs: 5, finished: 4, successes: 3, failures: 1, cancelled: 0, active: 1, queued: 0, waiting: 0,
      tokens: 1200, costMicros: 120, failedDeliveries: 0, failedUsageDeliveries: 0, failedMemoryCaptures: 0, averageExecutionMs: 2500,
      trend: [{ time: run.createdAt, runs: 5, failures: 1 }],
      models: [{ model: 'gpt-test', calls: 4, tokens: 1200, costMicros: 120, unmeasuredCalls: 1 }] }),
  })

  assert.equal(response.dashboard.apiVersion, 'openplait.io/v1alpha1')
  assert.deepEqual(response.results.summary.frames[0]?.fields.map((field) => [field.name, field.values]), [
    ['runs', [5]], ['success_rate', [75]], ['average_duration_ms', [2500]], ['tokens', [1200]],
    ['successes', [3]], ['failures', [1]], ['active', [1]],
    ['queued', [0]], ['waiting', [0]], ['failed_deliveries', [0]], ['failed_usage_deliveries', [0]], ['failed_memory_captures', [0]],
  ])
  assert.deepEqual(response.results.recentRuns.frames[0], {
    name: 'recent-runs',
    length: 1,
    fields: [
      { name: 'id', type: 'trace', values: ['run-1'] },
      { name: 'timestamp', type: 'time', values: ['2026-09-03T12:00:00.000Z'] },
      { name: 'agent', type: 'string', values: ['agent-1'] },
      { name: 'company', type: 'string', values: ['company-1'] },
      { name: 'model', type: 'string', values: ['gpt-test'] },
      { name: 'status', type: 'string', values: ['succeeded'] },
      { name: 'duration_ms', type: 'duration', values: [2500], unit: 'ms' },
      { name: 'tokens', type: 'number', values: [300] },
      { name: 'cost_usd', type: 'number', values: [0.00004] },
      { name: 'unmeasured_calls', type: 'number', values: [1] },
      { name: 'error', type: 'string', values: [null] },
    ],
  })
})

test('platform Agent operations resolve the authoritative run identity', async () => {
  const identity = { runId: 'run-1', tenantId: 'company-1', agentId: 'agent-1', sessionId: 'room-1', principalId: 'user-1' }
  const calls: Array<[string, unknown]> = []
  const run = { id: 'run-1', identity, status: 'waiting', fence: 1, resultId: null, resultFence: null, requestVersion: 2,
    kind: 'turn', attempts: 1, createdAt: '2026-09-08T00:00:00.000Z', availableAt: '2026-09-08T00:00:00.000Z',
    heartbeatAt: null, lastProgressAt: null, goalOutcome: null, error: null, executionMs: 0, model: null, tokens: 0, costMicros: 0,
    unmeasuredCalls: 0 }
  const runtime = {
    listRuns: async (query: unknown) => { calls.push(['listRuns', query]); return { items: [run], nextCursor: null } },
    readRunState: async (value: unknown) => { calls.push(['readRunState', value]); return { run, message: { private: true }, delivery: 'pending' } },
    readDiagnostics: async (value: unknown) => { calls.push(['readDiagnostics', value]); return { ok: true } },
    readEvents: async (value: unknown, afterSeq: number) => { calls.push(['readEvents', [value, afterSeq]]); return { events: [], nextSeq: 4 } },
    readUsage: async (value: unknown) => { calls.push(['readUsage', value]); return { calls: 1 } },
    revise: async (value: unknown, text: string) => { calls.push(['revise', [value, text]]); return true },
    cancel: async (value: unknown) => { calls.push(['cancel', value]); return true },
    readApproval: async (value: unknown) => { calls.push(['readApproval', value]); return { ...identity, approvalId: 'approval-1' } },
    decideApproval: async (value: unknown) => { calls.push(['decideApproval', value]); return { approvalId: 'approval-1', runId: 'run-1', approved: true } },
  } as unknown as PlatformAgentRuntime

  const inspected = await inspectPlatformAgentRun(runtime, 'run-1', 3)
  assert.equal('message' in (inspected.state ?? {}), false)
  assert.deepEqual(inspected.state, { run, delivery: 'pending' })
  assert.equal((await revisePlatformAgentRun(runtime, 'run-1', 'new direction')).revised, true)
  assert.equal((await cancelPlatformAgentRun(runtime, 'run-1')).cancelled, true)
  assert.deepEqual((await decidePlatformAgentApproval(runtime, 'run-1', 'approval-1', true)).result,
    { approvalId: 'approval-1', runId: 'run-1', approved: true })
  assert.deepEqual(calls.find(([name]) => name === 'revise')?.[1], [identity, 'new direction'])
  assert.deepEqual(calls.find(([name]) => name === 'readApproval')?.[1], { approvalId: 'approval-1', tenantId: 'company-1', principalId: 'user-1' })
})
