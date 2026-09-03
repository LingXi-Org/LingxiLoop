import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { PoolClient } from 'pg'

const router = readFileSync(new URL('../im/router.ts', import.meta.url), 'utf8')
const service = readFileSync(new URL('../im/read-receipts.ts', import.meta.url), 'utf8')
const application = readFileSync(new URL('../im/read-receipts-application.ts', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../im/read-receipts-repository.ts', import.meta.url), 'utf8')
const messagesApplication = readFileSync(new URL('../im/messages-application.ts', import.meta.url), 'utf8')
const ws = readFileSync(new URL('../ws.ts', import.meta.url), 'utf8')
const controlPlane = readFileSync(new URL('../agent-os/control-plane.ts', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')

test('read route requires a durable cursor and retains unseen unread messages', () => {
  assert.match(router, /imMessagesApplication\.markRead/)
  assert.match(router, /channels\/:id\/read[\s\S]*?'conversation:read'[\s\S]*?imMessagesApplication\.markRead/)
  const markRead = messagesApplication.slice(messagesApplication.indexOf('async markRead'))
  assert.doesNotMatch(markRead, /clearUnread/)
  assert.doesNotMatch(router, /legacy/)
  assert.match(messagesApplication, /latestSeq - input\.readThroughSeq/)
  assert.match(messagesApplication, /infrastructure\.setUnread/)
  assert.match(router, /readThroughSeq exceeds latest channel sequence/)
  assert.match(router, /channels\/:id\/read-receipts/)
})

test('monotonic service serializes devices and filters departed group members', () => {
  assert.match(repository, /pg_advisory_xact_lock/)
  assert.match(repository, /input\.readThroughSeq <= previousReadSeq/)
  assert.match(repository, /conversation\.members @> to_jsonb\(ARRAY\[receipt\.reader_id\]\)/)
  assert.match(repository, /receipt\.previous_read_seq < \$4 AND receipt\.read_through_seq >= \$3/)
  assert.doesNotMatch(service, /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/)
  assert.doesNotMatch(application, /\b(?:SELECT|INSERT|UPDATE|DELETE)\b/)
})

test('WebSocket fan-out enforces both tenant and authenticated recipient', () => {
  assert.match(ws, /channel === CH_IM_READ_RECEIPTS/)
  assert.match(ws, /recipientIds\.includes\(c\.userId\)/)
  assert.match(ws, /if \(!c\.companies\.has\(companyId\)\) continue/)
  assert.match(ws, /recipientIds: _internalRecipients/)
})

test('Agent context and explicit chat.history advance receipts only after history sync', () => {
  const contextSync = controlPlane.indexOf('const history = await wukongClient().syncMessages')
  const contextAdvance = controlPlane.indexOf('await advanceAgentReadReceipt', contextSync)
  assert.ok(contextSync >= 0 && contextAdvance > contextSync)
  const historyBranch = actions.indexOf("if (method === 'history')")
  const actionSync = actions.indexOf('await wukongClient().syncMessages', historyBranch)
  const actionAdvance = actions.indexOf('await advanceAgentReadReceipt', actionSync)
  assert.ok(historyBranch >= 0 && actionSync > historyBranch && actionAdvance > actionSync)
})

test('recordReadReceiptAdvance ignores repeats and appends exact intervals', async () => {
  const { appendReadReceiptAdvance } = await import('../im/read-receipts-repository.js')
  let current = 0
  const rows: Array<Record<string, unknown>> = []
  const fakeClient = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
      if (sql.includes('COALESCE(MAX(read_through_seq)')) return { rows: [{ read_through_seq: String(current) }] }
      if (sql.includes('INSERT INTO im_read_receipt_advances')) {
        const previous = Number(params?.[3])
        const through = Number(params?.[4])
        current = through
        const row = {
          companyId: 'company', channelId: 'room', readerId: 'reader',
          previousReadSeq: String(previous), readThroughSeq: String(through), readAt: new Date('2026-08-26T10:00:00.000Z'),
        }
        rows.push(row)
        return { rows: [row] }
      }
      throw new Error(`unexpected SQL: ${sql}`)
    },
  } as unknown as PoolClient
  const first = await appendReadReceiptAdvance(fakeClient, { companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 5 })
  const repeat = await appendReadReceiptAdvance(fakeClient, { companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 5 })
  const stale = await appendReadReceiptAdvance(fakeClient, { companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 3 })
  const next = await appendReadReceiptAdvance(fakeClient, { companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 9 })
  assert.deepEqual(first && [first.previousReadSeq, first.readThroughSeq], [0, 5])
  assert.equal(repeat, null)
  assert.equal(stale, null)
  assert.deepEqual(next && [next.previousReadSeq, next.readThroughSeq], [5, 9])
  assert.equal(rows.length, 2)
})
