import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { safe } from '../../http/async-handler.js'
import { PRIVILEGED_ROLES, requireCompanyRole, requireGroupConversation } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { assertProjectWritable, requireAuth, requireCompany, requireWorkspace } from '../../http/request-context.js'
import {
  deleteKnowledgeSource,
  enqueueKnowledgeSource,
  ensureProjectNotebook,
  getKnowledgeSourceText,
  MAX_SOURCE_BYTES,
  openNotebookEnabled,
  retryKnowledgeSource,
  syncProjectNotebookMetadata,
} from '../../knowledge/service.js'
import { storage, } from '../../storage.js'

export const knowledgeRouter = Router()
const api = knowledgeRouter

/* ============== Projects ============== */

api.get('/projects', async (req, res) => {
  const { companyId: tenant } = await requireCompany(req)
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, p.color, p.status, p.created_by AS "createdBy",
            p.is_general AS "isGeneral", p.created_at AS "createdAt", p.updated_at AS "updatedAt",
            p.archived_at AS "archivedAt", pv.visited_at AS "lastVisitedAt",
            (SELECT COUNT(*)::int FROM conversations c WHERE c.project_id = p.id) AS "conversationCount",
            (SELECT COUNT(*)::int FROM knowledge_sources s WHERE s.project_id = p.id AND s.deleted_at IS NULL) AS "sourceCount",
            (SELECT COUNT(*)::int FROM documents d WHERE d.project_id = p.id) AS "documentCount",
            (SELECT COUNT(*)::int FROM boards b WHERE b.project_id = p.id) AS "boardCount",
            (SELECT COUNT(*)::int FROM calendar_events e WHERE e.project_id = p.id) AS "calendarEventCount",
            (SELECT COUNT(*)::int FROM canvases cv WHERE cv.project_id = p.id) AS "canvasCount",
            (cm.role IN ('owner','admin') OR course_member.role='teacher') AS "canManage",
            course.id AS "courseId", course_member.role AS "courseRole",
            course.study_room_conversation_id AS "studyRoomId"
       FROM projects p
       JOIN company_members cm ON cm.company_id = p.company_id AND cm.user_id = $2
       LEFT JOIN courses course ON course.project_id=p.id
       LEFT JOIN course_members course_member ON course_member.course_id=course.id AND course_member.user_id=$2
       LEFT JOIN project_visits pv ON pv.project_id = p.id AND pv.user_id = $2
      WHERE p.company_id = $1
        AND (p.is_general=TRUE OR cm.role IN ('owner','admin') OR course_member.user_id IS NOT NULL)
      ORDER BY p.status ASC, pv.visited_at DESC NULLS LAST, p.updated_at DESC`,
    [tenant, requireAuth(req)],
  )
  res.json(rows)
})

api.post('/projects', async (req, res) => {
  const { companyId: tenant } = await requireCompanyRole(req)
  const name = String(req.body?.name ?? '').trim().slice(0, 80)
  const description = String(req.body?.description ?? '').slice(0, 1000)
  const color = req.body?.color ? String(req.body.color).slice(0, 200) : null
  if (!name) { res.status(400).json({ error: 'name required' }); return }
  const id = `p-${randomUUID().slice(0, 10)}`
  await pool.query(
    `INSERT INTO projects (id, company_id, name, description, color, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tenant, name, description, color, requireAuth(req)],
  )
  let knowledgeState: 'disabled' | 'ready' | 'failed' = openNotebookEnabled() ? 'ready' : 'disabled'
  if (openNotebookEnabled()) {
    try { await ensureProjectNotebook(id, tenant) }
    catch (error) { knowledgeState = 'failed'; console.warn('[knowledge] project notebook provisioning failed', error) }
  }
  res.status(201).json({ id, name, description, color, status: 'active', knowledgeState })
})

api.put('/projects/:id', async (req, res) => {
  // Renaming or recoloring a shared project ripples through every member's
  // sidebar — gate to owner/admin so a single member can't unilaterally
  // re-brand the team's work.
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  if (!PRIVILEGED_ROLES.has(workspace.role) && workspace.courseRole !== 'teacher') throw new HttpError(403, 'only a course teacher or company admin can edit it')
  const tenant = workspace.companyId
  const { id } = req.params
  const { rows: gate } = await pool.query(
    `SELECT 1 FROM projects WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [id, tenant],
  )
  if (!gate[0]) { res.status(404).json({ error: 'not found' }); return }
  const sets: string[] = []
  const params: unknown[] = []
  if (typeof req.body?.name === 'string') { params.push(req.body.name.trim().slice(0, 80)); sets.push(`name = $${params.length}`) }
  if (typeof req.body?.description === 'string') { params.push(req.body.description.slice(0, 1000)); sets.push(`description = $${params.length}`) }
  if (typeof req.body?.color === 'string') { params.push(req.body.color.slice(0, 200)); sets.push(`color = $${params.length}`) }
  if (req.body?.color === null) { params.push(null); sets.push(`color = $${params.length}`) }
  if (sets.length === 0) { res.status(400).json({ error: 'nothing to update' }); return }
  params.push(id, tenant)
  await pool.query(
    `UPDATE projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length - 1} AND company_id = $${params.length}`,
    params,
  )
  await syncProjectNotebookMetadata(String(id))
  res.json({ ok: true })
})

api.post('/projects/:id/archive', async (req, res) => {
  // Archive/unarchive is destructive (hides every linked conversation from
  // the active list); owner/admin only.
  const workspace = await requireWorkspace(req, String(req.params.id))
  if (workspace.isGeneral) throw new HttpError(400, 'the General workspace cannot be archived')
  if (!PRIVILEGED_ROLES.has(workspace.role) && workspace.courseRole !== 'teacher') throw new HttpError(403, 'only a course teacher or company admin can archive it')
  const tenant = workspace.companyId
  const { id } = req.params
  const archive = req.body?.archive !== false
  await pool.query(
    archive
      ? `UPDATE projects SET status = 'archived', archived_at = NOW() WHERE id = $1 AND company_id = $2`
      : `UPDATE projects SET status = 'active', archived_at = NULL WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  await syncProjectNotebookMetadata(String(id))
  res.json({ ok: true, status: archive ? 'archived' : 'active' })
})

api.post('/projects/:id/open', safe(async (req, res) => {
  const workspace = await requireWorkspace(req, String(req.params.id))
  await pool.query(
    `INSERT INTO project_visits (project_id, user_id, visited_at) VALUES ($1, $2, NOW())
     ON CONFLICT (project_id, user_id) DO UPDATE SET visited_at = NOW()`,
    [workspace.projectId, workspace.userId],
  )
  res.json({ ok: true })
}))

const SOURCE_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'text/markdown', 'text/csv', 'application/json',
])

function sourceView(row: Record<string, unknown>) {
  return row
}

function requireOpenNotebook(): void {
  if (!openNotebookEnabled()) throw new HttpError(503, 'Open Notebook knowledge engine is disabled')
}

api.get('/projects/:id/sources', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  const { rows } = await pool.query(
    `SELECT s.id, s.kind, s.title, s.mime_type AS "mimeType", s.size_bytes AS "sizeBytes",
            s.original_url AS "originalUrl", s.status, s.stage, s.error,
            s.is_truncated AS "isTruncated", s.created_by AS "createdBy",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            s.origin_client_msg_no AS "originClientMsgNo", s.external_chunk_count AS "chunkCount"
       FROM knowledge_sources s
      WHERE s.project_id = $1 AND s.company_id = $2 AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC`, [workspace.projectId, workspace.companyId],
  )
  res.json(rows.map(sourceView))
}))

api.get('/projects/:id/sources/:sourceId', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  const { rows } = await pool.query(
    `SELECT id, kind, title, mime_type AS "mimeType", size_bytes AS "sizeBytes", original_url AS "originalUrl",
            storage_key AS "storageKey",
            status, stage, error, is_truncated AS "isTruncated",
            created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM knowledge_sources WHERE id = $1 AND project_id = $2 AND company_id = $3 AND deleted_at IS NULL`,
    [req.params.sourceId, workspace.projectId, workspace.companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'source not found')
  const row = rows[0] as Record<string, unknown>
  const storageKey = typeof row.storageKey === 'string' ? row.storageKey : null
  delete row.storageKey
  const extractedText = row.status === 'ready'
    ? await getKnowledgeSourceText(String(req.params.sourceId), workspace.companyId, workspace.projectId)
    : null
  res.json({ ...row, extractedText, originalFileUrl: row.kind === 'file' && storageKey ? await storage.publicUrl(storageKey) : null })
}))

api.post('/projects/:id/sources', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const kind = String(req.body?.kind ?? '').trim()
  if (kind !== 'text' && kind !== 'url') throw new HttpError(400, 'kind must be text or url')
  const rawText = kind === 'text' ? String(req.body?.text ?? '').trim() : null
  const rawUrl = kind === 'url' ? String(req.body?.url ?? '').trim() : null
  if (kind === 'text' && !rawText) throw new HttpError(400, 'text is required')
  if (kind === 'url' && !rawUrl) throw new HttpError(400, 'url is required')
  if (rawText && Buffer.byteLength(rawText, 'utf8') > MAX_SOURCE_BYTES) throw new HttpError(413, 'source exceeds 25 MB')
  const id = `ks-${randomUUID().slice(0, 16)}`
  const title = String(req.body?.title ?? (kind === 'url' ? rawUrl : '粘贴文本')).trim().slice(0, 200)
  const storageKey = rawText ? `knowledge-sources/${workspace.companyId}/${workspace.projectId}/${id}.txt` : null
  if (rawText && storageKey) await storage.put(storageKey, Buffer.from(rawText, 'utf8'), 'text/plain')
  await pool.query(
    `INSERT INTO knowledge_sources (id, company_id, project_id, kind, title, mime_type, size_bytes, storage_key, original_url, status, stage, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'queued','queued',$10)`,
    [id, workspace.companyId, workspace.projectId, kind, title || '未命名来源', kind === 'url' ? null : 'text/plain', rawText ? Buffer.byteLength(rawText, 'utf8') : 0, storageKey, rawUrl, workspace.userId],
  )
  await enqueueKnowledgeSource(id)
  res.status(201).json({ id, kind, title, status: 'queued', stage: 'queued' })
}))

api.post('/projects/:id/sources/upload/presign', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const name = String(req.body?.name ?? '').trim().slice(0, 200)
  const mime = String(req.body?.mime ?? '').trim().toLowerCase()
  const size = Number(req.body?.size ?? 0)
  if (!name || !SOURCE_MIMES.has(mime)) throw new HttpError(415, 'unsupported source file type')
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SOURCE_BYTES) throw new HttpError(413, 'file size is outside the 25 MB limit')
  const extension = ({ 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv', 'application/json': 'json' } as Record<string, string>)[mime]
  const id = `ks-${randomUUID().slice(0, 16)}`
  const key = `knowledge-sources/${workspace.companyId}/${workspace.projectId}/${id}.${extension}`
  const signed = await storage.presignPut(key, mime)
  await pool.query(
    `INSERT INTO knowledge_sources (id, company_id, project_id, kind, title, mime_type, size_bytes, storage_key, status, stage, created_by)
     VALUES ($1,$2,$3,'file',$4,$5,$6,$7,'upload_pending','upload_pending',$8)`,
    [id, workspace.companyId, workspace.projectId, name, mime, size, key, workspace.userId],
  )
  res.status(201).json({ id, uploadUrl: signed.uploadUrl, mime, size })
}))

api.post('/projects/:id/sources/:sourceId/complete-upload', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const { rows } = await pool.query<{ storage_key: string; size_bytes: number; created_by: string }>(
    `SELECT storage_key, size_bytes, created_by FROM knowledge_sources
      WHERE id=$1 AND company_id=$2 AND project_id=$3 AND status='upload_pending' AND deleted_at IS NULL`,
    [req.params.sourceId, workspace.companyId, workspace.projectId],
  )
  if (!rows[0]) throw new HttpError(404, 'pending source upload not found')
  if (rows[0].created_by !== workspace.userId) throw new HttpError(403, 'only the uploader can complete this upload')
  const body = await storage.readObject(rows[0].storage_key)
  if (body.length !== rows[0].size_bytes || body.length > MAX_SOURCE_BYTES) throw new HttpError(400, 'uploaded object size does not match the declaration')
  await enqueueKnowledgeSource(String(req.params.sourceId))
  res.json({ ok: true, id: req.params.sourceId, status: 'queued' })
}))

api.post('/projects/:id/sources/:sourceId/retry', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const { rows } = await pool.query<{ created_by: string }>(
    `SELECT created_by FROM knowledge_sources WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL`,
    [req.params.sourceId, workspace.projectId],
  )
  if (!rows[0]) throw new HttpError(404, 'source not found')
  if (rows[0].created_by !== workspace.userId && workspace.projectCreatedBy !== workspace.userId && !PRIVILEGED_ROLES.has(workspace.role)) throw new HttpError(403, 'not allowed to retry this source')
  await retryKnowledgeSource(String(req.params.sourceId), workspace.companyId, workspace.projectId)
  res.json({ ok: true })
}))

api.delete('/projects/:id/sources/:sourceId', safe(async (req, res) => {
  requireOpenNotebook()
  const workspace = await requireWorkspace(req, String(req.params.id))
  await assertProjectWritable(workspace.projectId)
  const { rows } = await pool.query<{ created_by: string; storage_key: string | null }>(
    `SELECT created_by, storage_key FROM knowledge_sources
      WHERE id = $1 AND project_id = $2 AND company_id = $3 AND deleted_at IS NULL`,
    [req.params.sourceId, workspace.projectId, workspace.companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'source not found')
  if (rows[0].created_by !== workspace.userId && workspace.projectCreatedBy !== workspace.userId && !PRIVILEGED_ROLES.has(workspace.role)) {
    throw new HttpError(403, 'not allowed to delete this source')
  }
  await deleteKnowledgeSource(String(req.params.sourceId), workspace.companyId, workspace.projectId)
  res.json({ ok: true })
}))

api.get('/conversations/:id/sources', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const { rows } = await pool.query(
    `SELECT s.id, s.kind, s.title, s.mime_type AS "mimeType", s.size_bytes AS "sizeBytes",
            s.original_url AS "originalUrl", s.status, s.stage, s.error,
            s.is_truncated AS "isTruncated", s.created_by AS "createdBy",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            s.origin_client_msg_no AS "originClientMsgNo",
            (e.source_id IS NULL) AS enabled, s.external_chunk_count AS "chunkCount"
       FROM knowledge_sources s LEFT JOIN conversation_source_exclusions e
         ON e.source_id = s.id AND e.conversation_id = $1
      WHERE s.project_id = $3 AND s.company_id = $2 AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC`,
    [req.params.id, membership.companyId, membership.projectId],
  )
  res.json(rows)
}))

api.get('/conversations/:id/sources/:sourceId', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const { rows } = await pool.query(
    `SELECT id, kind, title, mime_type AS "mimeType", size_bytes AS "sizeBytes", original_url AS "originalUrl",
            storage_key AS "storageKey", status, stage, error,
            is_truncated AS "isTruncated", created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM knowledge_sources WHERE id=$1 AND project_id=$2 AND company_id=$3 AND deleted_at IS NULL`,
    [req.params.sourceId, membership.projectId, membership.companyId],
  )
  if (!rows[0]) throw new HttpError(404, 'source not found')
  const row = rows[0] as Record<string, unknown>
  const storageKey = typeof row.storageKey === 'string' ? row.storageKey : null
  delete row.storageKey
  const extractedText = row.status === 'ready'
    ? await getKnowledgeSourceText(String(req.params.sourceId), membership.companyId, membership.projectId)
    : null
  res.json({ ...row, extractedText, originalFileUrl: row.kind === 'file' && storageKey ? await storage.publicUrl(storageKey) : null })
}))

api.post('/conversations/:id/sources', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const kind = String(req.body?.kind ?? '').trim()
  if (kind !== 'text' && kind !== 'url') throw new HttpError(400, 'kind must be text or url')
  const rawText = kind === 'text' ? String(req.body?.text ?? '').trim() : null
  const rawUrl = kind === 'url' ? String(req.body?.url ?? '').trim() : null
  if (kind === 'text' && !rawText) throw new HttpError(400, 'text is required')
  if (kind === 'url' && !rawUrl) throw new HttpError(400, 'url is required')
  if (rawText && Buffer.byteLength(rawText, 'utf8') > MAX_SOURCE_BYTES) throw new HttpError(413, 'source exceeds 25 MB')
  const id = `ks-${randomUUID().slice(0, 16)}`
  const title = String(req.body?.title ?? (kind === 'url' ? rawUrl : '粘贴文本')).trim().slice(0, 200) || '未命名来源'
  const storageKey = rawText ? `knowledge-sources/${membership.companyId}/${membership.projectId}/${id}.txt` : null
  if (rawText && storageKey) await storage.put(storageKey, Buffer.from(rawText, 'utf8'), 'text/plain')
  await pool.query(
    `INSERT INTO knowledge_sources (id, company_id, project_id, conversation_id, kind, title, mime_type, size_bytes, storage_key, original_url, status, stage, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued','queued',$11)`,
    [id, membership.companyId, membership.projectId, req.params.id, kind, title, kind === 'url' ? null : 'text/plain', rawText ? Buffer.byteLength(rawText, 'utf8') : 0, storageKey, rawUrl, membership.userId],
  )
  await enqueueKnowledgeSource(id)
  res.status(201).json({ id, kind, title, status: 'queued', stage: 'queued' })
}))

api.post('/conversations/:id/sources/upload/presign', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const name = String(req.body?.name ?? '').trim().slice(0, 200)
  const mime = String(req.body?.mime ?? '').trim().toLowerCase()
  const size = Number(req.body?.size ?? 0)
  if (!name || !SOURCE_MIMES.has(mime)) throw new HttpError(415, 'unsupported source file type')
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SOURCE_BYTES) throw new HttpError(413, 'file size is outside the 25 MB limit')
  const extension = ({ 'application/pdf': 'pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'text/plain': 'txt', 'text/markdown': 'md', 'text/csv': 'csv', 'application/json': 'json' } as Record<string, string>)[mime]
  const id = `ks-${randomUUID().slice(0, 16)}`
  const key = `knowledge-sources/${membership.companyId}/${membership.projectId}/${id}.${extension}`
  const signed = await storage.presignPut(key, mime)
  await pool.query(`INSERT INTO knowledge_sources (id, company_id, project_id, conversation_id, kind, title, mime_type, size_bytes, storage_key, status, stage, created_by) VALUES ($1,$2,$3,$4,'file',$5,$6,$7,$8,'upload_pending','upload_pending',$9)`, [id, membership.companyId, membership.projectId, req.params.id, name, mime, size, key, membership.userId])
  res.status(201).json({ id, uploadUrl: signed.uploadUrl, mime, size })
}))

api.post('/conversations/:id/sources/:sourceId/complete-upload', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const { rows } = await pool.query<{ storage_key: string; size_bytes: number; created_by: string }>(`SELECT storage_key, size_bytes, created_by FROM knowledge_sources WHERE id=$1 AND project_id=$2 AND company_id=$3 AND status='upload_pending' AND deleted_at IS NULL`, [req.params.sourceId, membership.projectId, membership.companyId])
  if (!rows[0]) throw new HttpError(404, 'pending source upload not found')
  if (rows[0].created_by !== membership.userId) throw new HttpError(403, 'only the uploader can complete this upload')
  const body = await storage.readObject(rows[0].storage_key)
  if (body.length !== rows[0].size_bytes || body.length > MAX_SOURCE_BYTES) throw new HttpError(400, 'uploaded object size does not match the declaration')
  await enqueueKnowledgeSource(String(req.params.sourceId)); res.json({ ok: true, id: req.params.sourceId, status: 'queued' })
}))

api.post('/conversations/:id/sources/:sourceId/retry', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const { rows } = await pool.query<{ created_by: string }>(`SELECT created_by FROM knowledge_sources WHERE id=$1 AND project_id=$2 AND company_id=$3 AND deleted_at IS NULL`, [req.params.sourceId, membership.projectId, membership.companyId])
  if (!rows[0]) throw new HttpError(404, 'source not found')
  if (rows[0].created_by !== membership.userId && !PRIVILEGED_ROLES.has(membership.role)) throw new HttpError(403, 'not allowed to retry this source')
  await retryKnowledgeSource(String(req.params.sourceId), membership.companyId, membership.projectId); res.json({ ok: true })
}))

api.delete('/conversations/:id/sources/:sourceId', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const { rows } = await pool.query<{ created_by: string; storage_key: string | null }>(`SELECT created_by, storage_key FROM knowledge_sources WHERE id=$1 AND project_id=$2 AND company_id=$3 AND deleted_at IS NULL`, [req.params.sourceId, membership.projectId, membership.companyId])
  if (!rows[0]) throw new HttpError(404, 'source not found')
  if (rows[0].created_by !== membership.userId && !PRIVILEGED_ROLES.has(membership.role)) throw new HttpError(403, 'not allowed to delete this source')
  await deleteKnowledgeSource(String(req.params.sourceId), membership.companyId, membership.projectId)
  res.json({ ok: true })
}))

api.put('/conversations/:id/sources', safe(async (req, res) => {
  requireOpenNotebook()
  const membership = await requireGroupConversation(req, String(req.params.id))
  await assertProjectWritable(membership.projectId)
  if (!membership.projectId) throw new HttpError(409, 'conversation has no workspace')
  const excluded = Array.isArray(req.body?.excludedSourceIds) ? [...new Set(req.body.excludedSourceIds.map(String))].slice(0, 500) : []
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM conversation_source_exclusions WHERE conversation_id = $1`, [req.params.id])
    if (excluded.length) await client.query(
      `INSERT INTO conversation_source_exclusions (conversation_id, source_id, created_by)
       SELECT $1, s.id, $3 FROM knowledge_sources s
        WHERE s.project_id = $5 AND s.company_id = $2 AND s.id = ANY($4::text[])`,
      [req.params.id, membership.companyId, membership.userId, excluded, membership.projectId],
    )
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error } finally { client.release() }
  res.json({ ok: true, excludedSourceIds: excluded })
}))

/** Attach (or detach when projectId=null) a conversation to a project. */
api.post('/conversations/:id/project', async (req, res) => {
  const { userId: me, companyId: tenant } = await requireCompany(req)
  const { id } = req.params
  const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId.trim() : ''
  if (!projectId) { res.status(400).json({ error: 'projectId is required; conversations cannot be detached from a workspace' }); return }
  const { rows } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id = $1 AND company_id = $2`,
    [id, tenant],
  )
  if (!rows[0]) { res.status(404).json({ error: 'not found' }); return }
  if (!rows[0].members.includes(me)) {
    res.status(403).json({ error: 'only members can change the project' }); return
  }
  const target = await requireWorkspace(req, projectId)
  if (target.projectStatus !== 'active') { res.status(409).json({ error: 'archived courses are read-only' }); return }
  await pool.query(
    `UPDATE conversations SET project_id = $2, updated_at = NOW() WHERE id = $1 AND company_id = $3`,
    [id, projectId, tenant],
  )
  res.json({ ok: true, projectId })
})
