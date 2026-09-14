import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ObservabilityApplication } from '../modules/observability/application.js'

test('conversation activity reads scoped public runtime state without tool outputs or prompts', async () => {
  const run = {
    id: 'run', identity: { runId: 'run', tenantId: 'tenant', agentId: 'agent', sessionId: 'native-session', principalId: 'human' },
    fence: 2, resultId: 'result', resultFence: 1, status: 'waiting' as const, kind: 'turn', requestVersion: 1, attempts: 2,
    createdAt: '2026-09-07T00:00:00.000Z', availableAt: '2026-09-07T00:00:00.000Z', heartbeatAt: null,
    lastProgressAt: null, goalOutcome: null, error: 'private tool error', executionMs: 10, model: null, tokens: 20, costMicros: 30, unmeasuredCalls: 1,
  }
  const application = new ObservabilityApplication({ query: async (_sql: string, params: unknown[]) => {
    if (_sql.includes('agent_run_bindings')) {
      assert.match(_sql,/NOT internal/)
      assert.deepEqual(params,['tenant','room'])
      return { rows: [{ run_id: 'run' }] }
    }
    assert.deepEqual(params, ['tenant',['agent']])
    return { rows: [{ id: 'agent', name: 'Agent' }] }
  } } as unknown as Queryable, async () => ({ listRuns: async query => {
    assert.deepEqual(query, { tenantId: 'tenant', id: 'run', limit: 1 })
    return { items: [run], nextCursor: null }
  } }))
  assert.deepEqual(await application.activity('tenant', 'room'), [{
    id: 'run', runId: 'run', agentId: 'agent', agentName: 'Agent', runStatus: 'waiting', kind: 'run.waiting',
    level: 'info', title: '等待回复或审批', createdAt: run.createdAt,
  }])
})
