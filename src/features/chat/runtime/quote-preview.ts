import type { ThreadMessage } from '@assistant-ui/react'
import { nativeText } from '@/lib/nativeMessage'

/** Plain preview only; never render arbitrary quoted HTML/Markdown or fetch media. */
export function quotePreviewText(message: ThreadMessage): string {
  const text = nativeText(message).trim()
  if (text) return text.slice(0, 240)
  const parts = [...message.content, ...message.role === 'user' ? message.attachments.flatMap(attachment => attachment.content) : []]
  const media = parts.find(part => part.type === 'file' || part.type === 'image')
  if (media?.type === 'file') return `附件 · ${media.filename || '文件'}`
  if (media?.type === 'image') return media.filename ? `图片 · ${media.filename}` : '图片'
  return parts.length ? '消息卡片' : '原消息不可用'
}
