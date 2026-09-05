import type { Queryable } from '../../db/queryable.js'

export async function listMemoryFiles(
  db: Queryable,
  input: { agentId: string; about?: string; kind?: string; limit: number },
) {
  const parameters: unknown[] = [input.agentId]
  let filters = `agent_id=$1 AND path LIKE 'memory/%'`
  if (input.about) {
    parameters.push(input.about)
    filters += ` AND meta->>'about'=$${parameters.length}`
  }
  if (input.kind) {
    parameters.push(`memory/${input.kind}/%`)
    filters += ` AND path LIKE $${parameters.length}`
  }
  parameters.push(input.limit)
  const { rows } = await db.query<{
    path: string
    body: string
    meta: Record<string, unknown> | null
    updated_at: string
  }>(
    `SELECT path,body,meta,updated_at
       FROM agent_workspace
      WHERE ${filters}
      ORDER BY COALESCE((meta->>'pinned')::boolean,false) DESC,updated_at DESC
      LIMIT $${parameters.length}`,
    parameters,
  )
  return rows
}

export async function saveMemoryFile(
  db: Queryable,
  input: {
    agentId: string
    path: string
    body: string
    meta: Record<string, unknown>
    embedding: string
    companyId: string
  },
) {
  await db.query(
    `INSERT INTO agent_workspace (agent_id,path,body,meta,embedding,company_id,updated_at)
     VALUES ($1,$2,$3,$4::jsonb,$5::vector,$6,NOW())`,
    [input.agentId, input.path, input.body, JSON.stringify(input.meta), input.embedding, input.companyId],
  )
}

export async function addAgentLog(
  db: Queryable,
  input: { id: string; agentId: string; body: string; ref?: Record<string, unknown> },
) {
  await db.query(
    `INSERT INTO agent_log (id,agent_id,kind,body,ref) VALUES ($1,$2,'note',$3,$4::jsonb)`,
    [input.id, input.agentId, input.body, input.ref ? JSON.stringify(input.ref) : null],
  )
}

export async function toggleMemoryPin(db: Queryable, agentId: string, memoryId: string) {
  const result = await db.query<{ meta: Record<string, unknown> }>(
    `UPDATE agent_workspace
        SET meta=COALESCE(meta,'{}'::jsonb)
          || jsonb_build_object('pinned',NOT COALESCE((meta->>'pinned')::boolean,false))
      WHERE agent_id=$1 AND path LIKE $2
      RETURNING meta`,
    [agentId, `memory/%/${memoryId}.md`],
  )
  return result.rows[0]?.meta ?? null
}

export async function deleteMemoryFile(db: Queryable, agentId: string, memoryId: string) {
  const result = await db.query(
    `DELETE FROM agent_workspace WHERE agent_id=$1 AND path LIKE $2`,
    [agentId, `memory/%/${memoryId}.md`],
  )
  return result.rowCount ?? 0
}

export async function listClimate(
  db: Queryable,
  input: { companyId: string; agentId: string; aboutId?: string },
) {
  const { rows } = await db.query<{
    about_id: string
    affinity: number
    trust: number
    last_note: string
    updated_at: string
  }>(
    `SELECT about_id,affinity,trust,last_note,updated_at
       FROM agent_climate
      WHERE company_id=$1 AND agent_id=$2 AND ($3::text IS NULL OR about_id=$3)
      ORDER BY updated_at DESC LIMIT 50`,
    [input.companyId, input.agentId, input.aboutId ?? null],
  )
  return rows
}

export async function findClimate(db: Queryable, companyId: string, agentId: string, aboutId: string) {
  const { rows } = await db.query<{ affinity: number; trust: number; history: unknown }>(
    `SELECT affinity,trust,history FROM agent_climate
      WHERE company_id=$1 AND agent_id=$2 AND about_id=$3`,
    [companyId, agentId, aboutId],
  )
  return rows[0] ?? null
}

export async function upsertClimate(
  db: Queryable,
  input: {
    companyId: string
    agentId: string
    aboutId: string
    affinity: number
    trust: number
    note: string
    history: unknown[]
  },
) {
  await db.query(
    `INSERT INTO agent_climate (company_id,agent_id,about_id,affinity,trust,last_note,history,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,NOW())
     ON CONFLICT (company_id,agent_id,about_id) DO UPDATE
       SET affinity=EXCLUDED.affinity,trust=EXCLUDED.trust,last_note=EXCLUDED.last_note,
           history=EXCLUDED.history,updated_at=NOW()`,
    [
      input.companyId,
      input.agentId,
      input.aboutId,
      input.affinity,
      input.trust,
      input.note,
      JSON.stringify(input.history),
    ],
  )
}

export async function deleteClimate(db: Queryable, companyId: string, agentId: string, aboutId: string) {
  const result = await db.query(
    `DELETE FROM agent_climate WHERE company_id=$1 AND agent_id=$2 AND about_id=$3`,
    [companyId, agentId, aboutId],
  )
  return result.rowCount ?? 0
}

export async function listAgentLog(db: Queryable, agentId: string, limit: number) {
  const { rows } = await db.query<{
    id: string
    kind: string
    body: string
    ref: unknown
    created_at: string
  }>(
    `SELECT id,kind,body,ref,created_at
       FROM agent_log WHERE agent_id=$1
      ORDER BY created_at DESC LIMIT $2`,
    [agentId, limit],
  )
  return rows
}
