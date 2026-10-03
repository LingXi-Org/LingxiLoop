import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth } from '../../http/request-context.js'
import { normalizeStorageKey, storage } from '../../storage.js'
import type { PermissionAction, PermissionResource } from '../../domain/public.js'
import { permissionService } from '../access/public.js'
import { MAX_UPLOAD_BYTES } from './contracts.js'

export const filesRouter = Router()

filesRouter.get('/files', safe(async (req, res) => {
  const userId = requireAuth(req)
  const key = typeof req.query.key === 'string' ? normalizeStorageKey(req.query.key) : null
  if (!key) throw new HttpError(400, 'invalid file key')
  const { rows } = await pool.query<{ type: PermissionResource['type']; id: string; action: PermissionAction }>(`
    SELECT 'document' AS type,document_id AS id,'document:read' AS action FROM uploaded_files WHERE storage_key=$1 AND document_id IS NOT NULL
    UNION ALL SELECT 'company',f.company_id,'company:read' FROM uploaded_files f
      JOIN company_memberships m ON m.user_id=f.owner_user_id AND m.period_id=f.company_period_id
      WHERE f.storage_key=$1 AND f.owner_user_id=$2 AND m.ended_at IS NULL AND m.status='ACTIVE'
    UNION ALL SELECT 'conversation',channel_id,'conversation:read' FROM im_send_acceptances
      WHERE payload->'attachments' @> jsonb_build_array(jsonb_build_object('id',$1::text)) AND status='accepted'
    UNION ALL SELECT 'conversation',conversation_id,'email:read' FROM email_attachments WHERE storage_key=$1
    UNION ALL SELECT 'knowledge_source',id,'knowledge:read' FROM knowledge_sources WHERE storage_key=$1 AND deleted_at IS NULL
    UNION ALL SELECT 'conversation',p.conversation_id,'conversation:read' FROM presentation_versions v
      JOIN presentations p ON p.id=v.presentation_id WHERE v.storage_key=$1
        AND (p.visibility_scope='PROJECT' OR p.authorization_user_id=$2)
  `, [key,userId])
  let allowed = false
  for (const row of rows) {
    if ((await permissionService.can({ actorUserId: userId, action: row.action, resource: { type: row.type, id: row.id } })).allowed) {
      allowed = true
      break
    }
  }
  if (!allowed) throw new HttpError(404, 'file not found')
  const metadata = await storage.statObject(key)
  const body = await storage.readObjectBounded(key, MAX_UPLOAD_BYTES)
  res.set({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:",
    'Content-Type': metadata.contentType ?? 'application/octet-stream' })
  res.send(body)
}))
