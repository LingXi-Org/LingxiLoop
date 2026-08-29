import { z } from 'zod'

const participantIdSchema = z.string().trim().min(1).max(200)

export const createGroupRequestSchema = z.object({
  clientRequestId: z.string().trim().min(8).max(80),
  title: z.string().trim().min(1).max(80),
  topic: z.string().trim().max(200).nullable().optional(),
  members: z.array(participantIdSchema).min(1).max(200),
  leaderId: participantIdSchema,
  workspaceId: z.string({ error: 'workspaceId required' }).trim().min(1, 'workspaceId required').max(200),
}).strict()

export const openDirectRequestSchema = z.object({
  otherId: participantIdSchema,
}).strict()

export const leaderRequestSchema = z.object({ leaderId: participantIdSchema }).strict()
export const titleRequestSchema = z.object({ title: z.string().trim().min(1).max(80) }).strict()
export const topicRequestSchema = z.object({
  topic: z.string().trim().max(200).nullable(),
}).strict()
export const pinRequestSchema = z.object({ pinned: z.boolean().optional() }).strict()
export const muteRequestSchema = z.object({
  mute: z.boolean(),
  until: z.string().datetime({ offset: true }).nullable().optional(),
}).strict()
export const addMemberRequestSchema = z.object({ id: participantIdSchema }).strict()
export const typingRequestSchema = z.object({ done: z.boolean() }).strict()
export const searchQuerySchema = z.object({ q: z.string().trim().max(200).default('') }).strict()

export type CreateGroupInput = z.infer<typeof createGroupRequestSchema>

export interface ConversationScope {
  userId: string
  companyId: string
  projectId: string
}

export interface WorkspacePolicy {
  courseId: string | null
  projectStatus: string
}

export interface ConversationUpdatedEvent {
  type: 'conversation.updated'
  conversationId: string
  companyId: string
  workspaceId: string
  patch: Record<string, unknown>
}

export interface TypingEvent {
  type: 'typing'
  conversationId: string
  agentId: string
  done: boolean
  companyId: string
}

export interface SearchBuckets {
  participants: Array<Record<string, unknown>>
  rooms: Array<Record<string, unknown>>
  groups: Array<Record<string, unknown>>
  messages: Array<Record<string, unknown> & { body: string }>
}
