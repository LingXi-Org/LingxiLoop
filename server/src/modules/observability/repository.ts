import type { Queryable } from '../../db/queryable.js'

const STALLED_INTERVAL = '5 minutes'

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
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(r.input_message_ids) input(message_id)
           JOIN messages m ON m.id = input.message_id
           WHERE m.conversation_id = $2
         )
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

export async function listRuns(
  db: Queryable,
  companyId: string,
  input: { agentId?: string; status?: string; limit: number },
) {
  const clauses = ['r.company_id = $1']
  const params: unknown[] = [companyId]
  if (input.agentId) {
    params.push(input.agentId)
    clauses.push(`r.agent_id = $${params.length}`)
  }
  if (input.status === 'stalled') {
    clauses.push(`r.status = 'running' AND r.updated_at < NOW() - INTERVAL '${STALLED_INTERVAL}'`)
  } else if (input.status === 'running') {
    clauses.push(`r.status = 'running' AND r.updated_at >= NOW() - INTERVAL '${STALLED_INTERVAL}'`)
  } else if (input.status) {
    params.push(input.status)
    clauses.push(`r.status = $${params.length}`)
  }
  params.push(input.limit)
  const { rows } = await db.query(
    `SELECT r.id, r.agent_id AS "agentId", COALESCE(p.name, r.agent_id) AS "agentName",
        p.role AS "agentRole", NULL::text AS "agentAvatarUrl", r.company_id AS "companyId",
        CASE WHEN r.status = 'running' AND r.updated_at < NOW() - INTERVAL '${STALLED_INTERVAL}'
          THEN 'stalled' ELSE r.status END AS status,
        r.stage, r.summary, r.error, r.trigger, r.input_message_ids AS "inputMessageIds",
        r.inbox_count AS "inboxCount", r.tool_call_count AS "toolCallCount",
        (r.input_tokens + r.cached_input_tokens + r.cache_creation_tokens + r.output_tokens) AS "tokenCount",
        r.fingerprint, r.started_at AS "startedAt", r.updated_at AS "updatedAt",
        r.finished_at AS "finishedAt",
        ROUND(EXTRACT(EPOCH FROM (COALESCE(r.finished_at, NOW()) - r.started_at)) * 1000)::int AS "durationMs"
       FROM agent_runs r
       LEFT JOIN participants p ON p.id = r.agent_id AND p.company_id = r.company_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY r.started_at DESC
      LIMIT $${params.length}`,
    params,
  )
  return rows
}

export async function listRunEvents(db: Queryable, companyId: string, runId: string) {
  const { rows } = await db.query(
    `SELECT e.id, e.run_id AS "runId", e.agent_id AS "agentId", e.kind, e.level,
        e.title, e.data, e.created_at AS "createdAt"
       FROM agent_events e
       JOIN agent_runs r ON r.id = e.run_id AND r.company_id = e.company_id
      WHERE e.run_id = $1 AND e.company_id = $2
      ORDER BY e.created_at ASC, e.id ASC`,
    [runId, companyId],
  )
  return rows
}

export async function runExists(db: Queryable, companyId: string, runId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM agent_runs WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [runId, companyId],
  )
  return Boolean(rowCount)
}
