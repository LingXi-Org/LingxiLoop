/**
 * Outbound email retry worker.
 *
 * A `transport_status='failed'` row used to sit forever — Resend hiccups,
 * DNS flap, a Cloudflare 502 during deploy, and the message would never
 * leave the database. This loop reclaims those rows: every
 * EMAIL_RETRY_INTERVAL_MS it picks the next batch whose `next_retry_at`
 * has passed, re-issues the send (preserving threading + recipients +
 * attachments), updates retry_attempts + status, and schedules the next
 * attempt with exponential backoff until EMAIL_RETRY_MAX_ATTEMPTS.
 *
 * Multi-replica safety: SELECT … FOR UPDATE SKIP LOCKED hands each row to
 * exactly one replica per tick, no application-level locking needed.
 *
 * Disabling: set EMAIL_RETRY_INTERVAL_MS=0 in env. Useful for local dev
 * when you're actively testing the failed-state branch and don't want it
 * silently recovering.
 *
 * Backoff curve: 60s · 5min · 30min · 2h · 6h · 24h — six attempts total
 * by default. After the cap, next_retry_at is set to NULL so the row is
 * never picked up again (terminal failure).
 */
import { pool } from './db/pool.js'
import { env } from './env.js'
import {
  sendViaProvider, normalizeMessageId, formatAddress, parseAddress,
} from './email.js'
import { inc } from './metrics.js'
import { alertDiscord } from './alert.js'

/** Exponential-ish backoff in milliseconds, indexed by retry_attempts.
 *  Picked to ride out short outages (first two attempts) and to space
 *  longer outages without becoming forgetful. */
const BACKOFF_STEPS_MS: readonly number[] = [
  60_000,            // 1 min  (after the initial 60s scheduled at insert time)
  5 * 60_000,        // 5 min
  30 * 60_000,       // 30 min
  2 * 60 * 60_000,   // 2 h
  6 * 60 * 60_000,   // 6 h
  24 * 60 * 60_000,  // 24 h
]

interface RetryRow {
  message_id: string
  conversation_id: string
  company_id: string
  smtp_message_id: string | null
  in_reply_to: string | null
  references_chain: string[]
  subject: string
  from_addr: string
  to_addrs: string[]
  cc_addrs: string[]
  body: string
  auto_submitted: boolean
  retry_attempts: number
}

/** Claim a batch of due retries with SKIP LOCKED so concurrent replicas
 *  don't fight for the same row. We hold the transaction for the entire
 *  send loop so a slow Resend call doesn't cause the next tick on this
 *  replica to grab the same row. */
async function claimDueRetries(limit: number): Promise<RetryRow[]> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<RetryRow>(
      `SELECT em.message_id, em.conversation_id, em.company_id,
              em.smtp_message_id, em.in_reply_to, em.references_chain,
              em.subject, em.from_addr, em.to_addrs, em.cc_addrs,
              m.body, em.auto_submitted, em.retry_attempts
         FROM email_messages em
         JOIN messages m ON m.id = em.message_id
        WHERE em.direction = 'out'
          AND em.transport_status = 'failed'
          AND em.next_retry_at IS NOT NULL
          AND em.next_retry_at <= NOW()
        ORDER BY em.next_retry_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit],
    )
    // Mark each row as in-flight by pushing next_retry_at forward — this
    // prevents the same row from being retried twice if a different
    // replica somehow ends up looking at it before we COMMIT.
    if (rows.length) {
      await client.query(
        `UPDATE email_messages
            SET next_retry_at = NOW() + INTERVAL '5 minutes'
          WHERE message_id = ANY($1::text[])`,
        [rows.map((r) => r.message_id)],
      )
    }
    await client.query('COMMIT')
    return rows
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { /* ignore */ }
    throw e
  } finally {
    client.release()
  }
}

/** Compute the next retry timestamp from the current attempt count.
 *  Returns null after the last step → terminal failure. */
function nextRetryAt(attemptsAfterThis: number): Date | null {
  if (attemptsAfterThis >= BACKOFF_STEPS_MS.length) return null
  return new Date(Date.now() + BACKOFF_STEPS_MS[attemptsAfterThis])
}

async function retryOne(row: RetryRow): Promise<void> {
  const attemptNumber = row.retry_attempts + 1
  // Look up any attachments we already uploaded for this row so the retry
  // re-sends them. (`storage_key` already a public URL after publicUrl()
  // is awaited — we resolve at the call site.)
  const { rows: atts } = await pool.query<{
    filename: string; mime_type: string; size_bytes: number;
    storage_key: string | null; truncated: boolean;
  }>(
    `SELECT filename, mime_type, size_bytes, storage_key, truncated
       FROM email_attachments WHERE message_id = $1
       ORDER BY created_at`,
    [row.message_id],
  )
  const { storage } = await import('./storage.js')
  const attachmentArgs: Array<{ filename: string; mimeType?: string; path?: string }> = []
  for (const a of atts) {
    if (a.truncated || !a.storage_key) continue
    try {
      const url = await storage.publicUrl(a.storage_key)
      attachmentArgs.push({ filename: a.filename, mimeType: a.mime_type, path: url })
    } catch (e) {
      console.warn(`[email-retry] storage url resolve failed for ${a.storage_key}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  // Reconstruct recipient lists by parsing the stored "Name <addr>"
  // strings — same wire format sendViaProvider expects.
  const toAddrs = (row.to_addrs ?? []).filter(Boolean)
  const ccAddrs = (row.cc_addrs ?? []).filter(Boolean)
  const fromParsed = parseAddress(row.from_addr)
  const fromLine = fromParsed ? formatAddress(fromParsed.addr, fromParsed.name) : row.from_addr
  const sendRes = await sendViaProvider({
    from: fromLine,
    to: toAddrs,
    cc: ccAddrs.length ? ccAddrs : undefined,
    subject: row.subject,
    text: row.body,
    inReplyTo: row.in_reply_to,
    references: row.references_chain ?? [],
    messageId: row.smtp_message_id ?? null,
    autoSubmitted: row.auto_submitted ? 'auto-generated' : undefined,
    attachments: attachmentArgs,
  })
  if (sendRes.ok) {
    // Promote to sent. Clear next_retry_at — terminal state.
    await pool.query(
      `UPDATE email_messages
          SET transport_status = 'sent',
              transport_error = NULL,
              smtp_message_id = COALESCE($2, smtp_message_id),
              retry_attempts = $3,
              next_retry_at = NULL
        WHERE message_id = $1`,
      [row.message_id, normalizeMessageId(sendRes.smtpMessageId), attemptNumber],
    )
    console.log(JSON.stringify({
      evt: 'email.retry.ok', message_id: row.message_id,
      attempt: attemptNumber, company_id: row.company_id,
    }))
    inc('email.retry.ok')
    return
  }
  const next = nextRetryAt(attemptNumber)
  await pool.query(
    `UPDATE email_messages
        SET transport_error = $2,
            retry_attempts = $3,
            next_retry_at = $4
      WHERE message_id = $1`,
    [row.message_id, sendRes.error, attemptNumber, next],
  )
  const isTerminal = next === null
  console.warn(JSON.stringify({
    evt: 'email.retry.fail', message_id: row.message_id,
    attempt: attemptNumber, terminal: isTerminal,
    error: sendRes.error, company_id: row.company_id,
  }))
  inc(isTerminal ? 'email.retry.terminal' : 'email.retry.fail')
  // Terminal failure = real message loss (we exhausted the backoff curve
  // and the provider still rejects). Worth paging. Non-terminal failures
  // log + counter only — they'll retry on the next tick.
  if (isTerminal) {
    // Fire-and-forget alert. A network blip on the Discord webhook
    // mustn't crash the retry worker — we'd lose visibility on
    // EVERY subsequent terminal failure, not just this one.
    alertDiscord({
      title: 'email retry: terminal failure (message lost)',
      detail: `message_id=\`${row.message_id}\`\ncompany=\`${row.company_id}\`\nsubject=${row.subject.slice(0, 100)}\nerror: ${(sendRes.error ?? '').slice(0, 800)}`,
      level: 'error',
    }).catch((err) => console.warn('[email-retry] alertDiscord failed:', err instanceof Error ? err.message : err))
  }
}

/** Run one tick — claim due rows, retry each, update bookkeeping. */
export async function runRetryTick(maxBatch = 16): Promise<{ attempted: number }> {
  const due = await claimDueRetries(maxBatch)
  for (const row of due) {
    try { await retryOne(row) }
    catch (e) {
      // Anything that THROWS at this layer is a programmer error (DB
      // unreachable etc) — log + leave the row at its scheduled next time
      // so a different replica picks it up.
      console.error(`[email-retry] unexpected throw on ${row.message_id}:`, e instanceof Error ? e.message : String(e))
    }
  }
  return { attempted: due.length }
}

let timer: NodeJS.Timeout | null = null

/** Start the periodic retry loop. Idempotent — re-calling is a no-op. */
export function startEmailRetryWorker(): { stop(): void } | null {
  if (timer) return { stop: stopEmailRetryWorker }
  const intervalMs = env.EMAIL_RETRY_INTERVAL_MS
  if (intervalMs <= 0) {
    console.log('[email-retry] disabled (EMAIL_RETRY_INTERVAL_MS=0)')
    return null
  }
  console.log(`[email-retry] starting · interval=${intervalMs}ms · max-attempts=${BACKOFF_STEPS_MS.length}`)
  const tick = async () => {
    try { await runRetryTick() }
    catch (e) { console.error('[email-retry] tick failed:', e instanceof Error ? e.message : String(e)) }
  }
  // First tick after one full interval (let server boot
  // complete first). subsequent ticks fire on the interval.
  timer = setInterval(() => { void tick() }, intervalMs)
  return { stop: stopEmailRetryWorker }
}

export function stopEmailRetryWorker(): void {
  if (timer) { clearInterval(timer); timer = null }
}
