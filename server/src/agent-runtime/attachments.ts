import { nativeAttachments } from '../im/message-types.js'
import { attachmentMetadata } from '../im/attachments.js'
import { attachmentRefSchema, type AttachmentRef } from '../im/contracts.js'
import { createHash } from 'node:crypto'
import { decodeSourceText, extractDocumentText, type RequestAttachment } from '@lyyzka/lingxios'
import type { ImMessageEnvelope } from '../im/messages-application.js'
import { storage } from '../storage.js'
import type { Queryable } from '../db/queryable.js'

export const attachmentRefId = (ref: AttachmentRef) => JSON.stringify([ref.clientMsgNo,ref.attachmentId])

export function parseAttachmentRefId(id: string): AttachmentRef {
  const pair: unknown = JSON.parse(id)
  if (!Array.isArray(pair) || pair.length !== 2) throw new Error('invalid attachment reference')
  return attachmentRefSchema.parse({ clientMsgNo: pair[0], attachmentId: pair[1] })
}

export async function unavailableAttachmentIds(db: Queryable, companyId: string, conversationId: string, refs: AttachmentRef[], audienceIds: string[]) {
  if (!refs.length) return new Set<string>()
  const { rows } = await db.query<{ origin_client_msg_no: string; origin_attachment_id: string }>(`SELECT DISTINCT source.origin_client_msg_no,source.origin_attachment_id
    FROM knowledge_sources source WHERE source.company_id=$1 AND source.conversation_id=$2
      AND (source.origin_client_msg_no,source.origin_attachment_id) IN (
        SELECT ref->>'clientMsgNo',ref->>'attachmentId' FROM jsonb_array_elements($3::jsonb) ref)
      AND (source.deleted_at IS NOT NULL OR (source.visibility_scope='PRIVATE' AND EXISTS(SELECT 1 FROM unnest($4::text[]) reader(id) WHERE reader.id<>source.owner_user_id))
        OR EXISTS(SELECT 1 FROM conversation_source_exclusions exclusion WHERE exclusion.source_id=source.id
          AND exclusion.conversation_id=$2 AND exclusion.user_id=ANY($4::text[])))`, [companyId,conversationId,JSON.stringify(refs),audienceIds])
  return new Set(rows.map(row => attachmentRefId({ clientMsgNo: row.origin_client_msg_no, attachmentId: row.origin_attachment_id })))
}

export function selectRequestAttachments(message: ImMessageEnvelope, explicit: AttachmentRef[], messages: ImMessageEnvelope[]): AttachmentRef[] {
  const refs = new Map([...explicit, ...nativeAttachments(message.payload).map(file => ({ clientMsgNo: message.clientMsgNo, attachmentId: file.id }))]
    .map(ref => [attachmentRefId(ref),ref]))
  if (refs.size > 20) throw new Error('request supports at most 20 attachments')
  const threadId = message.payload.metadata.custom.replyToClientMsgNo
  for (const item of [...messages].sort((a,b) => b.messageSeq - a.messageSeq)) {
    if (item.channelId !== message.channelId || item.messageSeq >= message.messageSeq || item.fromUid !== message.fromUid
      || item.payload.metadata.custom.replyToClientMsgNo !== threadId) continue
    for (const file of nativeAttachments(item.payload)) {
      const ref = { clientMsgNo: item.clientMsgNo, attachmentId: file.id }
      if (refs.size < 20) refs.set(attachmentRefId(ref),ref)
    }
  }
  return [...refs.values()]
}

export async function readRequestAttachments(messages: ImMessageEnvelope[], refs: AttachmentRef[], companyId: string,
  signal: AbortSignal, unavailable: ReadonlySet<string>): Promise<RequestAttachment[]> {
  const result: RequestAttachment[] = []
  for (const ref of refs) {
    const id = attachmentRefId(ref), message = messages.find(item => item.clientMsgNo === ref.clientMsgNo)
    const file = message && nativeAttachments(message.payload).find(item => item.id === ref.attachmentId)
    if (!file) throw new Error('invalid committed attachment')
    const data = await attachmentMetadata(file,companyId)
    const attachment: RequestAttachment = { id, sourceVersion: `committed:${id}`, name: data.name, mimeType: data.mime, size: data.size }
    const mime = data.mime.split(';')[0].trim().toLowerCase()
    if (unavailable.has(id)) attachment.contentStatus = 'unavailable'
    else if (attachment.size > 16 * 1024 * 1024) attachment.contentStatus = 'too_large'
    else if (!mime.startsWith('text/') && !['application/json','application/xml','application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(mime)) attachment.contentStatus = 'unsupported'
    else {
      try {
        const bytes = Uint8Array.from(await storage.readObjectBounded(data.key, 16 * 1024 * 1024, signal))
        if (bytes.length !== data.size) throw new Error('attachment bytes differ from the committed size')
        attachment.sourceVersion = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
        const text = mime === 'application/pdf' ? await extractDocumentText(bytes, 'pdf', signal)
          : mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ? await extractDocumentText(bytes, 'docx', signal) : decodeSourceText(bytes)
        if (text.length > 1_000_000) attachment.contentStatus = 'too_large'
        else if (!text.trim()) attachment.contentStatus = 'empty'
        else attachment.text = text
      } catch {
        signal.throwIfAborted()
        attachment.contentStatus = 'failed'
      }
    }
    result.push(attachment)
  }
  return result
}
