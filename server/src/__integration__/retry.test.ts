/**
 * Integration test: outbound retry worker.
 *
 * The retry loop's whole point is SQL the unit tests can't fake:
 *   - SELECT … FOR UPDATE SKIP LOCKED so concurrent replicas claim
 *     disjoint rows
 *   - next_retry_at scheduling that advances on each miss and goes NULL
 *     after the last backoff step
 *   - transport_status flipping 'failed' → 'sent' when the provider
 *     accepts
 *
 * We exercise it by:
 *   1. seeding a failed row in PG via persistEmailMessage
 *   2. swapping sendViaProvider via dependency injection so we can control
 *      the next attempt's outcome without hitting Resend
 *   3. invoking runRetryTick() directly and reading PG back
 */
import { test, before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'
import { pool } from '../db/pool.js'
import {
  __setEmailProviderOverrideForTesting,
  findOrCreateEmailConversation,
  persistEmailMessage,
} from '../modules/email/index.js'
import { runEmailRetryTick } from '../modules/email/worker.js'

before(async () => {
  await ensureSchemaOnce()
})

beforeEach(async () => {
  __setEmailProviderOverrideForTesting(null)
  await resetAllTables()
})

after(async () => {
  __setEmailProviderOverrideForTesting(null)
  await teardownAll()
})

/** Seed one outbound row in 'failed' state, with next_retry_at already
 *  in the past so the retry worker picks it up on the next tick. */
async function seedFailedOutbound(): Promise<{
  messageId: string; conversationId: string; companyId: string; agentId: string;
}> {
  const { companyId, agentId, agentEmail } = await seedCompanyWithAgent()
  const conv = await findOrCreateEmailConversation({
    companyId, inReplyTo: null, references: [], subject: 'pending',
    memberIds: [agentId],
  })
  const { messageId } = await persistEmailMessage({
    conversationId: conv.conversationId, companyId, authorId: agentId,
    direction: 'out',
    transportStatus: 'failed',
    transportError: 'first attempt blew up',
    smtpMessageId: `retry-test-${Date.now()}@host`,
    inReplyTo: null, references: [], subject: 'pending',
    fromAddr: agentEmail, toAddrs: ['external@example.com'],
    body: 'retry me',
    autoSubmitted: true,
  })
  // persistEmailMessage stamps next_retry_at = NOW()+60s on failed
  // inserts. Move it into the past so the retry worker considers it due.
  await pool.query(
    `UPDATE email_messages SET next_retry_at = NOW() - INTERVAL '1 second' WHERE message_id = $1`,
    [messageId],
  )
  return { messageId, conversationId: conv.conversationId, companyId, agentId }
}

test('[integration] retry worker promotes a failed row to sent when the provider succeeds', async (t) => {
  const { messageId } = await seedFailedOutbound()
  __setEmailProviderOverrideForTesting(async () => ({ ok: true, smtpMessageId: 'provider-success', error: null }))
  const r = await runEmailRetryTick(8)
  assert.equal(r.attempted, 1)

  const { rows } = await pool.query<{
    transport_status: string; transport_error: string | null;
    retry_attempts: number; next_retry_at: string | null;
  }>(
    `SELECT transport_status, transport_error, retry_attempts, next_retry_at
       FROM email_messages WHERE message_id = $1`,
    [messageId],
  )
  assert.equal(rows[0].transport_status, 'sent')
  assert.equal(rows[0].transport_error, null)
  assert.equal(rows[0].retry_attempts, 1)
  assert.equal(rows[0].next_retry_at, null, 'sent rows must clear next_retry_at to stay out of the retry set')
})

test('[integration] retry worker advances backoff on a still-failing send', async () => {
  const { messageId } = await seedFailedOutbound()
  __setEmailProviderOverrideForTesting(async () => ({ ok: false, smtpMessageId: null, error: 'provider rejected request' }))
  await runEmailRetryTick(8)
  const { rows } = await pool.query<{
    transport_status: string; retry_attempts: number; next_retry_at: string | null;
  }>(
    `SELECT transport_status, retry_attempts, next_retry_at
       FROM email_messages WHERE message_id = $1`,
    [messageId],
  )
  assert.equal(rows[0].transport_status, 'failed', 'row stays failed after a failing retry')
  assert.equal(rows[0].retry_attempts, 1)
  assert.ok(rows[0].next_retry_at, 'next_retry_at should be scheduled for another attempt')
  // The next scheduled time must be in the FUTURE (first backoff step is
  // 60s, plus we're not at the terminal step yet).
  const next = new Date(rows[0].next_retry_at!).getTime()
  assert.ok(next > Date.now(), `next_retry_at should be future, got ${rows[0].next_retry_at}`)
})

test('[integration] retry worker terminates the row after exhausting backoff steps', async () => {
  const { messageId } = await seedFailedOutbound()
  // Pretend we've already burned 5 attempts (one short of the 6-step
  // backoff curve). Next failed tick should mark terminal (next_retry_at = NULL).
  await pool.query(
    `UPDATE email_messages SET retry_attempts = 5 WHERE message_id = $1`,
    [messageId],
  )
  __setEmailProviderOverrideForTesting(async () => ({ ok: false, smtpMessageId: null, error: 'provider rejected request' }))
  await runEmailRetryTick(8)
  const { rows } = await pool.query<{
    transport_status: string; retry_attempts: number; next_retry_at: string | null;
  }>(
    `SELECT transport_status, retry_attempts, next_retry_at
       FROM email_messages WHERE message_id = $1`,
    [messageId],
  )
  assert.equal(rows[0].transport_status, 'failed')
  assert.equal(rows[0].retry_attempts, 6)
  assert.equal(rows[0].next_retry_at, null, 'after the last backoff step the row goes terminal — never picked up again')
})

test('[integration] retry worker ignores rows with next_retry_at in the future', async () => {
  const { messageId } = await seedFailedOutbound()
  // Push the scheduled retry into the future so the worker should NOT
  // claim it this tick.
  await pool.query(
    `UPDATE email_messages SET next_retry_at = NOW() + INTERVAL '10 minutes' WHERE message_id = $1`,
    [messageId],
  )
  const r = await runEmailRetryTick(8)
  assert.equal(r.attempted, 0)
  const { rows } = await pool.query<{ transport_status: string; retry_attempts: number }>(
    `SELECT transport_status, retry_attempts FROM email_messages WHERE message_id = $1`,
    [messageId],
  )
  assert.equal(rows[0].retry_attempts, 0, 'untouched row stays at attempt 0')
  assert.equal(rows[0].transport_status, 'failed')
})

test('[integration] retry worker ignores inbound rows (only out + failed are eligible)', async () => {
  const { companyId, agentId, agentEmail } = await seedCompanyWithAgent()
  const conv = await findOrCreateEmailConversation({
    companyId, inReplyTo: null, references: [], subject: 'inbound',
    memberIds: [agentId],
  })
  // Even setting transport_status='failed' on an INBOUND row shouldn't
  // make it retry-eligible — only direction='out' rows are.
  await persistEmailMessage({
    conversationId: conv.conversationId, companyId, authorId: agentId,
    direction: 'in', transportStatus: 'failed', transportError: 'shouldn\'t retry',
    smtpMessageId: `inbound-failed-${Date.now()}@host`,
    inReplyTo: null, references: [], subject: 'inbound',
    fromAddr: 'external@example.com', toAddrs: [agentEmail],
    body: 'do not retry',
  })
  // Force next_retry_at into the past on every row — if the filter were
  // wrong, the inbound row would get picked up.
  await pool.query(`UPDATE email_messages SET next_retry_at = NOW() - INTERVAL '1 second'`)
  const r = await runEmailRetryTick(8)
  assert.equal(r.attempted, 0)
})
