import { z } from 'zod'

export const messageHistoryQuerySchema = z.object({
  before: z.coerce.number().finite().int().positive().optional(),
  limit: z.coerce.number().finite().int().min(1).max(500).default(80),
})

export const emailReplyRequestSchema = z.object({
  body: z.string().trim().min(1),
}).strict()

export const reactionRequestSchema = z.object({
  emoji: z.string().trim().min(1).max(32),
}).strict()

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
