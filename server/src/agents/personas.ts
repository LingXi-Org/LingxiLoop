/**
 * Agent identity and team-roster resolution for the learning Agent OS.
 *
 * Runtime instructions live in the learning presets and are consumed by the
 * Agent OS directly. This module deliberately contains no provider, model, or
 * legacy CLI prompt selection.
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

export async function isAgent(id: string): Promise<boolean> {
  return (await getPersona(id)) !== null
}

export async function getAllAgentPersonas(companyId: string): Promise<Persona[]> {
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
      WHERE kind = 'agent' AND departed_at IS NULL AND company_id = $1
      ORDER BY name ASC`,
    [companyId],
  )
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role ?? '',
    style: row.style ?? '',
    capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    companyId: row.company_id,
  }))
}

interface TeamMember {
  id: string
  name: string
  role: string
  kind: 'agent' | 'human'
}

export async function getTeamRoster(companyId: string): Promise<TeamMember[]> {
  const { rows } = await pool.query<TeamMember>(
    `SELECT id, name, COALESCE(role, '') AS role, kind
       FROM participants
      WHERE departed_at IS NULL AND company_id = $1
      ORDER BY kind DESC, name ASC`,
    [companyId],
  )
  return rows
}

function rosterSection(team: TeamMember[], selfId: string): string {
  const agents = team.filter((member) => member.kind === 'agent' && member.id !== selfId)
  const humans = team.filter((member) => member.kind === 'human')
  if (agents.length === 0 && humans.length === 0) return ''

  const lines = ['Workspace members:']
  if (humans.length > 0) {
    lines.push('People:')
    for (const human of humans) {
      lines.push(`- ${human.id} — ${human.name}${human.role ? `, ${human.role}` : ''}`)
    }
  }
  if (agents.length > 0) {
    lines.push('Learning agents:')
    for (const agent of agents) {
      lines.push(`- ${agent.id} — ${agent.name}${agent.role ? `, ${agent.role}` : ''}`)
    }
  }
  return lines.join('\n')
}

export async function buildTeamRosterText(companyId: string, selfId: string): Promise<string> {
  return rosterSection(await getTeamRoster(companyId), selfId)
}
