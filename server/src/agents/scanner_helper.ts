/** Helper for tool-driven group pulls (separate from the periodic scanner). */
import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { CH_GROUP_PULLED, CH_MESSAGE_NEW, publish } from '../redis.js'
import { getPersona } from './personas.js'
import { companyIdForParticipant } from '../tenant.js'
import { parseMentions } from '../mentions.js'

/** Hours an agent must wait between pulling two groups that INCLUDE a
 *  human. Throttles spam that would interrupt people. Agent-only pulls
 *  bypass this cooldown — those land in the peek tab and don't interrupt
 *  anyone. */
const PULL_COOLDOWN_HOURS = 6

export async function startPulledGroup(args: {
  instigatorId: string
  title: string
  members: string[]
  leaderId: string
  reason: string
  opening: string
}): Promise<{ conversationId: string }> {
  const { instigatorId, title, members, leaderId, reason, opening } = args

  // Determine whether this pull would interrupt any humans. If all
  // members are agents, the resulting group is peek-only — no human
  // sees it appear in their list — so we skip the cooldown gate.
  const humanCheck = await pool.query<{ has_human: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM participants p
        WHERE p.id = ANY ($1::text[])
          AND p.kind <> 'agent'
     ) AS has_human`,
    [members],
  )
  const includesHuman = humanCheck.rows[0]?.has_human ?? true  // default conservative

  // ---- Restraint #1: per-agent cooldown ----
  // Only applies when the new group includes a human — those pulls
  // interrupt people. Agent-only pulls don't.
  if (includesHuman) {
    const { rows: cooldown } = await pool.query<{ id: string; title: string; at: string }>(
      `SELECT c.id, c.title, c.created_at AS at
         FROM conversations c
        WHERE c.kind = 'group'
          AND c.pulled_by ->> 'agentId' = $1
          AND c.created_at > NOW() - ($2 || ' hours')::interval
          -- Only count past pulls that included a human, matching the
          -- new policy — agent-only pulls don't burn the cooldown either.
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(c.members) m
              LEFT JOIN participants p ON p.id = m AND p.company_id = c.company_id
             WHERE p.kind <> 'agent'
          )
        ORDER BY c.created_at DESC
        LIMIT 1`,
      [instigatorId, String(PULL_COOLDOWN_HOURS)],
    )
    if (cooldown[0]) {
      const at = new Date(cooldown[0].at)
      const minsAgo = Math.round((Date.now() - at.getTime()) / 60_000)
      throw new Error(
        `pull-group rate-limited: you (${instigatorId}) already pulled "${cooldown[0].title}" ${minsAgo} minutes ago (id: ${cooldown[0].id}). ` +
        `Cooldown is ${PULL_COOLDOWN_HOURS}h for pulls that include a human. Send a message in that group, or @mention people in an existing conversation, instead of pulling a fresh one. ` +
        `(If you'd like a peer-only thread, pull a group with agent members only — those bypass the cooldown.)`,
      )
    }
  }

  // Member-set dedup used to live here but was removed: real teams have
  // multiple groups with the same people scoped by TOPIC (hiring / bug
  // triage / planning) — refusing identical-member pulls treated channel
  // semantics as group-chat semantics. Restraint #1 already throttles
  // human-interrupting spam; agent-on-agent pulls land peek-only so
  // they can multiply freely. Same-instant parallel pulls from two
  // agents are race-prevented by the broadcast coordination layer
  // (announce-before-action + glance + thinking claim).

  const conversationId = `pulled-${randomUUID().slice(0, 8)}`
  const companyId = (await companyIdForParticipant(instigatorId)) ?? null
  if (!members.includes(leaderId)) throw new Error('leader must be included in members')
  const { rows: leaders } = await pool.query<{ kind: string; departed_at: string | null }>(
    `SELECT kind, departed_at FROM participants WHERE id = $1 AND company_id = $2`, [leaderId, companyId],
  )
  if (leaders[0]?.kind !== 'agent' || leaders[0]?.departed_at) {
    throw new Error('leader must be an active agent member')
  }

  await pool.query(
    `INSERT INTO conversations (id, kind, title, subtitle, members, leader_id, pinned, tag, pulled_by, company_id)
     VALUES ($1, 'group', $2, $3, $4::jsonb, $5, FALSE, 'fresh-pulled', $6::jsonb, $7)`,
    [
      conversationId,
      title,
      `cross-project · ${members.length}`,
      JSON.stringify(members),
      leaderId,
      JSON.stringify({ agentId: instigatorId, at: new Date().toISOString(), reason }),
      companyId,
    ],
  )
  await pool.query(
    `INSERT INTO conversation_counters (conversation_id, next_sequence) VALUES ($1, 2)`,
    [conversationId],
  )

  // Persist a minimal convening_info row so the right-pane Why-this-group panel renders.
  // Use the title as a single headline; don't fabricate a fake italic tail.
  await pool.query(
    `INSERT INTO convening_info
       (conversation_id, pulled_by_id, headline_lead, headline_tail, subhead,
        who_and_why, evidence, asks, trigger, reasoning)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb)`,
    [
      conversationId,
      instigatorId,
      title,
      '',
      reason,
      JSON.stringify(members.map((p) => ({ pid: p, reason: '' }))),
      JSON.stringify({ tail: { tag: 'context', copy: reason } }),
      JSON.stringify([]),
      JSON.stringify({ when: new Date().toLocaleString(), what: `${(await getPersona(instigatorId))?.name ?? instigatorId} pulled this together via tool call.` }),
      JSON.stringify([reason]),
    ],
  )

  // Post the opening message as the instigator's first message in the new group.
  const messageId = `m-${randomUUID()}`
  const { rows: mentionTargets } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM participants WHERE company_id = $1 AND id = ANY($2::text[])`, [companyId, members],
  )
  const { mentionedIds, mentionAll } = parseMentions(opening, mentionTargets)
  await pool.query(
    `INSERT INTO messages (id, conversation_id, author_id, kind, body, sequence, company_id, mentioned_ids, mention_all)
     VALUES ($1, $2, $3, 'text', $4, 1, $5, $6::jsonb, $7)`,
    [messageId, conversationId, instigatorId, opening, companyId, JSON.stringify(mentionedIds), mentionAll],
  )

  await publish(CH_GROUP_PULLED, {
    type: 'group.pulled',
    conversationId,
    companyId: companyId ?? undefined,
    pulledById: instigatorId,
  })
  await publish(CH_MESSAGE_NEW, {
    type: 'message.new',
    conversationId,
    companyId: companyId ?? undefined,
    message: {
      id: messageId,
      conversationId,
      authorId: instigatorId,
      kind: 'text',
      body: opening,
      sequence: 1,
      at: new Date().toISOString(),
      mentionedIds,
      mentionAll,
    },
  })

  console.log(`[pull_group] ${instigatorId} pulled ${conversationId}: ${title}`)
  return { conversationId }
}
