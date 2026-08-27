import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import type { AttachmentPayload } from '../../contracts/attachments.js'
import { pool } from '../../db/pool.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable, requireCompany } from '../../http/request-context.js'
import { parseMentions as parseChatMentions } from '../../mentions.js'
import { CH_MESSAGE_NEW, CH_REACTIONS, publish, } from '../../redis.js'
import { freshenAttachmentUrl, storage, } from '../../storage.js'

export const messagesServiceRoutes = Router()
const api = messagesServiceRoutes

// The maintenance-window cutover is intentionally one-way for chat. Email
// threads remain product assets backed by the email transport tables, so they
// may continue into the handlers below; every IM conversation is rejected
// before any legacy message read or write can run.
api.all('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { companyId } = await requireCompany(req)
    const { rows } = await pool.query<{ kind: string }>(
      `SELECT kind FROM conversations WHERE id=$1 AND company_id=$2 LIMIT 1`,
      [req.params.id, companyId],
    )
    if (rows[0]?.kind === 'email') { next(); return }
    res.status(410).json({ error: 'legacy chat API retired; use WuKongIM', transport: 'wukongim' })
  } catch (error) { next(error) }
})

api.get('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params
  try {
    // Membership-gated read. Tenant-gate alone used to let any peer in the
    // same workspace pull the full transcript of someone else's DM as long
    // as they knew (or guessed) the conversation id; requireConversationMember
    // closes that path. There is no observer bypass for agent-only rooms.
    const { companyId: tenant } = await requireConversationMember(req, id)
    // Cursor pagination. No params → most recent `limit` messages, sorted
    // ASC (the historical contract). `before=<sequence>` returns the page
    // strictly older than that cursor — clients pass the smallest sequence
    // they already hold to fetch the next batch upward. Clamp to keep a
    // single request from pulling the whole transcript by accident.
    const rawLimit = Number.parseInt(String(req.query.limit ?? ''), 10)
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 80
    const rawBefore = Number.parseInt(String(req.query.before ?? ''), 10)
    const before = Number.isFinite(rawBefore) ? rawBefore : null
    const params: unknown[] = [id, tenant]
    let beforeClause = ''
    if (before !== null) {
      params.push(before)
      beforeClause = ` AND m.sequence < $${params.length}`
    }
    params.push(limit)
    const limitParam = `$${params.length}`
    const { rows } = await pool.query(
      `SELECT
          m.id, m.conversation_id AS "conversationId",
          m.author_id AS "authorId", m.kind, m.body, m.sequence,
          m.mentioned_ids AS "mentionedIds", m.mention_all AS "mentionAll",
          m.tool, m.attachment, m.poll, m.handoff, m.approval,
          -- Per-option vote tallies for polls. Empty array for non-poll
          -- rows. voterIds is sorted so the client can diff cheaply across
          -- successive WS poll.updated events.
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'optionId', pv.option_id,
              'count', pv.cnt,
              'voterIds', pv.voter_ids
            ) ORDER BY pv.cnt DESC, pv.option_id ASC)
              FROM (
                SELECT option_id,
                       COUNT(*)::int AS cnt,
                       array_agg(voter_participant_id ORDER BY voter_participant_id) AS voter_ids
                  FROM poll_votes
                 WHERE message_id = m.id
                 GROUP BY option_id
              ) pv
          ), '[]'::jsonb) AS "pollTallies",
          m.quoted_message_id AS "quotedMessageId",
          m.created_at AS "createdAt",
          -- Email-specific fields, only populated for kind='email'. We
          -- LEFT JOIN here instead of stashing the headers on messages
          -- itself so the renderer gets a typed "email" payload (subject,
          -- from, to[], cc[], direction, transport_status, in_reply_to)
          -- with no JSONB-shape guessing in the client.
          (
            SELECT jsonb_build_object(
              'subject', em.subject,
              'from', em.from_addr,
              'to', em.to_addrs,
              'cc', em.cc_addrs,
              'direction', em.direction,
              'transportStatus', em.transport_status,
              'transportError', em.transport_error,
              'smtpMessageId', em.smtp_message_id,
              'inReplyTo', em.in_reply_to,
              'hasHtml', em.html IS NOT NULL,
              'autoSubmitted', em.auto_submitted,
              'attachments', COALESCE(
                (SELECT jsonb_agg(jsonb_build_object(
                    'id', ea.id,
                    'filename', ea.filename,
                    'mimeType', ea.mime_type,
                    'sizeBytes', ea.size_bytes,
                    'storageKey', ea.storage_key,
                    'truncated', ea.truncated
                  ) ORDER BY ea.created_at)
                   FROM email_attachments ea
                  WHERE ea.message_id = m.id),
                '[]'::jsonb)
            )
              FROM email_messages em
             WHERE em.message_id = m.id
          ) AS "email",
          -- mine (did I react?) is deliberately NOT computed here. The
          -- same reactions array is reused over WS broadcast where "I"
          -- varies per recipient; renderer derives it from users.
          COALESCE(
            (
              SELECT jsonb_agg(jsonb_build_object(
                'emoji', emoji,
                'count', count,
                'users', users
              ))
              FROM (
                SELECT
                  emoji,
                  COUNT(*)::int AS count,
                  array_agg(user_id ORDER BY user_id) AS users
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
                ORDER BY count DESC, emoji ASC
              ) r
            ),
            '[]'::jsonb
          ) AS "reactions",
          -- Resolve the quoted message inline so the client doesn't need a
          -- second roundtrip per reply. Trimmed body (240 chars) keeps the
          -- payload small; if the quoted row is gone (soft-FK left it NULL
          -- on delete) the whole field is NULL — renderer shows "[deleted]".
          (
            SELECT jsonb_build_object(
              'id', qm.id,
              'authorId', qm.author_id,
              -- Author can be a participant (agent/human) OR a human keyed by
              -- user id; COALESCE both so the quote shows a NAME, not a raw id.
              'authorName', COALESCE(qp.name, qu.display_name, qm.author_id),
              'kind', qm.kind,
              'body', LEFT(qm.body, 240),
              'sequence', qm.sequence
            )
              FROM messages qm
              LEFT JOIN participants qp ON qp.id = qm.author_id AND qp.company_id = $2
              LEFT JOIN users qu ON qu.id = qm.author_id
             WHERE qm.id = m.quoted_message_id
               AND qm.conversation_id = m.conversation_id
          ) AS "quoted",
          -- Reply count — number of OTHER messages quoting this one. Lets
          -- the bubble render a "N 条回复" affordance to open the thread
          -- drawer without a separate request per message.
          (
            SELECT COUNT(*)::int
              FROM messages rm
             WHERE rm.quoted_message_id = m.id
          ) AS "replyCount"
        FROM messages m
        WHERE m.conversation_id = $1${beforeClause}
        ORDER BY m.sequence DESC
        LIMIT ${limitParam}`,
      params,
    )
    // Pulled DESC for the LIMIT to land on the *newest* `limit` rows; flip
    // back to ASC so the renderer's append-only assumptions still hold.
    rows.reverse()
    // Re-sign every persisted attachment URL with a fresh expiry so
    // historical messages don't break after the original signature's TTL.
    // No-op for attachments without a stored `key` (legacy local mode).
    //
    // A storage-backend hiccup on ONE row used to 500 the whole list —
    // wrap each refresh so a single bad attachment falls back to its
    // stored (possibly stale) URL instead of bringing down the response.
    for (const row of rows) {
      if (!row.attachment) continue
      try {
        row.attachment = await freshenAttachmentUrl(row.attachment)
      } catch (e) {
        console.warn(
          `[messages] freshenAttachmentUrl failed for message ${row.id} in ${id}; ` +
          `falling back to stored URL`, e,
        )
      }
    }
    // Email attachments: same idea, different shape. The SQL JOIN returns
    // each attachment with its storage_key; resolve a fresh public URL so
    // the client can <a href=…> straight away. Truncated entries (worker
    // refused to forward bytes) keep url=null — the UI shows "(too large)".
    for (const row of rows) {
      const r = row as Record<string, unknown> & { email?: { attachments?: Array<{ storageKey: string | null; url?: string | null; truncated?: boolean }> } | null }
      const atts = r.email?.attachments
      if (!atts || atts.length === 0) continue
      for (const a of atts) {
        if (!a.storageKey || a.truncated) { a.url = null; continue }
        try { a.url = await storage.publicUrl(a.storageKey) }
        catch (e) {
          console.warn(`[messages] email attachment URL resolve failed for ${a.storageKey} in ${id}`, e)
          a.url = null
        }
      }
    }
    res.json(rows)
  } catch (e) {
    // Don't bury HttpError under 500 — those carry real status codes
    // (401/403/404 from the auth helpers) the client needs to branch on.
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error(`[messages] GET /conversations/${id}/messages failed`, e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

api.post('/conversations/:id/messages', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant, projectId } = await requireConversationMember(req, String(id))
  await assertProjectWritable(projectId)
  const body = String(req.body?.body ?? '').trim()
  const rawAttachment = req.body?.attachment
  let attachment: AttachmentPayload | null = null
  if (rawAttachment && typeof rawAttachment === 'object') {
    const a = rawAttachment as Record<string, unknown>
    if (typeof a.url === 'string' && typeof a.name === 'string') {
      attachment = {
        url: a.url,
        name: a.name,
        kind: (a.kind === 'pdf' || a.kind === 'file' || a.kind === 'fig' ? a.kind : 'img') as AttachmentPayload['kind'],
        mime: typeof a.mime === 'string' ? a.mime : undefined,
        size: typeof a.size === 'number' ? a.size : undefined,
        // Preserve the storage `key` so we can later re-sign the URL on
        // every read — without it, signed URLs would expire and break
        // historical message bubbles after their TTL window.
        key: typeof a.key === 'string' ? a.key : undefined,
      }
    }
  }
  // Allow empty body when an attachment is present (e.g. user just shares an image)
  if (!body && !attachment) {
    res.status(400).json({ error: 'empty message' })
    return
  }

  const rawQuotedId = req.body?.quotedMessageId
  const quotedMessageId = typeof rawQuotedId === 'string' && rawQuotedId.length > 0
    ? rawQuotedId
    : null

  // Optional client-supplied dedup key. Echoed back on CH_MESSAGE_NEW so the
  // renderer can recognize its own optimistic bubble when the WS event races
  // the POST response. Length-capped so a malformed client can't bloat the
  // payload — opaque to the server otherwise.
  const rawClientId = req.body?.clientId
  const clientId = typeof rawClientId === 'string' && rawClientId.length > 0 && rawClientId.length <= 80
    ? rawClientId
    : null

  const { rows: convoRows } = await pool.query<{ members: string[]; kind: string }>(
    `SELECT members, kind FROM conversations WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  const convo = convoRows[0]
  if (!convo) {
    res.status(404).json({ error: 'conversation not found' })
    return
  }
  if (!convo.members.includes(me)) {
    res.status(403).json({ error: 'not a member of this conversation' })
    return
  }

  const { rows: mentionTargets } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM participants WHERE company_id = $1 AND id = ANY($2::text[])`,
    [tenant, convo.members],
  )
  const { mentionedIds, mentionAll } = parseChatMentions(body, mentionTargets)

  // Email conversations: auto-promote a "chat-style" reply into a real
  // email reply. Without this, typing in the chat input of an email
  // thread (or an agent calling `lingxiloop reply` from its CLI) would just
  // write a kind='text' row that the external recipient never sees.
  if (convo.kind === 'email') {
    if (!body) {
      res.status(400).json({ error: 'email replies require a body (attachments-only sends not supported here yet)' })
      return
    }
    try {
      const { replyInEmailConversation } = await import('../../email.js')
      const result = await replyInEmailConversation({
        conversationId: id, companyId: tenant, authorId: me, body,
        // Human user — leave autoSubmitted false. Agent path uses cmdReply
        // in the CLI which sets it true.
      })
      res.status(result.transportStatus === 'sent' ? 202 : 502).json({
        id: result.messageId,
        sequence: result.sequence,
        transportStatus: result.transportStatus,
        mock: result.mock,
        error: result.error,
      })
      return
    } catch (e) {
      console.error('[messages] email auto-promote failed', e)
      res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
      return
    }
  }

  // If the client asked to quote, prove that target message exists in THIS
  // same conversation. Cross-convo quotes would leak content across rooms
  // (the renderer inlines a summary regardless of who's in the target room),
  // so we reject those at the boundary. Silently drop instead of 400 if the
  // quoted id is unknown — most likely it was deleted between the user
  // hitting reply and us receiving the request; better to send the body
  // than fail the whole send.
  let quotedSummary: {
    id: string; authorId: string; authorName: string; kind: string;
    body: string; sequence: number
  } | null = null
  let resolvedQuotedId: string | null = null
  if (quotedMessageId) {
    const { rows: qr } = await pool.query<{
      id: string; author_id: string; author_name: string; kind: string;
      body: string; sequence: number
    }>(
      `SELECT m.id, m.author_id,
              COALESCE(p.name, u.display_name, m.author_id) AS author_name,
              m.kind, m.body, m.sequence
         FROM messages m
         LEFT JOIN participants p ON p.id = m.author_id AND p.company_id = $3
         LEFT JOIN users u ON u.id = m.author_id
        WHERE m.id = $1 AND m.conversation_id = $2`,
      [quotedMessageId, id, tenant],
    )
    if (qr[0]) {
      resolvedQuotedId = qr[0].id
      quotedSummary = {
        id: qr[0].id,
        authorId: qr[0].author_id,
        authorName: qr[0].author_name,
        kind: qr[0].kind,
        body: qr[0].body.slice(0, 240),
        sequence: qr[0].sequence,
      }
    }
  }

  const seqResult = await pool.query<{ seq: number }>(
    `INSERT INTO conversation_counters (conversation_id, next_sequence)
     VALUES ($1, 2)
     ON CONFLICT (conversation_id) DO UPDATE SET next_sequence = conversation_counters.next_sequence + 1
     RETURNING next_sequence - 1 AS seq`,
    [id],
  )
  const sequence = seqResult.rows[0]?.seq ?? 1

  const messageId = `m-${randomUUID()}`
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, attachment, quoted_message_id, company_id, mentioned_ids, mention_all)
     VALUES ($1,$2,$3,'text',$4,$5,$6::jsonb,$7,$8,$9::jsonb,$10)`,
    [messageId, id, me, body, sequence, attachment ? JSON.stringify(attachment) : null, resolvedQuotedId, tenant, JSON.stringify(mentionedIds), mentionAll],
  )
  await pool.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [id])

  // Drop the message into the bus. The mailbox scheduler (subscribed to
  // CH_MESSAGE_NEW) wakes every agent member and lets each decide for itself
  // whether to reply, react, dm, or stay silent. The companyId tag lets
  // the WS bridge filter who sees it.
  await publish(CH_MESSAGE_NEW, {
    type: 'message.new',
    conversationId: id,
    companyId: tenant,
    workspaceId: projectId ?? undefined,
    message: {
      id: messageId, conversationId: id, authorId: me,
      kind: 'text', body, sequence, at: new Date().toISOString(),
      attachment: attachment ?? undefined,
      quotedMessageId: resolvedQuotedId ?? undefined,
      quoted: quotedSummary ?? undefined,
      mentionedIds,
      mentionAll,
      clientId: clientId ?? undefined,
    },
  })

  // Climate signal: @-mentioned agents feel mildly more affinity / trust
  // toward the speaker (engagement is positive). Fire-and-forget so we
  // don't block the response on small writes.
  void import('../../agents/climate.js').then(({ bumpClimateFromMentions }) =>
    bumpClimateFromMentions({ body, speakerId: me, companyId: tenant }),
  )

  res.status(202).json({
    id: messageId,
    sequence,
    quotedMessageId: resolvedQuotedId ?? undefined,
    quoted: quotedSummary ?? undefined,
    mentionedIds,
    mentionAll,
  })
})

/** Thread fetch: every message in `id` whose quoted_message_id == rootId.
 *  Used by the reply drawer / thread sidebar. Returns the SAME shape as
 *  GET /conversations/:id/messages so the renderer can reuse its bubble
 *  component. Direct children only — we don't recurse, mirroring how
 *  Telegram / Slack present a single flat thread under one root. */
api.get('/conversations/:id/messages/:rootId/replies', async (req, res) => {
  const { id, rootId } = req.params
  try {
    // Same membership rule as the parent /messages handler — replies live in
    // the same thread, so the same access bar applies.
    const { companyId: tenant } = await requireConversationMember(req, id)
    const { rows } = await pool.query(
      `SELECT
          m.id, m.conversation_id AS "conversationId",
          m.author_id AS "authorId", m.kind, m.body, m.sequence,
          m.tool, m.attachment, m.poll, m.handoff, m.approval,
          -- Per-option vote tallies for polls. Empty array for non-poll
          -- rows. voterIds is sorted so the client can diff cheaply across
          -- successive WS poll.updated events.
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'optionId', pv.option_id,
              'count', pv.cnt,
              'voterIds', pv.voter_ids
            ) ORDER BY pv.cnt DESC, pv.option_id ASC)
              FROM (
                SELECT option_id,
                       COUNT(*)::int AS cnt,
                       array_agg(voter_participant_id ORDER BY voter_participant_id) AS voter_ids
                  FROM poll_votes
                 WHERE message_id = m.id
                 GROUP BY option_id
              ) pv
          ), '[]'::jsonb) AS "pollTallies",
          m.quoted_message_id AS "quotedMessageId",
          m.created_at AS "createdAt",
          -- mine is derived on the renderer from users; see the main
          -- /messages handler for the rationale.
          COALESCE(
            (
              SELECT jsonb_agg(jsonb_build_object(
                'emoji', emoji,
                'count', count,
                'users', users
              ))
              FROM (
                SELECT
                  emoji,
                  COUNT(*)::int AS count,
                  array_agg(user_id ORDER BY user_id) AS users
                FROM message_reactions
                WHERE message_id = m.id
                GROUP BY emoji
                ORDER BY count DESC, emoji ASC
              ) r
            ),
            '[]'::jsonb
          ) AS "reactions",
          (
            SELECT jsonb_build_object(
              'id', qm.id,
              'authorId', qm.author_id,
              'authorName', COALESCE(qp.name, qm.author_id),
              'kind', qm.kind,
              'body', LEFT(qm.body, 240),
              'sequence', qm.sequence
            )
              FROM messages qm
              LEFT JOIN participants qp ON qp.id = qm.author_id AND qp.company_id = $3
             WHERE qm.id = m.quoted_message_id
               AND qm.conversation_id = m.conversation_id
          ) AS "quoted"
        FROM messages m
        WHERE m.conversation_id = $1
          AND m.quoted_message_id = $2
        ORDER BY m.sequence ASC`,
      [id, rootId, tenant],
    )
    for (const row of rows) {
      if (!row.attachment) continue
      try { row.attachment = await freshenAttachmentUrl(row.attachment) }
      catch (e) {
        console.warn(
          `[replies] freshenAttachmentUrl failed for message ${row.id}; ` +
          `falling back to stored URL`, e,
        )
      }
    }
    res.json(rows)
  } catch (e) {
    // Don't bury HttpError under 500 — those carry real status codes
    // (401/403/404 from the auth helpers) the client needs to branch on.
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error(`[replies] GET /conversations/${id}/messages/${rootId}/replies failed`, e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

/* ============== Reactions ============== */

api.post('/messages/:id/reactions', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant } = await requireCompany(req)
  const emoji = String(req.body?.emoji ?? '').trim()
  if (!emoji) { res.status(400).json({ error: 'emoji required' }); return }

  // Resolve conversation + author *and* enforce that the caller is in the
  // conversation's members array. The previous query was tenant-only, which
  // let any peer add reactions to private DMs they had no business reading.
  // We pull `members` in the same round-trip so we don't need a follow-up
  // SELECT just to gate.
  const { rows: cv } = await pool.query<{
    conversation_id: string; author_id: string; members: string[]
  }>(
    `SELECT m.conversation_id, m.author_id, c.members
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND c.company_id = $2 LIMIT 1`,
    [id, tenant],
  )
  if (!cv[0]) { res.status(404).json({ error: 'message not found' }); return }
  if (!cv[0].members.includes(me)) {
    // Stay opaque on permission denied (same 404 a cross-tenant message
    // returns) so the response doesn't disclose existence.
    res.status(404).json({ error: 'message not found' }); return
  }
  const conversationId = cv[0].conversation_id
  const messageAuthorId = cv[0].author_id

  // Toggle
  const existing = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM message_reactions
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [id, me, emoji],
  )
  const wasRemoval = Number(existing.rows[0]?.count ?? '0') > 0
  if (wasRemoval) {
    await pool.query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [id, me, emoji],
    )
  } else {
    await pool.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [id, me, emoji],
    )
  }

  // Climate signal: a new reaction TO an agent's message bumps that
  // agent's affinity toward the reactor (they feel valued). Un-reacting
  // doesn't dock — the "I didn't mean it" path shouldn't be punitive.
  if (!wasRemoval) {
    const { bumpClimate } = await import('../../agents/climate.js')
    void bumpClimate({
      agentId: messageAuthorId, aboutId: me,
      affinity: 0.05, trust: 0.02,
      note: `received ${emoji} from ${me}`,
    })
  }

  // Aggregate. No server-side `mine` flag: the same row is broadcast over
  // WS to every client in the tenant, and "is this mine" is per-recipient.
  // Renderer derives mine = users.includes(meId) — see fromApi /
  // applyEvent in src/stores/messages.ts.
  const { rows: agg } = await pool.query<{ emoji: string; count: number; users: string[] }>(
    `SELECT emoji,
            COUNT(*)::int AS count,
            array_agg(user_id ORDER BY user_id) AS users
       FROM message_reactions WHERE message_id = $1
       GROUP BY emoji ORDER BY count DESC, emoji ASC`,
    [id],
  )

  await publish(CH_REACTIONS, {
    type: 'message.reactions',
    conversationId,
    companyId: tenant,
    messageId: id,
    reactions: agg,
  })

  res.json({ reactions: agg })
})
