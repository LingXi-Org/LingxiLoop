import assert from 'node:assert/strict'
import test from 'node:test'
import type { Queryable } from '../db/queryable.js'
import { ImMessagesApplication, type ImMessagesInfrastructure } from '../im/messages-application.js'

test('agent send rechecks authoritative WuKong history under the channel lease', async () => {
  const queries: string[] = []
  const db = {
    async query(sql: string) {
      queries.push(sql)
      if (sql.includes('SELECT binding.profile')) return { rows: [{ profile: { channelType: 2 } }] }
      if (sql.includes('FROM im_send_acceptances')) return { rows: [] }
      if (sql.includes('pg_advisory_')) return { rows: [] }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  } as unknown as Queryable
  let sends = 0
  const infrastructure = {
    db,
    withConnection: async <T>(work: (connection: Queryable) => Promise<T>) => work(db),
    syncMessages: async () => [{
      messageId: 'wukong-message',
      messageSeq: 42,
      clientMsgNo: 'peer-client-message',
      channelId: 'room',
      fromUid: 'peer-agent',
      timestamp: 1_788_000_000,
      payload: { version: 1 as const, kind: 'text' as const, clientMsgNo: 'peer-client-message', body: 'same answer' },
    }],
    reactions: async () => ({}),
    toggleReaction: async () => ({ reactions: [] }),
    sendMessage: async () => {
      sends += 1
      return { messageId: 'sent', messageSeq: 43 }
    },
    setUnread: async () => undefined,
    recordReadReceipt: async () => null,
    publishReadReceipt: async () => undefined,
  } satisfies ImMessagesInfrastructure

  const result = await new ImMessagesApplication(infrastructure).acceptAgentMessage({
    companyId: 'company',
    userId: 'agent',
    channelId: 'room',
    clientNonce: 'agent-reply:nonce',
    payload: { version: 1, kind: 'text', clientMsgNo: 'agent-reply:nonce', body: 'same answer' },
    rejectVerbatimPeerBody: 'same answer',
  })

  assert.equal(result.kind, 'verbatim_peer')
  assert.equal(sends, 0)
  assert.ok(queries.some((sql) => sql.includes('pg_advisory_lock') && sql.includes('hashtextextended')))
  assert.ok(queries.some((sql) => sql.includes('pg_advisory_unlock') && sql.includes('hashtextextended')))
})
