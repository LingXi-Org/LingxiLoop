import type { Queryable } from '../db/queryable.js'
import { HttpError } from '../http/errors.js'
import { storage, normalizeStorageKey } from '../storage.js'
import { MAX_UPLOAD_BYTES } from '../modules/platform/contracts.js'
import { nativeAttachments, type NativeAttachment, type NativeMessage } from './message-types.js'

export async function attachmentMetadata(attachment: NativeAttachment, companyId: string) {
  const key = normalizeStorageKey(attachment.id)
  if (!key || key !== attachment.id || !key.startsWith(`attachments/${companyId}/`)) throw new HttpError(403, 'attachment is unavailable')
  if (attachment.content.length !== 1) throw new HttpError(400, 'attachment requires one media reference')
  const part = attachment.content[0]
  if (!(part.type === 'file' && part.sourceType === 'id' && part.data === key)
    && !(part.type === 'image' && part.image === await storage.publicUrl(key))) throw new HttpError(403, 'attachment reference does not match its identity')
  const metadata = await storage.statObject(key)
  if (metadata.sizeBytes > MAX_UPLOAD_BYTES) throw new HttpError(413, 'attachment exceeds upload limit')
  const mime = metadata.contentType ?? 'application/octet-stream'
  if (attachment.contentType !== mime || part.type === 'file' && part.mimeType !== mime) throw new HttpError(400, 'attachment media type changed')
  return { key, name: attachment.name, mime, size: metadata.sizeBytes }
}

export async function assertOwnedMessageAttachments(db: Queryable, input: { companyId: string; userId: string; payload: NativeMessage }) {
  // Uploaded media lives once, in attachments. Inline human media cannot bypass its identity/ownership check.
  if (input.payload.content.some(part => part.type === 'image' || part.type === 'file')) throw new HttpError(400, 'uploaded media requires a native attachment')
  for (const attachment of nativeAttachments(input.payload)) {
    const { rows } = await db.query(`SELECT 1 FROM uploaded_files file
      JOIN company_memberships membership ON membership.company_id=file.company_id AND membership.user_id=file.owner_user_id
        AND membership.period_id=file.company_period_id AND membership.status='ACTIVE' AND membership.ended_at IS NULL
      WHERE file.storage_key=$1 AND file.company_id=$2 AND file.owner_user_id=$3`,[attachment.id,input.companyId,input.userId])
    if (!rows.length) throw new HttpError(403, 'attachment is unavailable')
    await attachmentMetadata(attachment,input.companyId)
  }
}
