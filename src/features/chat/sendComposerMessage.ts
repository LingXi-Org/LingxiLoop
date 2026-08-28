import type { ApiAttachment } from '@/api/contracts'
import { sendUserMessage } from './state/messages'

export function sendComposerMessage(input: {
  conversationId: string
  text: string
  attachment: ApiAttachment | null
  replyingToId: string | null
}) {
  return sendUserMessage(input.conversationId, input.text, input.attachment, input.replyingToId)
}
