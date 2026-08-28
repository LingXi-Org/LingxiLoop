import { z } from 'zod'

export const activityQuerySchema = z.object({
  conversationId: z.string().trim().min(1),
})

export const memoryUpdateSchema = z.object({
  agentId: z.string().trim().min(1),
  path: z.string().regex(/^memory\/(fact|preference|instruction|relationship|observation|decision|note)\/[A-Za-z0-9._-]+\.md$/),
  body: z.string().trim().min(1),
}).strict()

export const memoryDeleteSchema = z.object({
  agentId: z.string().trim().min(1),
  path: z.string().startsWith('memory/'),
})

export const autonomyRuleSchema = z.object({
  agentId: z.string().trim().min(1),
  scope: z.string().trim().min(1),
  operation: z.string().trim().min(1),
  mode: z.enum(['allow', 'ask', 'deny']),
}).strict()
