export interface ReactionPayload {
  emoji: string
  count: number
  users: string[]
}

export interface ReactionChangedEvent {
  type: 'message.reactions'
  conversationId: string
  companyId: string
  messageId: string
  reactions: ReactionPayload[]
}
