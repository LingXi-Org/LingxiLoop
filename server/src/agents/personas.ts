/**
 * Agent identity and team-roster resolution for the learning Agent OS.
 *
 * Runtime instructions live in the learning presets and are consumed by the
 * Agent OS directly. This module only resolves current persisted identities.
 */
import { pool } from '../db/pool.js'

export interface Persona {
  id: string
  name: string
  role: string
  /** Learning-role instructions stored in participants.system_prompt. */
  style: string
  capabilities: string[]
  companyId: string
}

const personaCache = new Map<string, Persona | null>()

export function invalidatePersonaCache(id?: string): void {
  if (id) personaCache.delete(id)
  else personaCache.clear()
}

export async function getPersona(id: string): Promise<Persona | null> {
  if (personaCache.has(id)) return personaCache.get(id) ?? null
  const { rows } = await pool.query<{
    id: string
    name: string
    role: string | null
    style: string | null
    capabilities: string[] | null
    company_id: string
  }>(
    `SELECT id, name, role, system_prompt AS style, capabilities, company_id
       FROM participants
      WHERE id = $1 AND kind = 'agent' AND departed_at IS NULL`,
    [id],
  )
  const row = rows[0]
  const persona: Persona | null = row
    ? {
        id: row.id,
        name: row.name,
        role: row.role ?? '',
        style: row.style ?? '',
        capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
        companyId: row.company_id,
      }
    : null
  personaCache.set(id, persona)
  return persona
}
