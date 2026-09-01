import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ImMessagesApplication } from '../im/messages-application.js'
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
