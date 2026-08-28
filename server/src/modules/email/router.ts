
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany, } from '../../http/request-context.js'
import { storage, } from '../../storage.js'

export const emailRouter = Router()
const api = emailRouter

/* ============== Email send / reply (human → external & in-tenant) ============
 * Mirror of the agent CLI's `lingxiloop email send/reply` so a human in the
 * UI's compose drawer can write real email. The server-side flow is the
 * same shared pipeline (resolve recipient → mintMessageId → sendViaProvider
 * → persistEmailMessage) — the only difference is `authorId = caller user`
 * and `from = caller's auth email + display name`.
 *
 * Both endpoints are gated on company membership (requireCompany). On
 * provider failure we still persist the row (transport_status='failed')
 * so the user can see + retry from the thread instead of losing the
 * draft on the wire. */

/** Validate + resolve attachment metadata for outbound email. Caller has
 *  already uploaded the bytes (via the presigned R2 upload path) and hands
 *  us each entry's storage key + filename + mime + size. We:
 *    1. Reject pathological inputs (missing fields, too many, too big)
 *    2. Resolve each key to a fresh signed URL so Resend can fetch it
 *  Returns an Error (not throws) so callers stay flat. */
async function resolveHttpAttachments(raw: unknown[]): Promise<Array<{
  filename: string; mimeType: string; sizeBytes: number;
  storageKey: string; publicUrl: string;
}> | Error> {
  const MAX_ATTACHMENTS = 16
  const MAX_ATTACH_TOTAL = 25 * 1024 * 1024
  if (raw.length > MAX_ATTACHMENTS) {
    return new Error(`too many attachments (${raw.length} > ${MAX_ATTACHMENTS})`)
  }
  const out: Array<{
    filename: string; mimeType: string; sizeBytes: number;
    storageKey: string; publicUrl: string;
  }> = []
  let totalBytes = 0
  for (const entry of raw) {
    const a = entry as Record<string, unknown>
    const key = typeof a.key === 'string' ? a.key : ''
    const filename = typeof a.filename === 'string' ? a.filename.slice(0, 200) : ''
    const mimeType = typeof a.mimeType === 'string' ? a.mimeType.slice(0, 120) : 'application/octet-stream'
    const sizeBytes = Math.max(0, Number(a.sizeBytes ?? 0))
    if (!key || !filename) return new Error('each attachment needs key + filename')
    totalBytes += sizeBytes
    if (totalBytes > MAX_ATTACH_TOTAL) return new Error(`attachments exceed ${MAX_ATTACH_TOTAL} bytes total`)
    const publicUrl = await storage.publicUrl(key)
    out.push({ filename, mimeType, sizeBytes, storageKey: key, publicUrl })
  }
  return out
}

interface EmailRecipientResolveCtx { companyId: string }
async function resolveHttpRecipient(raw: string, ctx: EmailRecipientResolveCtx): Promise<{ addr: string; name: string | null } | null> {
  // Synthetic external:<addr> ids are inbound-author markers, not real
  // recipients — refuse them up front so we surface a clean 400 instead
  // of silently mailing nowhere.
  if (raw.startsWith('external:')) return null
  const { parseAddress } = await import('../../email.js')
  const direct = parseAddress(raw)
  if (direct) return direct
  // Treat raw as a participant id. Two delivery targets depending on kind:
  //   - agent  → their lingxiloop address (only place an agent exists)
  //   - human  → their personal auth email (so the message lands in their
  //              real inbox; they ALSO see it in lingxiloop because they're
  //              already a conversation member, so the SSE wake covers
  //              the in-app notification)
  const { rows: pa } = await pool.query<{ name: string; email: string | null; kind: string }>(
    `SELECT name, email, kind FROM participants
      WHERE id = $1 AND company_id = $2 AND departed_at IS NULL LIMIT 1`,
    [raw, ctx.companyId],
  )
  if (pa[0]) {
    if (pa[0].kind === 'agent') {
      if (pa[0].email) return { addr: pa[0].email, name: pa[0].name }
      throw new HttpError(409, 'agent email address has not been provisioned')
    }
    if (pa[0].kind === 'human') {
      // Human participant id == users.id; pull their auth email.
      const { rows: u } = await pool.query<{ email: string | null }>(
        `SELECT email FROM users WHERE id = $1 LIMIT 1`, [raw],
      )
      if (u[0]?.email) return { addr: u[0].email, name: pa[0].name }
    }
  }
  return null
}

api.post('/email/send', async (req, res) => {
  try {
    const { userId: me, companyId: tenant } = await requireCompany(req)
    const toRaw = Array.isArray(req.body?.to) ? req.body.to as unknown[] : []
    const ccRaw = Array.isArray(req.body?.cc) ? req.body.cc as unknown[] : []
    const attachRaw = Array.isArray(req.body?.attachments) ? req.body.attachments as unknown[] : []
    const {
      formatAddress, sendViaProvider, findOrCreateEmailConversation,
      persistEmailMessage, mintMessageId, ensureParticipantAddress,
      sanitizeSubject,
    } = await import('../../email.js')
    const subject = sanitizeSubject(String(req.body?.subject ?? ''))
    const body = String(req.body?.body ?? '').trim().slice(0, 50_000)
    if (toRaw.length === 0 || !subject || !body) {
      res.status(400).json({ error: 'to, subject, body required' })
      return
    }
    const resolvedAttachments = await resolveHttpAttachments(attachRaw)
    if (resolvedAttachments instanceof Error) {
      res.status(400).json({ error: resolvedAttachments.message })
      return
    }

    // Sender = the calling human as a participant of THIS company.
    // We need a lingxiloop-domain address (Resend won't accept From: yourgmail
    // because we don't own gmail.com). ensureParticipantAddress mints
    // <userId>.<slug>@<EMAIL_DOMAIN> if the column was still null.
    const sender = await ensureParticipantAddress(me, tenant)
    if (!sender) { res.status(400).json({ error: 'no email address available for your account in this workspace' }); return }

    const toResolved: { addr: string; name: string | null }[] = []
    const ccResolved: { addr: string; name: string | null }[] = []
    for (const raw of toRaw) {
      const r = await resolveHttpRecipient(String(raw), { companyId: tenant })
      if (!r) { res.status(400).json({ error: `unresolved recipient: ${raw}` }); return }
      toResolved.push(r)
    }
    for (const raw of ccRaw) {
      const r = await resolveHttpRecipient(String(raw), { companyId: tenant })
      if (!r) { res.status(400).json({ error: `unresolved cc: ${raw}` }); return }
      ccResolved.push(r)
    }

    // Conversation members = sender + every same-tenant recipient (agents
    // we know, humans we know). External addresses don't get a participant
    // row — they're reachable only through email_messages.from_addr.
    const memberIds = new Set<string>([me])
    for (const r of [...toResolved, ...ccResolved]) {
      const inHouse = await pool.query<{ id: string }>(
        `SELECT id FROM participants
          WHERE LOWER(email) = $1 AND company_id = $2 AND departed_at IS NULL LIMIT 1`,
        [r.addr, tenant],
      )
      if (inHouse.rows[0]) { memberIds.add(inHouse.rows[0].id); continue }
      // Workspace humans by their auth email.
      const human = await pool.query<{ id: string }>(
        `SELECT u.id FROM users u
           JOIN company_members cm ON cm.user_id = u.id
          WHERE LOWER(u.email) = $1 AND cm.company_id = $2 LIMIT 1`,
        [r.addr, tenant],
      )
      if (human.rows[0]) memberIds.add(human.rows[0].id)
    }

    const messageId = mintMessageId()
    const conv = await findOrCreateEmailConversation({
      companyId: tenant, inReplyTo: null, references: [],
      subject, memberIds: [...memberIds],
    })
    const fromLine = formatAddress(sender.email, sender.displayName)
    const sendRes = await sendViaProvider({
      from: fromLine,
      to: toResolved.map((r) => formatAddress(r.addr, r.name)),
      cc: ccResolved.length ? ccResolved.map((r) => formatAddress(r.addr, r.name)) : undefined,
      subject, text: body, messageId,
      attachments: resolvedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, path: a.publicUrl,
      })),
    })
    const persisted = await persistEmailMessage({
      conversationId: conv.conversationId,
      companyId: tenant,
      authorId: me,
      direction: 'out',
      transportStatus: sendRes.ok ? 'sent' : 'failed',
      transportError: sendRes.error,
      smtpMessageId: sendRes.smtpMessageId ?? messageId,
      inReplyTo: null, references: [],
      subject,
      fromAddr: fromLine,
      toAddrs: toResolved.map((r) => formatAddress(r.addr, r.name)),
      ccAddrs: ccResolved.map((r) => formatAddress(r.addr, r.name)),
      body,
      attachments: resolvedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
        storageKey: a.storageKey,
      })),
    })
    res.status(sendRes.ok ? 200 : 502).json({
      messageId: persisted.messageId,
      conversationId: conv.conversationId,
      transportStatus: sendRes.ok ? 'sent' : 'failed',
      error: sendRes.error,
    })
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error('[email/send] failed', e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/* GET /email/:messageId/html — lazy-fetched, sanitized HTML body for a
 * single email row. Kept off the /messages JOIN to avoid bloating every
 * thread render with multi-KB HTML bodies that the user may never open.
 * Membership-gated (same rule as /email/reply) so cross-tenant peeks are
 * impossible. The response is `text/html` and goes straight into a
 * sandboxed iframe srcdoc on the client — the sanitizer is defense in
 * depth around that sandbox. */
api.get('/email/:messageId/html', async (req, res) => {
  try {
    const { userId: me, companyId: tenant } = await requireCompany(req)
    const messageId = req.params.messageId
    const { rows } = await pool.query<{
      conversation_id: string; html: string | null; subject: string
    }>(
      `SELECT em.conversation_id, em.html, em.subject
         FROM email_messages em
        WHERE em.message_id = $1 AND em.company_id = $2 LIMIT 1`,
      [messageId, tenant],
    )
    const row = rows[0]
    if (!row) { res.status(404).json({ error: 'unknown email message' }); return }
    if (!row.html) { res.status(204).end(); return }
    const { rows: cv } = await pool.query<{ members: string[] }>(
      `SELECT members FROM conversations WHERE id = $1`, [row.conversation_id],
    )
    if (!cv[0] || !cv[0].members.includes(me)) {
      res.status(403).json({ error: 'not a member of this thread' }); return
    }
    const { sanitizeEmailHtml } = await import('../../email.js')
    const safe = sanitizeEmailHtml(row.html)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    // Belt-and-braces: even if the client forgets the sandbox, these
    // headers neuter scripts at the browser level.
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https: data:")
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(safe)
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error('[email/html] failed', e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

api.post('/email/reply/:messageId', async (req, res) => {
  try {
    const { userId: me, companyId: tenant } = await requireCompany(req)
    const { messageId: replyTarget } = req.params
    const body = String(req.body?.body ?? '').trim().slice(0, 50_000)
    const ccRaw = Array.isArray(req.body?.cc) ? req.body.cc as unknown[] : []
    const attachRaw = Array.isArray(req.body?.attachments) ? req.body.attachments as unknown[] : []
    if (!body) { res.status(400).json({ error: 'body required' }); return }
    const resolvedAttachments = await resolveHttpAttachments(attachRaw)
    if (resolvedAttachments instanceof Error) {
      res.status(400).json({ error: resolvedAttachments.message }); return
    }

    const { rows: orig } = await pool.query<{
      conversation_id: string
      smtp_message_id: string | null
      references_chain: string[]
      subject: string
      from_addr: string
      to_addrs: string[]
      cc_addrs: string[]
    }>(
      `SELECT conversation_id, smtp_message_id, references_chain,
              subject, from_addr, to_addrs, cc_addrs
         FROM email_messages WHERE message_id = $1 AND company_id = $2`,
      [replyTarget, tenant],
    )
    const o = orig[0]
    if (!o) { res.status(404).json({ error: 'unknown email message' }); return }
    const { rows: cv } = await pool.query<{ members: string[] }>(
      `SELECT members FROM conversations WHERE id = $1`, [o.conversation_id],
    )
    if (!cv[0] || !cv[0].members.includes(me)) {
      res.status(403).json({ error: 'not a member of this thread' }); return
    }

    const {
      formatAddress, sendViaProvider,
      persistEmailMessage, mintMessageId, normalizeMessageId,
      ensureParticipantAddress, sanitizeSubject, splitReplyAddresses,
    } = await import('../../email.js')
    // Sender must use a lingxiloop-domain From line (Resend won't accept
    // user's gmail/outlook). Same scheme as agents.
    const sender = await ensureParticipantAddress(me, tenant)
    if (!sender) { res.status(400).json({ error: 'no email address available for your account in this workspace' }); return }
    // Pull the user's auth email too — used to dedupe self out of the
    // reply-to list (the original may have CC'd me at my real address).
    const { rows: ue } = await pool.query<{ email: string | null }>(
      `SELECT email FROM users WHERE id = $1`, [me],
    )
    const userAuthEmail = ue[0]?.email ?? null

    // Reply-all split: TO = original From, CC = original To+Cc minus self.
    // Self is identified by EITHER the lingxiloop address OR the auth email —
    // the original may list me under either (or both, if I CC'd myself
    // externally).
    const selfAddrs = [sender.email.toLowerCase()]
    if (userAuthEmail) selfAddrs.push(userAuthEmail.toLowerCase())
    const { to: replyTo, cc: replyCc } = splitReplyAddresses({
      originalFrom: o.from_addr,
      originalTo: o.to_addrs ?? [],
      originalCc: o.cc_addrs ?? [],
      selfAddresses: selfAddrs,
    })
    if (replyTo.length === 0) { res.status(400).json({ error: 'no other recipients to reply to' }); return }

    const ccResolved: { addr: string; name: string | null }[] = []
    for (const raw of ccRaw) {
      const r = await resolveHttpRecipient(String(raw), { companyId: tenant })
      if (!r) { res.status(400).json({ error: `unresolved cc: ${raw}` }); return }
      ccResolved.push(r)
    }
    // Append user-supplied CCs to the original CC list, de-duping against
    // self and the new TO so the same address never appears twice.
    const ccSeen = new Set<string>([
      ...selfAddrs,
      ...replyTo.map((t) => { const m = /<([^>]+)>/.exec(t); return (m ? m[1] : t).toLowerCase() }),
      ...replyCc.map((c) => { const m = /<([^>]+)>/.exec(c); return (m ? m[1] : c).toLowerCase() }),
    ])
    const ccCombined = [...replyCc]
    for (const r of ccResolved) {
      if (ccSeen.has(r.addr)) continue
      ccSeen.add(r.addr)
      ccCombined.push(formatAddress(r.addr, r.name))
    }

    const subject = /^(re|fwd|fw)\s*:/i.test(o.subject) ? sanitizeSubject(o.subject) : sanitizeSubject(`Re: ${o.subject}`)
    const newReferences = [...(o.references_chain ?? []), ...(o.smtp_message_id ? [o.smtp_message_id] : [])]
      .filter((x): x is string => Boolean(x))
    const inReplyTo = o.smtp_message_id ? normalizeMessageId(o.smtp_message_id) : null
    const messageId = mintMessageId()
    const fromLine = formatAddress(sender.email, sender.displayName)
    const sendRes = await sendViaProvider({
      from: fromLine, to: replyTo,
      cc: ccCombined.length ? ccCombined : undefined,
      subject, text: body,
      inReplyTo: inReplyTo ?? undefined,
      references: newReferences,
      messageId,
      attachments: resolvedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, path: a.publicUrl,
      })),
    })
    const persisted = await persistEmailMessage({
      conversationId: o.conversation_id,
      companyId: tenant,
      authorId: me,
      direction: 'out',
      transportStatus: sendRes.ok ? 'sent' : 'failed',
      transportError: sendRes.error,
      smtpMessageId: sendRes.smtpMessageId ?? messageId,
      inReplyTo, references: newReferences,
      subject, fromAddr: fromLine,
      toAddrs: replyTo, ccAddrs: ccCombined,
      body,
      attachments: resolvedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
        storageKey: a.storageKey,
      })),
    })
    // Auto-ack — replying definitionally means I read the original.
    await pool.query(
      `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = NOW()`,
      [me, o.conversation_id],
    )
    res.status(sendRes.ok ? 200 : 502).json({
      messageId: persisted.messageId,
      conversationId: o.conversation_id,
      transportStatus: sendRes.ok ? 'sent' : 'failed',
      error: sendRes.error,
    })
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error('[email/reply] failed', e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})
