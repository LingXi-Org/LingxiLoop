import type { Queryable } from '../../db/queryable.js'

export interface AgentCliIdentityRow {
  id: string
  companyId: string
  kind: string
  name: string
  role: string | null
  status: string
  bio: string | null
  tools: string[] | null
}

export async function findAgentCliIdentity(
  db: Queryable,
  id: string,
): Promise<AgentCliIdentityRow | null> {
  const { rows } = await db.query<{
    id: string
    company_id: string
    kind: string
    name: string
    role: string | null
    status: string
    bio: string | null
    tools: string[] | null
  }>(
    `SELECT id, company_id, kind, name, role, status, bio, tools
       FROM participants
      WHERE id = $1 AND departed_at IS NULL
      LIMIT 1`,
    [id],
  )
  const row = rows[0]
  return row ? {
    id: row.id,
    companyId: row.company_id,
    kind: row.kind,
    name: row.name,
    role: row.role,
    status: row.status,
    bio: row.bio,
    tools: row.tools,
  } : null
}

export async function listAgentCliConversations(
  db: Queryable,
  companyId: string,
  participantId: string,
): Promise<Array<{ id: string; title: string; kind: string }>> {
  const { rows } = await db.query<{ id: string; title: string; kind: string }>(
    `SELECT id, title, kind
       FROM conversations
      WHERE company_id = $1
        AND members @> to_jsonb(ARRAY[$2::text])
      ORDER BY updated_at DESC`,
    [companyId, participantId],
  )
  return rows
}

export async function listAgentCliParticipants(
  db: Queryable,
  companyId: string,
  kind: string | null,
): Promise<Array<{ id: string; kind: string; name: string; role: string | null; status: string }>> {
  const { rows } = await db.query<{
    id: string
    kind: string
    name: string
    role: string | null
    status: string
  }>(
    `SELECT id, kind, name, role, status
       FROM participants
      WHERE company_id = $1
        AND departed_at IS NULL
        AND ($2::text IS NULL OR kind = $2)
      ORDER BY kind DESC, name ASC`,
    [companyId, kind],
  )
  return rows
}

export async function listAgentCliStatuses(
  db: Queryable,
  companyId: string,
): Promise<Array<{ id: string; name: string; status: string; kind: string }>> {
  const { rows } = await db.query<{ id: string; name: string; status: string; kind: string }>(
    `SELECT id, name, status, kind
       FROM participants
      WHERE company_id = $1 AND kind = 'agent' AND departed_at IS NULL
      ORDER BY name ASC`,
    [companyId],
  )
  return rows
}
