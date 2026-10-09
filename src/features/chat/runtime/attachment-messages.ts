import type { CompleteAttachment } from '@assistant-ui/react'
import type { ApiAttachment } from '@/api/contracts'
import { createNativeMessage, nativeAttachmentSchema, type NativeAttachment } from '@/lib/nativeMessage'

export function uploadedAttachment(upload: ApiAttachment & { key?: string }): NativeAttachment {
  if (!upload.key) throw new Error('附件缺少已上传文件身份')
  return nativeAttachmentSchema.parse({ id: upload.key, type: upload.kind === 'img' ? 'image' : 'document', name: upload.name,
    contentType: upload.mime ?? 'application/octet-stream', status: { type: 'complete' }, content: upload.kind === 'img'
      ? [{ type: 'image', image: upload.url, filename: upload.name }]
      : [{ type: 'file', data: upload.key, sourceType: 'id', mimeType: upload.mime ?? 'application/octet-stream', filename: upload.name }] })
}

/** One composer submission is one message; browser Files never enter persistence. */
export function attachmentMessage(attachments: readonly CompleteAttachment[], body: string, replyToClientMsgNo: string | null,
  mentions: { mentionedIds: string[]; mentionAll: boolean }) {
  if (attachments.length > 20) throw new Error('一次最多发送 20 个附件')
  return createNativeMessage({ id: `temp-${crypto.randomUUID()}`, role: 'user', content: body ? [{ type: 'text', text: body }] : [],
    attachments: attachments.map(({ file: _file, ...attachment }) => nativeAttachmentSchema.parse(attachment)),
    custom: { ...mentions, ...(replyToClientMsgNo ? { replyToClientMsgNo } : {}) } })
}
