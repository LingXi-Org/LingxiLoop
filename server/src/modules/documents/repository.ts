import type { Queryable } from '../../db/queryable.js'

export interface DocumentRow {
  id: string
  company_id: string
  title: string
  created_by: string
  conversation_id: string | null
  created_at: Date
  updated_at: Date
}

const documentColumns = `
  id, company_id, title, created_by, conversation_id, created_at, updated_at
`

export async function listDocuments(
  db: Queryable,
  companyId: string,
  projectId: string,
): Promise<DocumentRow[]> {
  const { rows } = await db.query<DocumentRow>(
    `SELECT ${documentColumns}
       FROM documents
      WHERE company_id = $1 AND project_id = $2
      ORDER BY updated_at DESC
      LIMIT 200`,
    [companyId, projectId],
  )
  return rows
}

export async function listRecentDocumentsCreatedByOthers(
  db: Queryable,
  args: { companyId: string; projectId: string; actorId: string; sinceMinutes: number },
): Promise<Array<{ id: string; title: string; created_by: string; created_at: Date }>> {
  const { rows } = await db.query<{ id: string; title: string; created_by: string; created_at: Date }>(
    `SELECT id,title,created_by,created_at
       FROM documents
      WHERE company_id=$1 AND project_id=$2 AND created_by<>$3
        AND created_at>NOW()-($4::int*INTERVAL '1 minute')
      ORDER BY created_at DESC
      LIMIT 50`,
    [args.companyId, args.projectId, args.actorId, args.sinceMinutes],
  )
  return rows
}

export async function findDocument(
  db: Queryable,
  companyId: string,
  projectId: string,
  documentId: string,
): Promise<DocumentRow | undefined> {
  const { rows } = await db.query<DocumentRow>(
    `SELECT ${documentColumns}
       FROM documents
      WHERE id = $1 AND company_id = $2 AND project_id = $3
      LIMIT 1`,
    [documentId, companyId, projectId],
  )
  return rows[0]
}

export async function conversationExists(
  db: Queryable,
  companyId: string,
  projectId: string,
  conversationId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1
       FROM conversations
      WHERE id = $1 AND company_id = $2 AND project_id = $3
      LIMIT 1`,
    [conversationId, companyId, projectId],
  )
  return Boolean(rowCount)
}

export async function insertDocument(
  db: Queryable,
  input: {
    id: string
    companyId: string
    projectId: string
    title: string
    createdBy: string
    conversationId: string | null
  },
): Promise<DocumentRow> {
  const { rows } = await db.query<DocumentRow>(
    `INSERT INTO documents
       (id, company_id, project_id, title, created_by, conversation_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${documentColumns}`,
    [input.id, input.companyId, input.projectId, input.title, input.createdBy, input.conversationId],
  )
  return rows[0]
}

export async function renameDocument(
  db: Queryable,
  companyId: string,
  projectId: string,
  documentId: string,
  title: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `UPDATE documents
        SET title = $1, updated_at = NOW()
      WHERE id = $2 AND company_id = $3 AND project_id = $4`,
    [title, documentId, companyId, projectId],
  )
  return Boolean(rowCount)
}

export async function deleteDocument(
  db: Queryable,
  companyId: string,
  projectId: string,
  documentId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `DELETE FROM documents
      WHERE id = $1 AND company_id = $2 AND project_id = $3`,
    [documentId, companyId, projectId],
  )
  return Boolean(rowCount)
}
