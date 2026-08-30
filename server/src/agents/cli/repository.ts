import type { Queryable } from '../../db/queryable.js'

export async function agentCompanyId(db: Queryable, agentId: string): Promise<string | null> {
  const { rows } = await db.query<{ company_id: string | null }>(
    `SELECT company_id FROM participants WHERE id=$1 LIMIT 1`,
    [agentId],
  )
  return rows[0]?.company_id ?? null
}

export async function listAgentConversations(
  db: Queryable,
  agentId: string,
  kind?: 'group' | 'direct',
) {
  const { rows } = await db.query<{
    id: string
    kind: string
    title: string
    subtitle: string | null
    members: string[]
    tag: string | null
    updated_at: string
    pulled_by: { agentId?: string } | null
  }>(
    `SELECT id,kind,title,subtitle,members,tag,updated_at,pulled_by
       FROM conversations
      WHERE members @> to_jsonb(ARRAY[$1::text]) AND ($2::text IS NULL OR kind=$2)
      ORDER BY updated_at DESC`,
    [agentId, kind ?? null],
  )
  return rows
}

export async function listConversationMembers(db: Queryable, conversationId: string) {
  const { rows: conversations } = await db.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id=$1`,
    [conversationId],
  )
  if (!conversations[0]) return null
  const { rows } = await db.query<{
    id: string
    name: string
    kind: string
    role: string | null
    status: string
  }>(
    `SELECT id,name,kind,role,status FROM participants WHERE id=ANY($1::text[])`,
    [conversations[0].members],
  )
  return rows
}

export async function participantNames(
  db: Queryable,
  companyId: string,
  participantIds: string[],
): Promise<Map<string, string>> {
  if (participantIds.length === 0) return new Map()
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
    [companyId, participantIds],
  )
  return new Map(rows.map((row) => [row.id, row.name]))
}

export async function listParticipantIdentities(
  db: Queryable,
  companyId: string,
  participantIds: string[],
) {
  if (participantIds.length === 0) return []
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
    [companyId, participantIds],
  )
  return rows
}

export async function findConvening(db: Queryable, conversationId: string) {
  const { rows } = await db.query<{
    pulled_by_id: string
    pulled_at: string
    headline_lead: string
    headline_tail: string
    subhead: string
    who_and_why: unknown
    reasoning: unknown
    status: string
  }>(
    `SELECT pulled_by_id,pulled_at,headline_lead,headline_tail,subhead,who_and_why,reasoning,status
       FROM convening_info WHERE conversation_id=$1`,
    [conversationId],
  )
  return rows[0] ?? null
}

export async function listToolCalls(db: Queryable, agentId: string | null, limit: number) {
  const { rows } = await db.query<{
    id: string
    agent_id: string
    name: string
    status: string
    duration_ms: number | null
    args: unknown
    created_at: string
  }>(
    `SELECT id,agent_id,name,status,duration_ms,args,created_at
       FROM tool_calls
      WHERE ($1::text IS NULL OR agent_id=$1)
      ORDER BY created_at DESC LIMIT $2`,
    [agentId, limit],
  )
  return rows
}

export async function findConversationScope(db: Queryable, conversationId: string) {
  const { rows } = await db.query<{ members: string[]; company_id: string; kind: string }>(
    `SELECT members,company_id,kind FROM conversations WHERE id=$1`,
    [conversationId],
  )
  return rows[0] ?? null
}

export async function humanParticipantIds(
  db: Queryable,
  companyId: string,
  participantIds: string[],
): Promise<Set<string>> {
  if (participantIds.length === 0) return new Set()
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id=$1 AND kind='human' AND id=ANY($2::text[])`,
    [companyId, participantIds],
  )
  return new Set(rows.map((row) => row.id))
}

export async function findAvailableProjectId(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT id FROM projects
      WHERE company_id=$1 AND status IN ('ACTIVE','TRANSFER_PENDING') AND id=$2
      LIMIT 1`,
    [companyId, projectId],
  )
  return rows[0]?.id ?? null
}
