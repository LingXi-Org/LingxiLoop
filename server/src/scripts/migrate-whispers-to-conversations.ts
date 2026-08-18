/**
 * Whispers → conversations migration.
 *
 * Folds the legacy two-agent side-channel model (`whispers` +
 * `whisper_messages` tables) into the unified conversation model. After
 * this runs, every agent-to-agent private chat is just a `kind='direct'`
 * row in `conversations` with `members=[agent_a, agent_b]`, and its
 * messages live in `messages` keyed by `conversation_id`.
 *
 * The script is idempotent:
 *   - skips any whisper whose id is already present in `conversations`
 *   - skips any whisper_message whose id is already present in `messages`
 *
 * Legacy tables (`whispers`, `whisper_messages`, `whisper_counters`) are
 * NOT dropped here — a follow-up commit retires them once the unified
 * read/write paths are verified in production.
 *
 *   tsx server/src/scripts/migrate-whispers-to-conversations.ts
 */
import 'dotenv/config'
import { pool } from '../db/pool.js'

interface WhisperRow {
  id: string
  agent_a: string
  agent_b: string
  about: string | null
  company_id: string | null
  created_at: string
}

interface ParticipantNameRow {
  id: string
  company_id: string
  name: string
}

async function loadWhispers(): Promise<WhisperRow[]> {
  const { rows } = await pool.query<WhisperRow>(
    `SELECT id, agent_a, agent_b, about, company_id, created_at FROM whispers`,
  )
  return rows
}

/** Build a lookup of {(participantId, companyId) → name} so we can title
 *  each migrated conversation as "<A> ↔ <B>" without one query per row. */
async function loadParticipantNames(): Promise<Map<string, string>> {
  const { rows } = await pool.query<ParticipantNameRow>(
    `SELECT id, company_id, name FROM participants`,
  )
  const m = new Map<string, string>()
  for (const r of rows) m.set(`${r.id}::${r.company_id}`, r.name)
  return m
}

async function migrateConversations(
  whispers: WhisperRow[],
  names: Map<string, string>,
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0, skipped = 0
  for (const w of whispers) {
    // Skip when already migrated.
    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id FROM conversations WHERE id = $1 LIMIT 1`, [w.id],
    )
    if (existing[0]) { skipped++; continue }

    const tenant = w.company_id ?? ''
    const aName = names.get(`${w.agent_a}::${tenant}`) ?? w.agent_a
    const bName = names.get(`${w.agent_b}::${tenant}`) ?? w.agent_b
    const title = `${aName} ↔ ${bName}`
    const topic = w.about ?? null
    const members = JSON.stringify([w.agent_a, w.agent_b])

    await pool.query(
      `INSERT INTO conversations
         (id, kind, title, members, company_id, created_at, updated_at, topic)
       VALUES ($1, 'direct', $2, $3::jsonb, $4, $5, $5, $6)`,
      [w.id, title, members, tenant || null, w.created_at, topic],
    )
    inserted++
  }
  return { inserted, skipped }
}

interface WhisperMessageRow {
  id: string
  whisper_id: string
  author_id: string
  kind: string
  body: string
  sequence: number
  tool: Record<string, unknown> | null
  company_id: string | null
  created_at: string
}

async function migrateMessages(): Promise<{ inserted: number; skipped: number }> {
  const { rows } = await pool.query<WhisperMessageRow>(
    `SELECT id, whisper_id, author_id, kind, body, sequence, tool, company_id, created_at
       FROM whisper_messages
      ORDER BY whisper_id, sequence ASC`,
  )
  let inserted = 0, skipped = 0
  for (const m of rows) {
    const { rows: existing } = await pool.query<{ id: string }>(
      `SELECT id FROM messages WHERE id = $1 LIMIT 1`, [m.id],
    )
    if (existing[0]) { skipped++; continue }
    await pool.query(
      `INSERT INTO messages
         (id, conversation_id, author_id, kind, body, sequence, tool, company_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [m.id, m.whisper_id, m.author_id, m.kind, m.body, m.sequence,
       m.tool ? JSON.stringify(m.tool) : null, m.company_id, m.created_at],
    )
    inserted++
  }
  return { inserted, skipped }
}

/** Seed conversation_counters so the next message into each migrated
 *  conversation picks up from MAX(sequence) + 1 instead of 1. Idempotent
 *  via ON CONFLICT — re-runs leave the higher value in place. */
async function seedCounters(): Promise<number> {
  const { rows } = await pool.query<{ whisper_id: string; max_seq: number }>(
    `SELECT whisper_id, MAX(sequence) AS max_seq
       FROM whisper_messages GROUP BY whisper_id`,
  )
  let updated = 0
  for (const r of rows) {
    const result = await pool.query(
      `INSERT INTO conversation_counters (conversation_id, next_sequence)
       VALUES ($1, $2)
       ON CONFLICT (conversation_id) DO UPDATE SET
         next_sequence = GREATEST(conversation_counters.next_sequence, EXCLUDED.next_sequence)`,
      [r.whisper_id, r.max_seq + 1],
    )
    updated += result.rowCount ?? 0
  }
  return updated
}

async function main(): Promise<void> {
  console.log('[migrate-whispers] starting')
  const [whispers, names] = await Promise.all([loadWhispers(), loadParticipantNames()])
  console.log(`[migrate-whispers] ${whispers.length} whispers in source`)
  const conv = await migrateConversations(whispers, names)
  console.log(`[migrate-whispers] conversations: +${conv.inserted}, skipped ${conv.skipped} (already migrated)`)
  const msg = await migrateMessages()
  console.log(`[migrate-whispers] messages: +${msg.inserted}, skipped ${msg.skipped}`)
  const counters = await seedCounters()
  console.log(`[migrate-whispers] conversation_counters touched: ${counters}`)
  console.log('[migrate-whispers] done.')
  await pool.end()
}

main().catch((err) => {
  console.error('[migrate-whispers] fatal', err)
  process.exitCode = 1
  void pool.end()
})
