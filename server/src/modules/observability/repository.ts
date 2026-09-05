import type { Queryable } from '../../db/queryable.js'

export async function listPublicActivity(
  db: Queryable,
  companyId: string,
  conversationId: string,
  kinds: readonly string[],
) {
  const { rows } = await db.query<{
    kind: string
    level: 'debug' | 'info' | 'warn' | 'error'
    [key: string]: unknown
  }>(
    `SELECT e.id, e.run_id AS "runId", e.agent_id AS "agentId",
       COALESCE(p.name, e.agent_id) AS "agentName", r.status AS "runStatus", e.kind, e.level, e.title,
       e.created_at AS "createdAt"
     FROM agent_events e
     JOIN agent_runs r ON r.id = e.run_id
     LEFT JOIN participants p ON p.id = e.agent_id AND p.company_id = e.company_id
     WHERE e.company_id = $1 AND e.level <> 'debug'
       AND (
         r.trigger->>'conversationId' = $2
         OR COALESCE(r.trigger->'conversationIds', '[]'::jsonb) ? $2
       )
       AND e.kind = ANY($3::text[])
       AND e.kind !~* '(prompt|reasoning|chain[._-]?of[._-]?thought|secret|credential)'
     ORDER BY e.created_at DESC LIMIT 12`,
    [companyId, conversationId, kinds],
  )
  return rows
}

export async function listMemories(db: Queryable, companyId: string) {
  const { rows } = await db.query(
    `SELECT w.agent_id AS "agentId", COALESCE(p.name, w.agent_id) AS "agentName",
       w.path, w.body, w.meta, w.updated_at AS "updatedAt"
     FROM agent_workspace w
     LEFT JOIN participants p ON p.id = w.agent_id AND p.company_id = w.company_id
     WHERE w.company_id = $1 AND w.path LIKE 'memory/%'
     ORDER BY w.updated_at DESC LIMIT 200`,
    [companyId],
  )
  return rows
}

export async function updateMemory(
  db: Queryable,
  companyId: string,
  input: { agentId: string; path: string; body: string },
) {
  const { rows } = await db.query(
    `UPDATE agent_workspace SET body = $4, updated_at = NOW(), embedding = NULL
     WHERE agent_id = $1 AND path = $2 AND company_id = $3
     RETURNING agent_id AS "agentId", path, body, meta, updated_at AS "updatedAt"`,
    [input.agentId, input.path, companyId, input.body],
  )
  return rows[0]
}

export async function deleteMemory(
  db: Queryable,
  companyId: string,
  input: { agentId: string; path: string },
): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM agent_workspace WHERE agent_id = $1 AND path = $2 AND company_id = $3`,
    [input.agentId, input.path, companyId],
  )
  return Boolean(rowCount)
}
