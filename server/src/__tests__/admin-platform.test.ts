import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ImMessagesApplication } from '../im/messages-application.js'
import { observabilityDashboard } from '../modules/platform-operations/observability-dashboard.js'
import { listAdminResources } from '../modules/platform-operations/resources.js'
import { changeUserLifecycle } from '../modules/platform-operations/user-lifecycle.js'

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
  let call = 0
  const db = { query: async () => {
    call += 1
    if (call === 1) return { rows: [{ runs: 4, successes: 3, failures: 1, active: 0, tokens: 1200, average_duration_ms: 2500 }] }
    if (call === 2) return { rows: [{ time: new Date('2026-09-03T12:00:00Z'), runs: 4, failures: 1 }] }
    if (call === 3) return { rows: [{ model: 'gpt-test', runs: 4, tokens: 1200 }] }
    return { rows: [{
      id: 'run-1', agent: 'agent-1', company: 'company-1', model: 'gpt-test', status: 'completed',
      timestamp: new Date('2026-09-03T12:00:00Z'), duration_ms: 2500, tokens: 300, tool_calls: 2,
      summary: 'done', error: null,
    }] }
  } } as unknown as Queryable

  const response = await observabilityDashboard(db)

  assert.equal(response.dashboard.apiVersion, 'openplait.io/v1alpha1')
  assert.deepEqual(response.results.summary.frames[0]?.fields.map((field) => [field.name, field.values]), [
    ['runs', [4]], ['success_rate', [75]], ['average_duration_ms', [2500]], ['tokens', [1200]],
    ['successes', [3]], ['failures', [1]], ['active', [0]],
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
      { name: 'status', type: 'string', values: ['completed'] },
      { name: 'duration_ms', type: 'duration', values: [2500], unit: 'ms' },
      { name: 'tokens', type: 'number', values: [300] },
      { name: 'tool_calls', type: 'number', values: [2] },
      { name: 'summary', type: 'string', values: ['done'] },
      { name: 'error', type: 'string', values: [null] },
    ],
  })
})
