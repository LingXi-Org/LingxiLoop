/**
 * Inbound email webhook — fronted by the Cloudflare Email Worker
 * (workers/email-gate). The worker parses raw MIME (postal-mime in the
 * worker bundle), and POSTs the parsed JSON body here, signed with
 * EMAIL_INBOUND_HMAC_SECRET.
 *
 * This handler:
 *   1. Verifies the HMAC over the raw request body (constant-time).
 *   2. Parses recipients → resolves each to an in-tenant agent. Fans out
 *      the same delivery to every recognized recipient (so a To: with two
 *      agents creates messages in two threads, one per recipient).
 *   3. Resolves the sender — known agent, known human (by users.email),
 *      else synthetic `external:<addr>` so the conversation has someone
 *      to be "from".
 *   4. Threading: in-reply-to / references → existing email_messages row
 *      → existing conversation; else new one with subject as title.
 *   5. Persists messages + email_messages rows via the shared write path
 *      and publishes CH_MESSAGE_NEW so the recipient agent's pod wakes.
 *
 * Mount at /webhooks/email/inbound (NOT /api/...) so the user-auth
 * middleware doesn't intercept and 401 the worker.
 */
import express, { Router, type Request, type Response } from 'express'
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { storage, type Storage } from '../storage.js'
import { inc } from '../metrics.js'
import { alertDiscord } from '../alert.js'
import {
  parseAddress,
  formatAddress,
  normalizeMessageId,
  findParticipantByAddress,
  findUserInCompanyByAuthEmail,
  findOrCreateEmailConversation,
  persistEmailMessage,
  recordExternalContact,
} from '../email.js'

/** Capture the raw body bytes so we can HMAC-verify before the global
 *  express.json (in web.ts) gets to it — `verify` runs as part of
 *  body-parser's parse step, perfect spot to stash the raw buffer.
 *  Mount this router BEFORE the generic `express.json` in the app
 *  middleware chain; body-parser sets `req._body = true` after parsing,
 *  so the global parser becomes a no-op for these requests.
 *
 *  25mb mirrors the upload ceiling — same rationale (don't accept emails
 *  bigger than what we'd let a human upload). */
const inboundJsonParser = express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buf)
    },
  })

interface InboundPayload {
  /** The full RFC 5322 Message-ID, with or without angle brackets. */
  messageId: string
  inReplyTo?: string | null
  references?: string[] | null
  /** Each address is a "Name <addr@host>" or just "addr@host" string. */
  from: string
  to?: string[]
  cc?: string[]
  subject?: string
  /** Plain-text body. The worker is responsible for choosing text over
   *  html (or stripping html down) when both are present. */
  text: string
  html?: string | null
  rawSizeBytes?: number | null
  /** Lowercased Auto-Submitted header value, or null when absent / "no".
   *  Heartbeat uses this to skip auto-replying to automation. */
  autoSubmitted?: string | null
  /** Optional attachment list forwarded from the worker. Each entry's
   *  contentBase64 is the raw bytes; truncated=true means the worker
   *  refused to forward the body (oversize) and we should record metadata
   *  only. */
  attachments?: Array<{
    filename: string
    mimeType: string
    sizeBytes: number
    contentBase64: string
    truncated?: boolean
  }>
}

/** Verify a hex-encoded HMAC-SHA256 against the raw body bytes. Constant-
 *  time compare so no timing oracle. */
function verifySignature(rawBody: Buffer, signature: string): boolean {
  const secret = env.EMAIL_INBOUND_HMAC_SECRET
  if (!secret) return false
  const want = createHmac('sha256', secret).update(rawBody).digest('hex')
  let got = signature.trim().toLowerCase()
  if (got.startsWith('sha256=')) got = got.slice(7)
  if (got.length !== want.length) return false
  try {
    return timingSafeEqual(Buffer.from(want, 'hex'), Buffer.from(got, 'hex'))
  } catch {
    return false
  }
}

/** Resolve a single recipient address to (companyId, participant).
 *  Works for BOTH agents and humans — both have lingxiloop addresses on
 *  the same scheme (`<id>.<slug>@<EMAIL_DOMAIN>`), so an external
 *  reply to a human's lingxiloop address (sent via the compose drawer)
 *  routes back into their workspace inbox same as an agent's.
 *
 *  Returns null when the address doesn't belong to any tenant — the
 *  caller drops it from the fan-out (we don't want to silently route
 *  stray mail to nowhere). */
async function resolveRecipient(addr: string): Promise<{
  companyId: string
  participantId: string
  participantName: string
  participantKind: string
} | null> {
  const lc = addr.trim().toLowerCase()
  if (!lc) return null
  // Try direct address match first — covers the common case + lets
  // participants whose addresses don't fit the standard pattern still
  // work (e.g. an admin-overridden address).
  const { rows } = await pool.query<{ id: string; name: string; kind: string; company_id: string }>(
    `SELECT id, name, kind, company_id FROM participants
      WHERE LOWER(email) = $1 AND departed_at IS NULL
      LIMIT 1`,
    [lc],
  )
  if (rows[0]) return {
    companyId: rows[0].company_id,
    participantId: rows[0].id,
    participantName: rows[0].name,
    participantKind: rows[0].kind,
  }
  return null
}


interface ResolvedSender {
  /** Author id stored on the messages row. */
  participantId: string
  displayName: string | null
}

/** Resolve "From:" to a participant in the recipient's company.
 *  Hierarchy: known agent → known human user → synthetic external. */
async function resolveSender(args: {
  fromAddr: string
  fromName: string | null
  companyId: string
}): Promise<ResolvedSender> {
  // Same-tenant agent is the most common cross-agent case.
  const agent = await findParticipantByAddress(args.fromAddr, args.companyId)
  if (agent) return { participantId: agent.id, displayName: agent.name }
  // A human in this workspace replied from their real email (e.g. yetone
  // hits "reply" in Gmail to a thread an agent started).
  const user = await findUserInCompanyByAuthEmail(args.fromAddr, args.companyId)
  if (user) return { participantId: user.id, displayName: user.displayName }
  // Stranger / external collaborator. Synthetic id keeps the foreign-key
  // shape happy without us inventing a participants row for every random
  // address that might never email us again. The "external:" prefix is
  // the renderer's signal to draw an "external sender" badge.
  await recordExternalContact({
    companyId: args.companyId,
    address: args.fromAddr,
    displayName: args.fromName,
  })
  return {
    participantId: `external:${args.fromAddr.toLowerCase()}`,
    displayName: args.fromName,
  }
}

function createInboundHandler(storageProvider: Pick<Storage, 'put'>) {
  return async (req: Request, res: Response) => {
  const raw = (req as Request & { rawBody?: Buffer }).rawBody
  const sig = String(req.headers['x-lingxiloop-signature'] ?? '')
  if (!raw || !sig) {
    res.status(400).json({ error: 'missing signature or body' })
    return
  }
  if (!env.EMAIL_INBOUND_HMAC_SECRET) {
    // Feature off — refuse so a misconfigured worker can't silently
    // succeed and have the operator wonder why no mail appears.
    res.status(503).json({ error: 'inbound email disabled (EMAIL_INBOUND_HMAC_SECRET unset)' })
    return
  }
  if (!verifySignature(raw, sig)) {
    inc('email.inbound.bad_signature')
    res.status(401).json({ error: 'bad signature' })
    return
  }
  const payload = req.body as InboundPayload
  if (!payload || typeof payload.messageId !== 'string' || typeof payload.from !== 'string') {
    res.status(400).json({ error: 'bad payload — need messageId + from' })
    return
  }

  const fromParsed = parseAddress(payload.from)
  if (!fromParsed) {
    res.status(400).json({ error: `unparseable from: ${payload.from}` })
    return
  }
  const recipients = [...(payload.to ?? []), ...(payload.cc ?? [])]
    .map((s) => parseAddress(s))
    .filter((x): x is { addr: string; name: string | null } => Boolean(x))
  if (recipients.length === 0) {
    res.status(400).json({ error: 'no recipients' })
    return
  }

  const subject = (payload.subject ?? '').trim()
  const body = (payload.text ?? '').trim()
  if (!body) {
    res.status(400).json({ error: 'native inbound payload requires text' })
    return
  }
  const html = payload.html ?? null
  const messageIdNorm = normalizeMessageId(payload.messageId)
  if (!messageIdNorm) {
    res.status(400).json({ error: 'invalid messageId' })
    return
  }

  // Idempotency: same Message-ID arriving twice (worker retried, MTA
  // duplicate, etc.) must not create duplicate threads. The unique index
  // on email_messages.smtp_message_id already enforces this on insert,
  // but a pre-check spares us the partial-write rollback on the common
  // retry path.
  const dup = await pool.query<{ message_id: string }>(
    `SELECT message_id FROM email_messages WHERE LOWER(smtp_message_id) = $1 LIMIT 1`,
    [messageIdNorm],
  )
  if (dup.rows[0]) {
    console.log(JSON.stringify({
      evt: 'email.inbound.dedup', smtp_message_id: messageIdNorm,
      existing_message_id: dup.rows[0].message_id,
    }))
    inc('email.inbound.dedup')
    res.json({ ok: true, deduplicated: true, messageId: dup.rows[0].message_id })
    return
  }

  // Echo dedup: SES rewrites Message-ID, so when we send to a lingxiloop-domain
  // recipient (e.g. agent-in-same-workspace), the email boomerangs back
  // through our own CF email worker → /webhooks/email/inbound carrying
  // SES's id, not the id we minted + stored on the outbound row. The
  // messageId-based dedup above misses, and the recipient sees a fresh
  // conversation with their own message in it.
  //
  // Heuristic second pass: look for an outbound row with the SAME
  // (from, to, subject) sent within the last 10 minutes. A legitimate
  // human-driven reply will carry In-Reply-To (handled by
  // findOrCreateEmailConversation), so this only fires on the "received
  // a copy of what we just sent" case, not on real replies.
  const fromAddrFull = formatAddress(fromParsed.addr, fromParsed.name)
  const inboundToJson = JSON.stringify((payload.to ?? []).map((s) => s))
  const echo = await pool.query<{ message_id: string; conversation_id: string }>(
    `SELECT message_id, conversation_id FROM email_messages
      WHERE direction = 'out'
        AND created_at > NOW() - INTERVAL '10 minutes'
        AND LOWER(subject) = LOWER($1)
        AND LOWER(from_addr) = LOWER($2)
        AND LOWER(to_addrs::text) = LOWER($3)
      ORDER BY created_at DESC
      LIMIT 1`,
    [subject || '(no subject)', fromAddrFull, inboundToJson],
  )
  if (echo.rows[0]) {
    console.log(JSON.stringify({
      evt: 'email.inbound.echo_dedup', smtp_message_id: messageIdNorm,
      outbound_message_id: echo.rows[0].message_id,
    }))
    inc('email.inbound.dedup')
    res.json({ ok: true, deduplicated: true, echo: true, messageId: echo.rows[0].message_id })
    return
  }

  // Upload attachments once up-front. Each recipient's delivery creates a
  // distinct messages row, so we duplicate the email_attachments metadata
  // rows per-recipient (cheap) but reuse the same storage object — those
  // bytes are identical and live under a stable storage key. Truncated
  // entries skip the upload and persist filename-only so the UI still
  // surfaces "this attachment was too big".
  interface UploadedAttachment {
    filename: string; mimeType: string; sizeBytes: number;
    storageKey: string | null; truncated: boolean
  }
  const uploaded: UploadedAttachment[] = []
  for (const a of payload.attachments ?? []) {
    const filename = (a.filename ?? 'attachment').slice(0, 200)
    const mimeType = (a.mimeType ?? 'application/octet-stream').slice(0, 120)
    const sizeBytes = Math.max(0, Number(a.sizeBytes ?? 0))
    if (a.truncated || !a.contentBase64) {
      uploaded.push({ filename, mimeType, sizeBytes, storageKey: null, truncated: true })
      continue
    }
    try {
      const bytes = Buffer.from(a.contentBase64, 'base64')
      // Suffix from filename if present, else a coarse guess from mime.
      const dotIdx = filename.lastIndexOf('.')
      const ext = dotIdx > 0 ? filename.slice(dotIdx + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : ''
      const key = `email-attachments/${randomUUID()}${ext ? '.' + ext : ''}`
      await storageProvider.put(key, bytes, mimeType)
      uploaded.push({ filename, mimeType, sizeBytes, storageKey: key, truncated: false })
    } catch (e) {
      console.error(JSON.stringify({
        evt: 'email.inbound.attachment_upload_fail', filename,
        size_bytes: sizeBytes, error: e instanceof Error ? e.message : String(e),
      }))
      inc('email.inbound.attachment_upload_fail')
      // Fire-and-forget Discord alert — repeated upload failures usually
      // mean storage creds drifted or the bucket filled up.
      void alertDiscord({
        title: 'email inbound: attachment upload failed',
        detail: `filename=\`${filename}\` size=${sizeBytes} bytes\nerror: ${e instanceof Error ? e.message : String(e)}`,
        level: 'warn',
      })
      uploaded.push({ filename, mimeType, sizeBytes, storageKey: null, truncated: true })
    }
  }

  // Fan out to every recipient that resolves to an agent in some tenant.
  // Cross-tenant deliveries land in each tenant separately; lingxiloop has no
  // notion of "the same conversation across tenants" because tenants
  // can't read each other's data anyway.
  const inserts: Array<{ companyId: string; conversationId: string; messageId: string }> = []
  for (const rcpt of recipients) {
    const resolved = await resolveRecipient(rcpt.addr)
    if (!resolved) continue
    const companyId = resolved.companyId
    const sender = await resolveSender({
      fromAddr: fromParsed.addr,
      fromName: fromParsed.name,
      companyId,
    })
    const allRecipientParticipantIds: string[] = []
    // Find every recognized recipient that's in THIS company so they can
    // all be on the same conversation. Skip non-tenant recipients here.
    for (const r of recipients) {
      const rr = await resolveRecipient(r.addr)
      if (rr && rr.companyId === companyId) allRecipientParticipantIds.push(rr.participantId)
    }
    const memberIds = Array.from(new Set([sender.participantId, ...allRecipientParticipantIds]))

    const conv = await findOrCreateEmailConversation({
      companyId,
      inReplyTo: payload.inReplyTo ?? null,
      references: payload.references ?? [],
      subject: subject || '(no subject)',
      memberIds,
    })

    try {
      const persisted = await persistEmailMessage({
        conversationId: conv.conversationId,
        companyId,
        authorId: sender.participantId,
        direction: 'in',
        transportStatus: 'received',
        smtpMessageId: messageIdNorm,
        inReplyTo: payload.inReplyTo ?? null,
        references: payload.references ?? [],
        subject: subject || '(no subject)',
        fromAddr: formatAddress(fromParsed.addr, fromParsed.name),
        toAddrs: (payload.to ?? []).map((s) => s),
        ccAddrs: (payload.cc ?? []).map((s) => s),
        body,
        html,
        rawSizeBytes: payload.rawSizeBytes ?? null,
        autoSubmitted: Boolean(payload.autoSubmitted),
        // Pass attachments INTO persistEmailMessage so they're written to
        // email_attachments BEFORE the wake event publishes — otherwise
        // the freshly-arrived bubble in the open chat pane shows up
        // without attachments until the next /messages refetch.
        attachments: uploaded,
      })
      inserts.push({ companyId, conversationId: conv.conversationId, messageId: persisted.messageId })
    } catch (e) {
      // The unique index on smtp_message_id can race-trip if two workers
      // delivered the same message in parallel. Treat as dedup, not error.
      const msg = e instanceof Error ? e.message : String(e)
      if (/uniq_email_messages_smtp_id|duplicate key/i.test(msg)) {
        console.log(JSON.stringify({
          evt: 'email.inbound.race_dedup', smtp_message_id: messageIdNorm,
          recipient: rcpt.addr,
        }))
        continue
      }
      console.error(JSON.stringify({
        evt: 'email.inbound.persist_error', recipient: rcpt.addr,
        smtp_message_id: messageIdNorm, error: msg,
      }))
    }
  }

  if (inserts.length === 0) {
    // No recognized recipient in any tenant. Reject so the worker can
    // bounce upstream — better signal than silently dropping.
    console.log(JSON.stringify({
      evt: 'email.inbound.no_recipient', smtp_message_id: messageIdNorm,
      attempted_recipients: recipients.map((r) => r.addr),
    }))
    inc('email.inbound.no_recipient')
    res.status(404).json({ error: 'no recipient resolved to a known agent' })
    return
  }
  console.log(JSON.stringify({
    evt: 'email.inbound.delivered', smtp_message_id: messageIdNorm,
    delivery_count: inserts.length, auto_submitted: Boolean(payload.autoSubmitted),
    attachment_count: payload.attachments?.length ?? 0,
  }))
  inc('email.inbound.delivered', { auto_submitted: Boolean(payload.autoSubmitted) })
  res.json({ ok: true, deliveries: inserts })
  }
}

export function createInboundEmailRouter(dependencies: { storage: Pick<Storage, 'put'> }): Router {
  const router = Router()
  router.use(inboundJsonParser)
  router.post('/inbound', createInboundHandler(dependencies.storage))
  return router
}

export const inboundEmailRouter = createInboundEmailRouter({ storage })
