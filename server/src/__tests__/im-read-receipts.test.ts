import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { PoolClient } from 'pg'

const migration = readFileSync(new URL('../db/migrate.ts', import.meta.url), 'utf8')
const router = readFileSync(new URL('../im/router.ts', import.meta.url), 'utf8')
const service = readFileSync(new URL('../im/read-receipts.ts', import.meta.url), 'utf8')
const ws = readFileSync(new URL('../ws.ts', import.meta.url), 'utf8')
const controlPlane = readFileSync(new URL('../agent-os/control-plane.ts', import.meta.url), 'utf8')
const actions = readFileSync(new URL('../agent-os/learning-actions.ts', import.meta.url), 'utf8')

test('read receipt migration is append-only, range indexed and uniqueness protected', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS im_read_receipt_advances/)
  assert.match(migration, /PRIMARY KEY\(company_id, channel_id, reader_id, read_through_seq\)/)
  assert.match(migration, /read_through_seq > previous_read_seq/)
  assert.match(migration, /idx_im_read_receipt_range/)
})

test('read route requires a durable cursor and retains unseen unread messages', () => {
  assert.match(router, /c\.members @> to_jsonb\(ARRAY\[\$3::text\]\)/)
  assert.doesNotMatch(router, /clearUnread\(userId, channelId, channelType\)/)
  assert.doesNotMatch(router, /legacy/)
  assert.match(router, /setUnread\(userId, channelId, channelType, latestSeq - readThroughSeq\)/)
  assert.match(router, /readThroughSeq exceeds latest channel sequence/)
  assert.match(router, /channels\/:id\/read-receipts/)
})

test('monotonic service serializes devices and filters departed group members', () => {
  assert.match(service, /pg_advisory_xact_lock/)
  assert.match(service, /input\.readThroughSeq <= previousReadSeq/)
  assert.match(service, /c\.members @> to_jsonb\(ARRAY\[r\.reader_id\]\)/)
  assert.match(service, /r\.previous_read_seq < \$4 AND r\.read_through_seq >= \$3/)
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
  process.env.LINGXILOOP_RUNTIME_CLIENT = 'http'
  process.env.DEEPSEEK_API_KEY ||= 'unit-test-key'
  const { recordReadReceiptAdvance } = await import('../im/read-receipts.js')
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
  const first = await recordReadReceiptAdvance({ companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 5 }, fakeClient)
  const repeat = await recordReadReceiptAdvance({ companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 5 }, fakeClient)
  const stale = await recordReadReceiptAdvance({ companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 3 }, fakeClient)
  const next = await recordReadReceiptAdvance({ companyId: 'company', channelId: 'room', readerId: 'reader', readThroughSeq: 9 }, fakeClient)
  assert.deepEqual(first && [first.previousReadSeq, first.readThroughSeq], [0, 5])
  assert.equal(repeat, null)
  assert.equal(stale, null)
  assert.deepEqual(next && [next.previousReadSeq, next.readThroughSeq], [5, 9])
  assert.equal(rows.length, 2)
})
