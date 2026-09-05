import type { Queryable } from '../../db/queryable.js'

export interface KnowledgeProjectMetadata {
  companyId: string
  name: string
  description: string | null
  status: string
}

export async function acquireNotebookLock(db: Queryable, projectId: string): Promise<void> {
  await db.query(`SELECT pg_advisory_lock(hashtextextended($1,0))`, [`open-notebook:${projectId}`])
}

export async function releaseNotebookLock(db: Queryable, projectId: string): Promise<void> {
  await db.query(`SELECT pg_advisory_unlock(hashtextextended($1,0))`, [`open-notebook:${projectId}`])
}

export async function findReadyNotebookId(db: Queryable, projectId: string): Promise<string | null> {
  const { rows } = await db.query<{ external_notebook_id: string | null; state: string }>(
    `SELECT external_notebook_id,state FROM knowledge_notebook_bindings WHERE project_id=$1`,
    [projectId],
  )
  return rows[0]?.state === 'ready' ? rows[0].external_notebook_id : null
}

export async function findKnowledgeProject(
  db: Queryable,
  projectId: string,
  companyId?: string,
): Promise<KnowledgeProjectMetadata | null> {
  const { rows } = await db.query<{
    company_id: string; name: string; description: string | null; status: string
  }>(
    `SELECT company_id,name,description,status FROM projects
      WHERE id=$1 AND ($2::text IS NULL OR company_id=$2) LIMIT 1`,
    [projectId,companyId ?? null],
  )
  const row = rows[0]
  return row ? { companyId: row.company_id, name: row.name, description: row.description, status: row.status } : null
}

export async function markNotebookPending(
  db: Queryable,
  input: { projectId: string; companyId: string; externalKey: string },
): Promise<void> {
  await db.query(
    `INSERT INTO knowledge_notebook_bindings (project_id,company_id,external_key,state)
     VALUES ($1,$2,$3,'pending')
     ON CONFLICT (project_id) DO UPDATE SET state='pending',last_error=NULL,updated_at=NOW()`,
    [input.projectId,input.companyId,input.externalKey],
  )
}

export async function markNotebookReady(db: Queryable, projectId: string, externalNotebookId: string): Promise<void> {
  await db.query(
    `UPDATE knowledge_notebook_bindings
        SET external_notebook_id=$2,state='ready',last_error=NULL,updated_at=NOW()
      WHERE project_id=$1`,
    [projectId,externalNotebookId],
  )
}

export async function markNotebookFailed(db: Queryable, projectId: string, error: string): Promise<void> {
  await db.query(
    `UPDATE knowledge_notebook_bindings SET state='failed',last_error=$2,updated_at=NOW() WHERE project_id=$1`,
    [projectId,error.slice(0,2_000)],
  )
}
