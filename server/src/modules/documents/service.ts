import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { safe } from '../../http/async-handler.js'
import { PRIVILEGED_ROLES } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireCompanyArtifactContext } from '../../http/request-context.js'
import { CH_DOCS, publish, } from '../../redis.js'

export const documentsServiceRoutes = Router()
const api = documentsServiceRoutes

//
// REST is just the metadata + bootstrap path. The actual content sync
// happens over the WS doc subprotocol (doc.subscribe/update/awareness)
// — see server/src/documents/rooms.ts + ws.ts.

interface DocumentRow {
  id: string
  company_id: string
  title: string
  created_by: string
  conversation_id: string | null
  created_at: Date
  updated_at: Date
}

interface DocumentPayload {
  id: string
  title: string
  createdBy: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

function toDocPayload(row: DocumentRow): DocumentPayload {
  return {
    id: row.id,
    title: row.title,
    createdBy: row.created_by,
    conversationId: row.conversation_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

async function publishDocumentChanged(
  companyId: string,
  documentId: string,
  kind: 'document.created' | 'document.updated' | 'document.deleted',
  actorId: string,
  workspaceId: string,
): Promise<void> {
  await publish(CH_DOCS, {
    type: 'doc.changed',
    kind,
    companyId,
    workspaceId,
    documentId,
    actorId,
  })
}

api.get('/documents', safe(async (req, res) => {
  const { companyId, projectId } = await requireCompanyArtifactContext(req)
  const { rows } = await pool.query<DocumentRow>(
    `SELECT id, company_id, title, created_by, conversation_id, created_at, updated_at
       FROM documents
      WHERE company_id = $1 AND project_id = $2
      ORDER BY updated_at DESC
      LIMIT 200`,
    [companyId, projectId],
  )
  res.json({ documents: rows.map(toDocPayload) })
}))

api.post('/documents', safe(async (req, res) => {
  const { userId, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const body = (req.body ?? {}) as { title?: unknown; conversationId?: unknown }
  const title = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim().slice(0, 200)
    : 'Untitled'
  // Optional pin to a conversation. Verified to belong to this tenant.
  let conversationId: string | null = null
  if (typeof body.conversationId === 'string' && body.conversationId) {
    const { rows: convRows } = await pool.query(
      `SELECT 1 FROM conversations WHERE id = $1 AND company_id = $2 AND project_id = $3 LIMIT 1`,
      [body.conversationId, companyId, projectId],
    )
    if (convRows.length === 0) throw new HttpError(404, 'conversation not found')
    conversationId = body.conversationId
  }
  const id = `doc_${randomUUID().replace(/-/g, '').slice(0, 16)}`
  await pool.query(
    `INSERT INTO documents (id, company_id, project_id, title, created_by, conversation_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, companyId, projectId, title, userId, conversationId],
  )
  const { rows } = await pool.query<DocumentRow>(
    `SELECT id, company_id, title, created_by, conversation_id, created_at, updated_at
       FROM documents WHERE id = $1`, [id],
  )
  const doc = toDocPayload(rows[0])
  await publishDocumentChanged(companyId, id, 'document.created', userId, projectId)
  res.status(201).json(doc)
}))

api.get('/documents/:id', safe(async (req, res) => {
  const { companyId, projectId } = await requireCompanyArtifactContext(req)
  const id = String(req.params.id)
  const { rows } = await pool.query<DocumentRow>(
    `SELECT id, company_id, title, created_by, conversation_id, created_at, updated_at
       FROM documents WHERE id = $1 AND company_id = $2 AND project_id = $3`,
    [id, companyId, projectId],
  )
  if (!rows[0]) throw new HttpError(404, 'not found')
  res.json(toDocPayload(rows[0]))
}))

api.put('/documents/:id', safe(async (req, res) => {
  const { userId, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const id = String(req.params.id)
  const body = (req.body ?? {}) as { title?: unknown }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    throw new HttpError(400, 'title required')
  }
  const title = body.title.trim().slice(0, 200)
  const { rowCount } = await pool.query(
    `UPDATE documents SET title = $1, updated_at = NOW()
      WHERE id = $2 AND company_id = $3 AND project_id = $4`,
    [title, id, companyId, projectId],
  )
  if (!rowCount) throw new HttpError(404, 'not found')
  await publishDocumentChanged(companyId, id, 'document.updated', userId, projectId)
  res.json({ ok: true, title })
}))

api.delete('/documents/:id', safe(async (req, res) => {
  const { userId, companyId, projectId } = await requireCompanyArtifactContext(req, true)
  const id = String(req.params.id)
  // Only the creator (or an owner/admin) can delete. Mirrors the
  // delete-your-own-agent pattern elsewhere in this router.
  const { rows } = await pool.query<{ created_by: string }>(
    `SELECT created_by FROM documents WHERE id = $1 AND company_id = $2 AND project_id = $3`,
    [id, companyId, projectId],
  )
  if (!rows[0]) throw new HttpError(404, 'not found')
  if (rows[0].created_by !== userId) {
    const { rows: roleRows } = await pool.query<{ role: string }>(
      `SELECT role FROM company_members WHERE company_id = $1 AND user_id = $2`,
      [companyId, userId],
    )
    const role = roleRows[0]?.role ?? 'member'
    if (!PRIVILEGED_ROLES.has(role)) throw new HttpError(403, 'only the creator or an owner can delete')
  }
  await pool.query(`DELETE FROM documents WHERE id = $1`, [id])
  await publishDocumentChanged(companyId, id, 'document.deleted', userId, projectId)
  res.json({ ok: true })
}))
