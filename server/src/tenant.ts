/**
 * Cheap helpers for resolving the tenant (company_id) of a domain object.
 * Used by background publishers (turn loop, convene, scanner, CLI) which
 * don't go through the HTTP request path so don't already have the
 * tenant in hand.
 *
 * These run once per published event and are tiny single-row lookups; if it
 * ever shows up in profiles, swap to an in-process LRU.
 */
import { pool } from './db/pool.js'

export async function companyIdForConversation(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM conversations WHERE id = $1 LIMIT 1`,
    [id],
  )
  return rows[0]?.company_id ?? null
}

export async function companyIdForParticipant(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM participants WHERE id = $1 LIMIT 1`,
    [id],
  )
  return rows[0]?.company_id ?? null
}

export async function companyIdForConveneSession(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT c.company_id
       FROM convene_sessions s
       JOIN conversations c ON c.id = s.conversation_id
      WHERE s.id = $1 LIMIT 1`,
    [id],
  )
  return rows[0]?.company_id ?? null
}
