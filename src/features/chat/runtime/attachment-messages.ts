import type { ApiAttachment } from '@/api/contracts'
import type { LingxiMessageV1 } from '@/lib/im/wukong'

/** One committed attachment per IM message; only the last message requests an answer. */
export function attachmentMessages(attachments: readonly (ApiAttachment & { key?: string })[], body: string,
  replyToClientMsgNo: string | null, mentions: { mentionedIds: string[]; mentionAll: boolean }): LingxiMessageV1[] {
  if (!attachments.length || attachments.length > 20) throw new Error('一次可发送 1–20 个附件')
  const ids = attachments.map(() => `temp-${crypto.randomUUID()}`)
  return attachments.map((attachment, index) => {
    const last = index === attachments.length - 1
    return { version: 1, kind: 'attachment', clientMsgNo: ids[index], body: last ? body : '',
      ...(replyToClientMsgNo ? { replyToClientMsgNo } : {}),
      data: { ...attachment, ...(last ? { ...mentions, attachmentClientMsgNos: ids } : { suppressAgentWake: true }) } }
  })
}
