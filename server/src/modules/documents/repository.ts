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

export async function findDocumentCollaborationCompany(
  db: Queryable,
  args: { documentId: string; userId: string; writable: boolean },
): Promise<string | null> {
  const { rows } = await db.query<{ company_id: string }>(
    `SELECT document.company_id
       FROM documents document
       JOIN projects project
         ON project.id=document.project_id AND project.company_id=document.company_id
       JOIN company_members membership
         ON membership.company_id=document.company_id AND membership.user_id=$2
       LEFT JOIN courses course
         ON course.project_id=project.id AND course.company_id=project.company_id
       LEFT JOIN course_members course_member
         ON course_member.course_id=course.id
        AND course_member.company_id=course.company_id
        AND course_member.user_id=$2
      WHERE document.id=$1
        AND (project.is_general=TRUE OR membership.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)
        AND ($3::boolean=FALSE OR project.status='active')
      LIMIT 1`,
    [args.documentId, args.userId, args.writable],
  )
  return rows[0]?.company_id ?? null
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

export async function memberRole(
  db: Queryable,
  companyId: string,
  userId: string,
): Promise<string | undefined> {
  const { rows } = await db.query<{ role: string }>(
    `SELECT role
       FROM company_members
      WHERE company_id = $1 AND user_id = $2
      LIMIT 1`,
    [companyId, userId],
  )
  return rows[0]?.role
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
