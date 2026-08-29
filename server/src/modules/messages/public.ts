import { messagesApplication } from './facade.js'

export function wukongReactions(companyId: string, conversationId: string, messageIds: string[]) {
  return messagesApplication.wukongReactions(companyId, conversationId, messageIds)
}

export function toggleWukongReaction(input: {
  companyId: string
  userId: string
  conversationId: string
  messageId: string
  messageSeq: number
  messageAuthorId: string
  emoji: string
}) {
  return messagesApplication.toggleWukongReaction(input)
}
