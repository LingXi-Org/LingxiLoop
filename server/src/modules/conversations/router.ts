import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { requireConversationMember } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertConversationWritable, assertProjectWritable, requireCompany, requireCompanyArtifactContext, requireWorkspace } from '../../http/request-context.js'
import { assertNotManagedPulse, isTeacherRoom } from '../../learning/visibility.js'
import { CH_CONVO_UPDATED, CH_TYPING, publish, } from '../../redis.js'

export const conversationsRouter = Router()
const api = conversationsRouter

api.get('/conversations', async (req, res) => {
  const { userId: me, companyId: tenant, projectId } = await requireCompanyArtifactContext(req)
  const { rows } = await pool.query(
    `SELECT
        c.id, c.kind,
        CASE
          WHEN c.kind = 'direct' THEN COALESCE(other_participant.name, c.title)
          ELSE c.title
        END AS title,
        c.subtitle, c.topic, c.members, c.leader_id AS "leaderId", c.pinned, c.tag, c.pulled_by AS "pulledBy",
        c.created_at AS "createdAt", c.updated_at AS "updatedAt",
        -- Per-user mute. Expired mutes naturally evaluate to false so an
        -- "until tomorrow" silence wears off without needing a sweeper job.
        (mu.user_id IS NOT NULL AND (mu.muted_until IS NULL OR mu.muted_until > NOW())) AS muted,
        mu.muted_until AS "mutedUntil",
        (
          SELECT json_build_object(
            'id', m.id,
            'authorId', m.author_id,
            'kind', m.kind,
            'body', m.body,
            'tool', m.tool,
            'attachment', m.attachment,
            'createdAt', m.created_at,
            -- For email messages, surface the subject + direction so the
            -- sidebar preview can show "Re: contract draft" instead of a
            -- raw body excerpt. NULL for non-email messages — the client
            -- branches on last.kind === 'email'.
            'email', (
              SELECT jsonb_build_object(
                'subject', em.subject,
                'direction', em.direction,
                'from', em.from_addr
              )
                FROM email_messages em
               WHERE em.message_id = m.id
            )
          )
          FROM messages m
          WHERE m.conversation_id = c.id
          ORDER BY m.sequence DESC
          LIMIT 1
        ) AS "lastMessage",
        COALESCE((
          SELECT COUNT(*)::int
            FROM messages m
           WHERE m.conversation_id = c.id
             AND m.author_id <> $1
             AND m.created_at > COALESCE(
               (SELECT last_read_at FROM conversation_reads WHERE user_id = $1 AND conversation_id = c.id),
               '1970-01-01T00:00:00Z'::timestamptz
             )
        ), 0) AS "unreadCount"
      FROM conversations c
      LEFT JOIN conversation_mutes mu ON mu.conversation_id = c.id AND mu.user_id = $1
      LEFT JOIN LATERAL (
        SELECT p_other.name
          FROM jsonb_array_elements_text(c.members) WITH ORDINALITY AS member(id, ord)
          JOIN participants p_other
            ON p_other.id = member.id
           AND p_other.company_id = c.company_id
         WHERE member.id <> $1
         ORDER BY member.ord
         LIMIT 1
      ) other_participant ON c.kind = 'direct'
      WHERE c.company_id = $2
        AND c.project_id = $3
        -- Only conversations the caller is actually in. Without this,
        -- agent-to-agent direct chats (members=[agentA, agentB]) must not leak
        -- into the user's list when they are not a participant.
        AND c.members @> to_jsonb(ARRAY[$1::text])
        AND (
          NOT EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms teacher_room
             WHERE teacher_room.conversation_id=c.id AND teacher_room.company_id=c.company_id
          )
          OR EXISTS (
            SELECT 1
              FROM learning_course_teacher_rooms teacher_room
              JOIN courses teacher_course
                ON teacher_course.id=teacher_room.course_id AND teacher_course.company_id=teacher_room.company_id
              JOIN projects teacher_project
                ON teacher_project.id=teacher_course.project_id AND teacher_project.company_id=teacher_course.company_id
              JOIN course_members current_teacher
                ON current_teacher.course_id=teacher_course.id AND current_teacher.company_id=teacher_course.company_id
               AND current_teacher.user_id=$1 AND current_teacher.role='teacher'
             WHERE teacher_room.conversation_id=c.id AND teacher_room.company_id=c.company_id
               AND teacher_room.status='active' AND teacher_project.status='active'
          )
        )
      ORDER BY c.pinned DESC, c.updated_at DESC`,
    [me, tenant, projectId],
  )
  res.json(rows)
})
/**
 * Create a new group conversation. Body: { title, members[], leaderId, subtitle? }.
 * The caller is auto-included; at least one other member is required.
 */
api.post('/conversations', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  const title = String(req.body?.title ?? '').trim().slice(0, 80)
  const topic = req.body?.topic ? String(req.body.topic).trim().slice(0, 200) || null : null
  const leaderId = typeof req.body?.leaderId === 'string' ? req.body.leaderId.trim() : ''
  const rawMembers = Array.isArray(req.body?.members) ? req.body.members : []
  const memberSet = new Set<string>()
  for (const m of rawMembers) if (typeof m === 'string') memberSet.add(m.trim())
  memberSet.add(me)
  const members = [...memberSet].filter(Boolean)
  if (!title) { res.status(400).json({ error: 'title required' }); return }
  if (!leaderId) { res.status(400).json({ error: 'leaderId required' }); return }
  if (members.length < 2) { res.status(400).json({ error: 'pick at least one teammate' }); return }

  const projectId = typeof req.body?.workspaceId === 'string' ? req.body.workspaceId.trim() : ''
  if (!projectId) { res.status(400).json({ error: 'workspaceId required' }); return }
  const workspace = await requireWorkspace(req, projectId)
  if (workspace.projectStatus !== 'active') { res.status(409).json({ error: 'archived courses are read-only' }); return }

  // Validate every member exists in this tenant.
  const { rows: existing } = await pool.query<{ id: string; kind: string; departed_at: string | null }>(
    `SELECT id, kind, departed_at FROM participants WHERE id = ANY($1::text[]) AND company_id = $2`,
    [members, tenant],
  )
  const validIds = new Set(existing.map((r) => r.id))
  const missing = members.filter((m) => !validIds.has(m))
  if (missing.length > 0) {
    res.status(400).json({ error: `unknown participant(s): ${missing.join(', ')}` }); return
  }
  const { rows: managedMembers } = await pool.query(
    `SELECT 1 FROM learning_project_teacher_agents
      WHERE company_id=$1 AND agent_id=ANY($2::text[]) LIMIT 1`,
    [tenant, members],
  )
  if (managedMembers[0]) { res.status(403).json({ error: 'Pulse can only belong to its provisioned teacher room' }); return }
  const leader = existing.find((member) => member.id === leaderId)
  if (!leader || leader.kind !== 'agent' || leader.departed_at) {
    res.status(400).json({ error: 'leaderId must be an active agent member' }); return
  }
  if (workspace.courseId) {
    const humanIds = existing.filter((member) => member.kind === 'human').map((member) => member.id)
    const { rows: enrolled } = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM course_members WHERE course_id = $1 AND user_id = ANY($2::text[])`,
      [workspace.courseId, humanIds],
    )
    const enrolledIds = new Set(enrolled.map((member) => member.user_id))
    const outsiders = humanIds.filter((memberId) => !enrolledIds.has(memberId))
    if (outsiders.length > 0) { res.status(400).json({ error: 'all human members must belong to the course' }); return }
  }

  const id = `g-${randomUUID().slice(0, 8)}`
  await pool.query(
    `INSERT INTO conversations (id, kind, title, topic, members, leader_id, pinned, tag, pulled_by, company_id, project_id)
     VALUES ($1, 'group', $2, $3, $4::jsonb, $5, FALSE, NULL, NULL, $6, $7)`,
    [id, title, topic, JSON.stringify(members), leaderId, tenant, projectId],
  )
  await pool.query(`INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)`, [id])
  res.status(201).json({ id, members, leaderId, projectId })
})

/** Change a group's leader. Any human member may choose an active agent member. */
api.post('/conversations/:id/leader', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant, projectId } = await requireConversationMember(req, id)
  await assertProjectWritable(projectId)
  const leaderId = typeof req.body?.leaderId === 'string' ? req.body.leaderId.trim() : ''
  if (!leaderId) { res.status(400).json({ error: 'leaderId required' }); return }
  await assertNotManagedPulse(leaderId, tenant)
  const { rows } = await pool.query<{ members: string[]; kind: string }>(
    `SELECT members, kind FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  const conversation = rows[0]
  if (!conversation) { res.status(404).json({ error: 'not found' }); return }
  if (conversation.kind !== 'group') { res.status(400).json({ error: 'only group chats have a leader' }); return }
  if (!conversation.members.includes(me)) { res.status(403).json({ error: 'only members can change the leader' }); return }
  if (!conversation.members.includes(leaderId)) { res.status(400).json({ error: 'leader must be a group member' }); return }
  const { rows: candidates } = await pool.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind, departed_at FROM participants WHERE id = $1 AND company_id = $2`, [leaderId, tenant],
  )
  if (candidates[0]?.kind !== 'agent' || candidates[0]?.departed_at) {
    res.status(400).json({ error: 'leader must be an active agent' }); return
  }
  await pool.query(
    `UPDATE conversations SET leader_id = $2, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, leaderId, tenant],
  )
  await publish(CH_CONVO_UPDATED, {
    type: 'conversation.updated', conversationId: id, companyId: tenant, workspaceId: projectId ?? undefined, patch: { leaderId },
  })
  res.json({ ok: true, leaderId })
})

/** Set or clear a conversation's topic. Any member can change it. */
api.post('/conversations/:id/topic', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant, projectId } = await requireConversationMember(req, id)
  await assertProjectWritable(projectId)
  const raw = req.body?.topic
  const topic = raw === null || raw === '' ? null : (typeof raw === 'string' ? raw.trim().slice(0, 200) : null)
  const { rows } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!rows[0]) { res.status(404).json({ error: 'not found' }); return }
  if (!rows[0].members.includes(me)) {
    res.status(403).json({ error: 'only members can change the topic' }); return
  }
  await pool.query(
    `UPDATE conversations SET topic = $2, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, topic, tenant],
  )
  await publish(CH_CONVO_UPDATED, {
    type: 'conversation.updated',
    conversationId: id,
    companyId: tenant,
    workspaceId: projectId ?? undefined,
    patch: { topic },
  })
  res.json({ ok: true, topic })
})

/** Rename a group conversation. Members only; groups only — a DM's title is the
 *  other person's name (derived), so renaming it doesn't apply. */
api.post('/conversations/:id/title', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant, projectId } = await requireConversationMember(req, id)
  await assertProjectWritable(projectId)
  const title = String(req.body?.title ?? '').trim().slice(0, 80)
  if (!title) { res.status(400).json({ error: 'title required' }); return }
  const { rows } = await pool.query<{ members: string[]; kind: string }>(
    `SELECT members, kind FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!rows[0]) { res.status(404).json({ error: 'not found' }); return }
  if (rows[0].kind !== 'group') { res.status(400).json({ error: 'only group chats can be renamed' }); return }
  if (!rows[0].members.includes(me)) {
    res.status(403).json({ error: 'only members can rename the group' }); return
  }
  await pool.query(
    `UPDATE conversations SET title = $2, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, title, tenant],
  )
  await publish(CH_CONVO_UPDATED, {
    type: 'conversation.updated',
    conversationId: id,
    companyId: tenant,
    workspaceId: projectId ?? undefined,
    patch: { title },
  })
  res.json({ ok: true, title })
})

/** Find or create a 1-on-1 direct conversation between the caller and the
 *  given participant. Idempotent — clicking the DM button repeatedly always
 *  resolves to the same conversation. */
api.post('/conversations/direct', async (req, res) => {
  const { userId: me, companyId: tenant, projectId } = await requireCompanyArtifactContext(req, true)
  const workspace = await requireWorkspace(req, projectId)
  const otherId = String(req.body?.otherId ?? '').trim()
  if (!otherId) { res.status(400).json({ error: 'otherId required' }); return }
  if (otherId === me) { res.status(400).json({ error: 'cannot DM yourself' }); return }
  const { rows: pp } = await pool.query<{ id: string; kind: string }>(
    `SELECT id, kind FROM participants WHERE id = $1 AND company_id = $2`, [otherId, tenant],
  )
  if (!pp[0]) { res.status(404).json({ error: 'unknown participant' }); return }
  await assertNotManagedPulse(otherId, tenant)
  if (workspace.courseId && pp[0].kind === 'human') {
    const { rows: enrollment } = await pool.query(
      `SELECT 1 FROM course_members WHERE course_id=$1 AND user_id=$2`, [workspace.courseId, otherId],
    )
    if (!enrollment[0]) { res.status(404).json({ error: 'unknown participant' }); return }
  }

  // Look for an existing direct chat with exactly these two members.
  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT id FROM conversations
      WHERE kind = 'direct' AND company_id = $3 AND project_id = $4
        AND members @> to_jsonb(ARRAY[$1::text]) AND members @> to_jsonb(ARRAY[$2::text])
        AND jsonb_array_length(members) = 2
      ORDER BY updated_at DESC LIMIT 1`,
    [me, otherId, tenant, projectId],
  )
  if (existing[0]) { res.json({ id: existing[0].id, created: false }); return }

  const id = `direct-${otherId}-${randomUUID().slice(0, 6)}`
  const { rows: title } = await pool.query<{ name: string }>(
    `SELECT name FROM participants WHERE id = $1 AND company_id = $2`, [otherId, tenant],
  )
  await pool.query(
    `INSERT INTO conversations (id, kind, title, subtitle, members, pinned, tag, company_id, project_id)
     VALUES ($1, 'direct', $2, NULL, $3::jsonb, FALSE, $4, $5, $6)`,
    [id, title[0]?.name ?? otherId, JSON.stringify([me, otherId]), pp[0].kind === 'human' ? 'human' : null, tenant, projectId],
  )
  await pool.query(`INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 1)`, [id])
  res.status(201).json({ id, created: true })
})

/** Toggle (or set) the pinned state of a conversation. */
api.post('/conversations/:id/pin', async (req, res) => {
  const { id } = req.params
  // Pin state is column-level on conversations (shared across all viewers).
  // Without a membership gate, any tenant member could pin/unpin a private
  // DM they're not part of, mutating UI state for the real members.
  const { companyId: tenant } = await requireConversationMember(req, id)
  await assertConversationWritable(tenant, id)
  const { rows } = await pool.query<{ pinned: boolean }>(
    `SELECT pinned FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!rows[0]) { res.status(404).json({ error: 'not found' }); return }
  const requested = req.body?.pinned
  const next = typeof requested === 'boolean' ? requested : !rows[0].pinned
  await pool.query(
    `UPDATE conversations SET pinned = $2, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, next, tenant],
  )
  res.json({ ok: true, pinned: next })
})

/**
 * Mute (or unmute) a conversation for the caller. Per-user, never shared.
 *
 * Body shape:
 *   { mute: false }                         → unmute (delete row)
 *   { mute: true }                          → mute forever
 *   { mute: true, until: '<ISO timestamp>'} → mute until that wall-clock time
 *
 * `until` is parsed/validated server-side — any unparseable value is
 * rejected with 400 rather than silently falling back to "forever", which
 * would surprise the user. The client computes the wall-clock from the
 * picked duration (so "15 min" works regardless of clock skew between
 * the user's device and the server).
 */
api.post('/conversations/:id/mute', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  const { id } = req.params
  // Validate the conversation belongs to this tenant + the caller is a
  // member — same rule as every other per-convo mutation.
  const { rows: convo } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  if (!convo[0]) { res.status(404).json({ error: 'not found' }); return }
  if (!convo[0].members.includes(me)) { res.status(403).json({ error: 'not a member' }); return }
  const mute = req.body?.mute !== false  // default to mute=true if omitted
  if (!mute) {
    await pool.query(
      `DELETE FROM conversation_mutes WHERE user_id = $1 AND conversation_id = $2`,
      [me, id],
    )
    res.json({ ok: true, muted: false, mutedUntil: null })
    return
  }
  let until: Date | null = null
  if (req.body?.until !== undefined && req.body?.until !== null) {
    const parsed = new Date(String(req.body.until))
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: 'invalid until timestamp' }); return
    }
    // Reject already-in-the-past timestamps — those would be a no-op
    // silently dropped by the read-side filter, which is confusing.
    if (parsed.getTime() <= Date.now()) {
      res.status(400).json({ error: 'until must be in the future' }); return
    }
    until = parsed
  }
  await pool.query(
    `INSERT INTO conversation_mutes (user_id, conversation_id, muted_at, muted_until)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (user_id, conversation_id)
     DO UPDATE SET muted_at = NOW(), muted_until = EXCLUDED.muted_until`,
    [me, id, until],
  )
  res.json({ ok: true, muted: true, mutedUntil: until ? until.toISOString() : null })
})

/** Add a participant to an existing group. The caller must be a member.
 *  Posts a `joined` system row AFTER the members update — that order
 *  ensures the new member is in `members` when CH_MESSAGE_NEW fires,
 *  so the mailbox scheduler wakes them and they perceive the join. */
api.post('/conversations/:id/members', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant, projectId } = await requireConversationMember(req, id)
  await assertProjectWritable(projectId)
  const newMember = String(req.body?.id ?? '').trim()
  if (!newMember) { res.status(400).json({ error: 'id required' }); return }
  if (await isTeacherRoom(id, tenant)) { res.status(403).json({ error: 'teacher-room membership follows course teacher membership' }); return }
  const { rows } = await pool.query<{ kind: string; members: string[] }>(
    `SELECT kind, members FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  const c = rows[0]
  if (!c) { res.status(404).json({ error: 'not found' }); return }
  if (c.kind !== 'group') { res.status(400).json({ error: `cannot add to a ${c.kind} conversation` }); return }
  if (!c.members.includes(me)) { res.status(403).json({ error: 'only members can add others' }); return }
  if (c.members.includes(newMember)) { res.json({ ok: true, members: c.members, alreadyIn: true }); return }
  // Validate participant exists in this tenant.
  const { rows: existing } = await pool.query<{ id: string }>(
    `SELECT participant.id FROM participants participant
      WHERE participant.id=$1 AND participant.company_id=$2
        AND (
          participant.kind='agent'
          OR NOT EXISTS (SELECT 1 FROM courses WHERE project_id=$3)
          OR EXISTS (
            SELECT 1 FROM courses course JOIN course_members member ON member.course_id=course.id
             WHERE course.project_id=$3 AND member.user_id=participant.id
          )
        )`, [newMember, tenant, projectId],
  )
  if (!existing[0]) { res.status(400).json({ error: `unknown participant: ${newMember}` }); return }
  await assertNotManagedPulse(newMember, tenant)
  const next = [...c.members, newMember]
  await pool.query(
    `UPDATE conversations SET members = $2::jsonb, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, JSON.stringify(next), tenant],
  )
  const { postMembershipSystemMessage } = await import('../../agents/membership.js')
  await postMembershipSystemMessage({
    conversationId: id, companyId: tenant, actorId: me,
    kind: 'joined', participantId: newMember,
  })
  res.json({ ok: true, members: next })
})

/** Leave a group conversation — removes the caller from members.
 *  Posts the `left` system row BEFORE the members mutation so the
 *  caller's mailbox surfaces this final row in their next wake (the
 *  inbox query filters by current `c.members @> [me]`). */
api.post('/conversations/:id/leave', async (req, res) => {
  const { id } = req.params
  const { userId: me, companyId: tenant, projectId } = await requireConversationMember(req, id)
  await assertProjectWritable(projectId)
  const { rows } = await pool.query<{ kind: string; members: string[] }>(
    `SELECT kind, members FROM conversations WHERE id = $1 AND company_id = $2`, [id, tenant],
  )
  const c = rows[0]
  if (!c) { res.status(404).json({ error: 'not found' }); return }
  if (c.kind === 'direct') {
    res.status(400).json({ error: 'cannot leave a direct conversation' }); return
  }
  if (!c.members.includes(me)) { res.status(409).json({ error: 'not a member' }); return }
  if (await isTeacherRoom(id, tenant)) { res.status(403).json({ error: 'teacher-room membership follows course teacher membership' }); return }
  const { postMembershipSystemMessage } = await import('../../agents/membership.js')
  await postMembershipSystemMessage({
    conversationId: id, companyId: tenant, actorId: me,
    kind: 'left', participantId: me,
  })
  const next = c.members.filter((m) => m !== me)
  await pool.query(
    `UPDATE conversations SET members = $2::jsonb, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, JSON.stringify(next), tenant],
  )
  res.json({ ok: true, members: next })
})

/** Human typing indicator. The client throttles emission to roughly one
 *  POST per few seconds while typing continues, and sends a final
 *  `done:true` when the composer goes idle / blurs / sends. Membership-
 *  gated to match the broader privacy posture — non-members can't
 *  fingerprint who's typing in a private DM. */
api.post('/conversations/:id/typing', async (req, res) => {
  const { id } = req.params
  try {
    const { userId: me, companyId } = await requireConversationMember(req, id)
    const done = Boolean((req.body ?? {}).done)
    // The typing schema names the actor field `agentId` for every participant;
    // client treats it as an opaque participant id and doesn't care
    // whether the typer is human or agent.
    await publish(CH_TYPING, {
      type: 'typing',
      conversationId: id,
      agentId: me,
      done,
      companyId,
    })
    res.json({ ok: true })
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    const msg = e instanceof Error ? e.message : 'internal'
    res.status(status).json({ error: msg })
  }
})

api.post('/conversations/:id/read', async (req, res) => {
  const { id } = req.params
  // Membership-gated: only members can record a read receipt on a convo.
  // Without this, a tenant peer could write conversation_reads rows pointing
  // at conversations they're not in (low impact, but the same audit-trail
  // concern as marking phantom reads).
  const { userId: me } = await requireConversationMember(req, id)
  await pool.query(
    `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = NOW()`,
    [me, id],
  )
  res.json({ ok: true })
})

/**
 * Universal search across the workspace.
 *
 * Returns four ranked buckets in this order of importance:
 *  1. `participants` — agents + humans (matched on name/role/id)
 *  2. `rooms`        — direct chats (1-on-1 by title or member name)
 *  3. `groups`       — group chats (by title)
 *  4. `messages`     — text-message body matches, newest first, with a snippet
 *
 * Frontend is responsible for grouping/labeling — server just hands back the
 * shape. Per-bucket LIMITs keep payload bounded; refine with a longer query
 * if you don't see what you want.
 *
 * Scoping: requireCompany() pins to the active company. Conversation/message
 * results additionally filter on `members @> [userId]` so we never leak
 * rooms the caller isn't actually in (same guard `/conversations` uses).
 */
api.get('/search', async (req, res) => {
  const { userId: me, companyId: tenant, projectId } = await requireCompanyArtifactContext(req)
  const raw = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (!raw) {
    res.json({ participants: [], rooms: [], groups: [], messages: [] })
    return
  }
  if (raw.length > 200) throw new HttpError(400, 'query too long (max 200 chars)')

  // Escape LIKE metacharacters in the user's query so a literal "%" doesn't
  // wildcard the whole table. `\` is the default escape; we add it back
  // before any `%`/`_`/`\` in the needle.
  const esc = raw.replace(/[\\%_]/g, (m) => '\\' + m)
  const contains = `%${esc}%`
  const exact = esc
  const prefix = `${esc}%`

  // Bucket LIMITs — small enough that the dropdown stays scannable, large
  // enough that "the obvious match" is rarely off-screen.
  const P_LIMIT = 8
  const R_LIMIT = 8
  const G_LIMIT = 8
  const M_LIMIT = 15

  const participantsP = pool.query(
    `SELECT participant.id,participant.kind,participant.name,participant.role,participant.initial,
            participant.avatar_bg AS "avatarBg",participant.avatar_url AS "avatarUrl",
            participant.status,participant.bio
       FROM participants participant
       LEFT JOIN learning_project_teacher_agents pulse
         ON pulse.company_id=participant.company_id AND pulse.agent_id=participant.id
      WHERE participant.company_id = $1
        AND participant.departed_at IS NULL
        AND (
          pulse.agent_id IS NULL
          OR EXISTS (
            SELECT 1
              FROM courses pulse_course
              JOIN course_members pulse_teacher
                ON pulse_teacher.course_id=pulse_course.id AND pulse_teacher.company_id=pulse_course.company_id
               AND pulse_teacher.user_id=$5 AND pulse_teacher.role='teacher'
             WHERE pulse_course.project_id=pulse.project_id AND pulse_course.company_id=pulse.company_id
               AND pulse.project_id=$6
          )
        )
        AND (
          participant.kind = 'agent'
          OR EXISTS (
            SELECT 1 FROM projects selected_project
            LEFT JOIN courses selected_course ON selected_course.project_id=selected_project.id
            LEFT JOIN course_members selected_member
              ON selected_member.course_id=selected_course.id AND selected_member.user_id=participant.id
            WHERE selected_project.id=$6
              AND (selected_project.is_general=TRUE OR selected_member.user_id IS NOT NULL)
          )
        )
        AND (participant.name ILIKE $2 ESCAPE '\\' OR participant.role ILIKE $2 ESCAPE '\\' OR participant.id ILIKE $2 ESCAPE '\\')
      ORDER BY
        CASE WHEN lower(name) = lower($3) THEN 0
             WHEN name ILIKE $4 ESCAPE '\\' THEN 1
             ELSE 2 END,
        -- Agents before humans within the same group — they're typically what
        -- the user is hunting for in this product.
        CASE participant.kind WHEN 'agent' THEN 0 ELSE 1 END,
        participant.name
      LIMIT ${P_LIMIT}`,
    [tenant, contains, exact, prefix, me, projectId],
  )

  // 1-on-1 direct rooms use perspective-specific titles,
  // so compute the display title from the member that is not the caller.
  // Match on that display title OR on the other participant's name.
  const roomsP = pool.query(
    `WITH my_rooms AS (
       SELECT c.id, c.kind,
              CASE
                WHEN c.kind = 'direct' THEN COALESCE(other_participant.name, c.title)
                ELSE c.title
              END AS title,
              c.members,
              p.name AS "projectName", c.updated_at
         FROM conversations c
         LEFT JOIN projects p ON p.id = c.project_id
         LEFT JOIN LATERAL (
           SELECT p_other.name
             FROM jsonb_array_elements_text(c.members) WITH ORDINALITY AS member(id, ord)
             JOIN participants p_other
               ON p_other.id = member.id
              AND p_other.company_id = c.company_id
            WHERE member.id <> $2
            ORDER BY member.ord
            LIMIT 1
         ) other_participant ON c.kind = 'direct'
        WHERE c.company_id = $1
          AND c.project_id = $6
          AND c.kind = 'direct'
          AND c.members @> to_jsonb(ARRAY[$2::text])
          AND NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements_text(c.members) member(member_id)
              JOIN learning_project_teacher_agents pulse
                ON pulse.agent_id=member.member_id AND pulse.company_id=c.company_id
          )
     )
     SELECT r.id, r.kind, r.title, r.members, r."projectName"
       FROM my_rooms r
      WHERE r.title ILIKE $3 ESCAPE '\\'
         OR EXISTS (
              SELECT 1 FROM participants p
               WHERE p.company_id = $1
                 AND p.name ILIKE $3 ESCAPE '\\'
                 AND p.id <> $2
                 AND r.members @> to_jsonb(ARRAY[p.id::text])
            )
      ORDER BY
        CASE WHEN lower(r.title) = lower($4) THEN 0
             WHEN r.title ILIKE $5 ESCAPE '\\' THEN 1
             ELSE 2 END,
        r.updated_at DESC
      LIMIT ${R_LIMIT}`,
    [tenant, me, contains, exact, prefix, projectId],
  )

  const groupsP = pool.query(
    `SELECT c.id, c.kind, c.title, c.members, p.name AS "projectName"
       FROM conversations c
       LEFT JOIN projects p ON p.id = c.project_id
      WHERE c.company_id = $1
        AND c.project_id = $6
        AND c.kind = 'group'
        AND c.members @> to_jsonb(ARRAY[$2::text])
        AND (
          NOT EXISTS (SELECT 1 FROM learning_course_teacher_rooms room WHERE room.conversation_id=c.id AND room.company_id=c.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
              JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
              JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
               AND teacher.user_id=$2 AND teacher.role='teacher'
             WHERE room.conversation_id=c.id AND room.company_id=c.company_id
               AND room.status='active' AND project.status='active'
          )
        )
        AND (c.title ILIKE $3 ESCAPE '\\' OR (c.topic IS NOT NULL AND c.topic ILIKE $3 ESCAPE '\\'))
      ORDER BY
        CASE WHEN lower(c.title) = lower($4) THEN 0
             WHEN c.title ILIKE $5 ESCAPE '\\' THEN 1
             ELSE 2 END,
        c.updated_at DESC
      LIMIT ${G_LIMIT}`,
    [tenant, me, contains, exact, prefix, projectId],
  )

  // Skip `tool` / `system` rows — those bodies are machine output, not
  // human-written content, and they'd flood the list with JSON snippets.
  const messagesP = pool.query(
    `SELECT m.id,
            m.conversation_id AS "conversationId",
            CASE
              WHEN c.kind = 'direct' THEN COALESCE(other_participant.name, c.title)
              ELSE c.title
            END               AS "conversationTitle",
            c.kind            AS "conversationKind",
            m.author_id       AS "authorId",
            p.name            AS "authorName",
            m.body,
            m.created_at      AS "createdAt"
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       LEFT JOIN participants p
         ON p.id = m.author_id AND p.company_id = c.company_id
       LEFT JOIN LATERAL (
         SELECT p_other.name
           FROM jsonb_array_elements_text(c.members) WITH ORDINALITY AS member(id, ord)
           JOIN participants p_other
             ON p_other.id = member.id
            AND p_other.company_id = c.company_id
          WHERE member.id <> $2
          ORDER BY member.ord
          LIMIT 1
       ) other_participant ON c.kind = 'direct'
      WHERE c.company_id = $1
        AND c.project_id = $4
        AND c.members @> to_jsonb(ARRAY[$2::text])
        AND (
          NOT EXISTS (SELECT 1 FROM learning_course_teacher_rooms room WHERE room.conversation_id=c.id AND room.company_id=c.company_id)
          OR EXISTS (
            SELECT 1 FROM learning_course_teacher_rooms room
              JOIN courses course ON course.id=room.course_id AND course.company_id=room.company_id
              JOIN projects project ON project.id=course.project_id AND project.company_id=course.company_id
              JOIN course_members teacher ON teacher.course_id=course.id AND teacher.company_id=course.company_id
               AND teacher.user_id=$2 AND teacher.role='teacher'
             WHERE room.conversation_id=c.id AND room.company_id=c.company_id
               AND room.status='active' AND project.status='active'
          )
        )
        AND m.kind = 'text'
        AND m.body ILIKE $3 ESCAPE '\\'
      ORDER BY m.created_at DESC
      LIMIT ${M_LIMIT}`,
    [tenant, me, contains, projectId],
  )

  const [participants, rooms, groups, messages] = await Promise.all([
    participantsP, roomsP, groupsP, messagesP,
  ])

  // Server-side snippet so the client doesn't ship full message bodies in
  // search results. We pick a ±60-char window around the first match.
  const needle = raw.toLowerCase()
  const SNIPPET_BEFORE = 40
  const SNIPPET_AFTER = 80
  const snippetOf = (body: string): string => {
    const idx = body.toLowerCase().indexOf(needle)
    if (idx < 0) return body.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER)
    const start = Math.max(0, idx - SNIPPET_BEFORE)
    const end = Math.min(body.length, idx + needle.length + SNIPPET_AFTER)
    return (start > 0 ? '…' : '') + body.slice(start, end) + (end < body.length ? '…' : '')
  }

  res.json({
    participants: participants.rows,
    rooms: rooms.rows,
    groups: groups.rows,
    messages: messages.rows.map((m: { body: string } & Record<string, unknown>) => ({
      ...m,
      body: undefined,
      snippet: snippetOf(m.body ?? ''),
    })),
  })
})
