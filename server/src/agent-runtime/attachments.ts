import { createHash } from 'node:crypto'
import { decodeSourceText, extractDocumentText, type RequestAttachment } from '@lyyzka/lingxios'
import type { ImMessageEnvelope } from '../im/messages-application.js'
import { storage } from '../storage.js'
import type { Queryable } from '../db/queryable.js'

export async function unavailableAttachmentIds(db: Queryable, companyId: string, conversationId: string, ids: string[], audienceIds: string[]) {
  if (!ids.length) return new Set<string>()
  const { rows } = await db.query<{ origin_client_msg_no: string }>(`SELECT DISTINCT source.origin_client_msg_no
    FROM knowledge_sources source WHERE source.company_id=$1 AND source.conversation_id=$2 AND source.origin_client_msg_no=ANY($3::text[])
      AND (source.deleted_at IS NOT NULL OR (source.visibility_scope='PRIVATE' AND EXISTS(SELECT 1 FROM unnest($4::text[]) reader(id) WHERE reader.id<>source.owner_user_id))
        OR EXISTS(SELECT 1 FROM conversation_source_exclusions exclusion WHERE exclusion.source_id=source.id
          AND exclusion.conversation_id=$2 AND exclusion.user_id=ANY($4::text[])))`, [companyId,conversationId,ids,audienceIds])
  return new Set(rows.map(row => row.origin_client_msg_no))
}

export function selectRequestAttachments(message: ImMessageEnvelope, explicitIds: string[], messages: ImMessageEnvelope[]): string[] {
  const ids = [...new Set([...explicitIds, ...(message.payload.kind === 'attachment' ? [message.clientMsgNo] : [])])]
  if (ids.length > 20) throw new Error('request supports at most 20 attachments')
  const threadId = message.payload.replyToClientMsgNo
  for (const item of [...messages].sort((a,b) => b.messageSeq - a.messageSeq)) {
    if (ids.length === 20) break
    if (item.channelId === message.channelId && item.messageSeq < message.messageSeq && item.fromUid === message.fromUid
      && item.payload.kind === 'attachment' && item.payload.replyToClientMsgNo === threadId && !ids.includes(item.clientMsgNo)) ids.push(item.clientMsgNo)
  }
  return ids
}

export async function readRequestAttachments(messages: ImMessageEnvelope[], ids: string[], companyId: string,
  signal: AbortSignal, unavailable: ReadonlySet<string>): Promise<RequestAttachment[]> {
  const result: RequestAttachment[] = []
  for (const id of ids) {
    const message = messages.find(item => item.clientMsgNo === id), data = message?.payload.data
    if (message?.payload.kind !== 'attachment' || typeof data?.key !== 'string' || !data.key.startsWith(`attachments/${companyId}/`)
      || typeof data.name !== 'string' || !data.name.trim() || typeof data.mime !== 'string' || !Number.isSafeInteger(data.size)
      || Number(data.size) < 0) throw new Error('invalid committed attachment')
    const attachment: RequestAttachment = { id, sourceVersion: `committed:${id}`, name: data.name, mimeType: data.mime, size: Number(data.size) }
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
