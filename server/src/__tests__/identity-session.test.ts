import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { SessionApplication } from '../modules/identity/session-application.js'

function queryable(
  handler: (text: string, params: readonly unknown[]) => { rows?: unknown[]; rowCount?: number },
): Queryable {
  return {
    query: async (text, params = []) => ({
      command: '',
      rowCount: null,
      oid: 0,
      fields: [],
      ...handler(text, params),
    }) as never,
  }
}

test('session creation hashes the token and commits the session plus login timestamp together', async () => {
  const queries: Array<{ text: string; params: readonly unknown[] }> = []
  let transactions = 0
  const db = queryable((text, params) => {
    queries.push({ text, params })
    return { rows: [], rowCount: 1 }
  })
  const application = new SessionApplication(db, {
    transaction: async (work) => {
      transactions += 1
      return work(db)
    },
    now: () => 1_700_000_000_000,
    sessionToken: () => 'raw-session-token',
    wsTicket: () => 'raw-ws-ticket',
  })

  const result = await application.createSession('user-1', { ip: '127.0.0.1', ua: 'test' })
  assert.equal(result.token, 'raw-session-token')
  assert.equal(transactions, 1)
  assert.equal(queries.length, 2)
  assert.match(queries[0]!.text, /INSERT INTO sessions/)
  assert.notEqual(queries[0]!.params[0], 'raw-session-token')
  assert.match(queries[1]!.text, /UPDATE users SET last_login_at/)
})

test('login audit is committed in the same transaction as the session and login timestamp', async () => {
  const queries: Array<{ text: string; params: readonly unknown[] }> = []
  const db = queryable((text, params) => {
    queries.push({ text, params })
    return { rows: [], rowCount: 1 }
  })
  const application = new SessionApplication(db, {
    transaction: async (work) => work(db),
    now: () => 1_700_000_000_000,
    sessionToken: () => 'raw-session-token',
    wsTicket: () => 'raw-ws-ticket',
  })

  await application.createSession(
    'user-1',
    { ip: '127.0.0.1', ua: 'test' },
    {
      kind: 'login',
      userId: 'user-1',
      companyId: 'company-1',
      detail: { provider: 'lingxi' },
    },
  )

  assert.equal(queries.length, 3)
  assert.match(queries[0]!.text, /INSERT INTO sessions/)
  assert.match(queries[1]!.text, /UPDATE users SET last_login_at/)
  assert.match(queries[2]!.text, /INSERT INTO audit_events/)
  assert.equal(queries[2]!.params[0], 'user-1')
  assert.equal(queries[2]!.params[1], 'company-1')
  assert.equal(queries[2]!.params[4], 'login')
})

test('active session resolution awaits the authoritative last-used write', async () => {
  const queries: string[] = []
  const db = queryable((text) => {
    queries.push(text)
    if (/SELECT session\.user_id/.test(text)) {
      return {
        rows: [{
          user_id: 'user-1',
          expires_at: new Date(1_800_000_000_000),
          last_used_at: new Date(1_699_999_999_000),
          suspended_at: null,
          deleted_at: null,
        }],
        rowCount: 1,
      }
    }
    return { rows: [], rowCount: 1 }
  })
  const application = new SessionApplication(db, {
    transaction: async (work) => work(db),
    now: () => 1_700_000_000_000,
    sessionToken: () => 'unused',
    wsTicket: () => 'unused',
  })

  assert.deepEqual(await application.resolveSession('raw-token'), { userId: 'user-1' })
  assert.equal(queries.length, 2)
  assert.match(queries[1]!, /UPDATE sessions SET last_used_at/)
})

test('expired and suspended sessions never slide forward', async () => {
  const expiredQueries: string[] = []
  const expiredDb = queryable((text) => {
    expiredQueries.push(text)
    return /SELECT session\.user_id/.test(text)
      ? {
          rows: [{
            user_id: 'expired-user',
            expires_at: new Date(1_600_000_000_000),
            last_used_at: new Date(1_600_000_000_000),
            suspended_at: null,
            deleted_at: null,
          }],
          rowCount: 1,
        }
      : { rows: [], rowCount: 1 }
  })
  const dependencies = {
    transaction: async <T>(work: (db: Queryable) => Promise<T>) => work(expiredDb),
    now: () => 1_700_000_000_000,
    sessionToken: () => 'unused',
    wsTicket: () => 'unused',
  }
  assert.equal(await new SessionApplication(expiredDb, dependencies).resolveSession('expired'), null)
  assert.match(expiredQueries[1]!, /DELETE FROM sessions/)

  const suspendedQueries: string[] = []
  const suspendedDb = queryable((text) => {
    suspendedQueries.push(text)
    return {
      rows: [{
        user_id: 'suspended-user',
        expires_at: new Date(1_800_000_000_000),
        last_used_at: new Date(1_699_999_999_000),
        suspended_at: new Date(1_699_999_999_500),
        deleted_at: null,
      }],
      rowCount: 1,
    }
  })
  assert.equal(await new SessionApplication(suspendedDb, {
    ...dependencies,
    transaction: async (work) => work(suspendedDb),
  }).resolveSession('suspended'), null)
  assert.equal(suspendedQueries.length, 1)
})
