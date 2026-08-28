import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable, requireCompany } from '../../http/request-context.js'
import { CH_REACTIONS, publish, } from '../../redis.js'
import { freshenAttachmentUrl, storage, } from '../../storage.js'

export const messagesRouter = Router()
const api = messagesRouter

// This HTTP collection is the native email projection. Chat is WuKongIM-only.
api.all('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { companyId } = await requireCompany(req)
    const { rows } = await pool.query<{ kind: string }>(
      `SELECT kind FROM conversations WHERE id=$1 AND company_id=$2 LIMIT 1`,
      [req.params.id, companyId],
    )
    if (rows[0]?.kind === 'email') { next(); return }
    res.status(410).json({ error: 'REST message writes are retired; use WuKongIM', transport: 'wukongim' })
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
    // Re-sign every persisted native attachment key.
    for (const row of rows) {
      if (!row.attachment) continue
      row.attachment = await freshenAttachmentUrl(row.attachment)
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
  const { userId: me, companyId: tenant, projectId, kind } = await requireConversationMember(req, String(id))
  await assertProjectWritable(projectId)
  const body = String(req.body?.body ?? '').trim()
  if (kind !== 'email') {
    res.status(410).json({ error: 'REST message writes are retired; use WuKongIM', transport: 'wukongim' })
    return
  }
  if (!body) {
    res.status(400).json({ error: 'email replies require a body' })
    return
  }
  try {
    const { replyInEmailConversation } = await import('../../email.js')
    const result = await replyInEmailConversation({ conversationId: id, companyId: tenant, authorId: me, body })
    res.status(result.transportStatus === 'sent' ? 202 : 502).json({
      id: result.messageId,
      sequence: result.sequence,
      transportStatus: result.transportStatus,
      error: result.error,
    })
  } catch (error) {
    console.error('[messages] email auto-promote failed', error)
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) })
  }
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
      row.attachment = await freshenAttachmentUrl(row.attachment)
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
    await bumpClimate({
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
