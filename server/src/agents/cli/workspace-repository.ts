import type { Queryable } from '../../db/queryable.js'

export async function readWorkspaceFile(db: Queryable, agentId: string, path: string) {
  const { rows } = await db.query<{ body: string; updated_at: string }>(
    `SELECT body,updated_at FROM agent_workspace WHERE agent_id=$1 AND path=$2`,
    [agentId, path],
  )
  return rows[0] ?? null
}

export async function workspaceFileExists(db: Queryable, agentId: string, path: string) {
  const { rows } = await db.query<{ path: string }>(
    `SELECT path FROM agent_workspace WHERE agent_id=$1 AND path=$2 LIMIT 1`,
    [agentId, path],
  )
  return rows.length > 0
}

export async function listWorkspaceFiles(db: Queryable, agentId: string) {
  const { rows } = await db.query<{ path: string; updated_at: string }>(
    `SELECT path,updated_at FROM agent_workspace WHERE agent_id=$1 ORDER BY path ASC`,
    [agentId],
  )
  return rows
}

export async function listWorkspaceContents(db: Queryable, agentId: string) {
  const { rows } = await db.query<{ path: string; body: string }>(
    `SELECT path,body FROM agent_workspace WHERE agent_id=$1 ORDER BY path ASC`,
    [agentId],
  )
  return rows
}

export async function writeWorkspaceFile(
  db: Queryable,
  input: { agentId: string; companyId: string; path: string; body: string },
) {
  await db.query(
    `INSERT INTO agent_workspace (agent_id,path,body,company_id,updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (agent_id,path) DO UPDATE
       SET body=EXCLUDED.body,company_id=EXCLUDED.company_id,updated_at=NOW()`,
    [input.agentId, input.path, input.body, input.companyId],
  )
}

export async function updateWorkspaceFile(db: Queryable, agentId: string, path: string, body: string) {
  await db.query(
    `UPDATE agent_workspace SET body=$3,updated_at=NOW() WHERE agent_id=$1 AND path=$2`,
    [agentId, path, body],
  )
}

export async function deleteWorkspaceFile(db: Queryable, agentId: string, path: string) {
  const result = await db.query(`DELETE FROM agent_workspace WHERE agent_id=$1 AND path=$2`, [agentId, path])
  return result.rowCount ?? 0
}

export async function deleteSkillFiles(db: Queryable, agentId: string, skillName: string) {
  const result = await db.query(
    `DELETE FROM agent_workspace WHERE agent_id=$1 AND (path=$2 OR path LIKE $3)`,
    [agentId, `skills/${skillName}/SKILL.md`, `skills/${skillName}/%`],
  )
  return result.rowCount ?? 0
}

export async function listAgentTasks(db: Queryable, agentId: string, status?: string) {
  const { rows } = await db.query<{
    id: string
    title: string
    status: string
    due_at: string | null
    created_at: string
    updated_at: string
  }>(
    `SELECT id,title,status,due_at,created_at,updated_at
       FROM agent_tasks
      WHERE agent_id=$1 AND ($2::text IS NULL OR status=$2)
      ORDER BY status ASC,updated_at DESC`,
    [agentId, status ?? null],
  )
  return rows
}

export async function createAgentTask(db: Queryable, id: string, agentId: string, title: string) {
  await db.query(`INSERT INTO agent_tasks (id,agent_id,title) VALUES ($1,$2,$3)`, [id, agentId, title])
}

export async function updateAgentTaskStatus(db: Queryable, id: string, agentId: string, status: string) {
  const result = await db.query(
    `UPDATE agent_tasks SET status=$3,updated_at=NOW() WHERE id=$1 AND agent_id=$2`,
    [id, agentId, status],
  )
  return result.rowCount ?? 0
}
