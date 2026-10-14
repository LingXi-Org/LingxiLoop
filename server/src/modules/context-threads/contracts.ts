import { z } from 'zod'

export const contextTypeSchema = z.enum([
  'LEARNING',
  'HOMEWORK',
  'TEACHER_TAKEOVER',
  'TEACHER_OPERATIONS',
])

const idSchema = z.string().trim().min(1).max(200)

export const createTeacherThreadRequestSchema = z.object({ contextType: z.literal('TEACHER_TAKEOVER'), studentId: idSchema }).strict()

export const createLearningThreadRequestSchema = z.object({ agentId: idSchema }).strict()

export type ContextType = z.infer<typeof contextTypeSchema>
export type CreateTeacherThreadInput = z.infer<typeof createTeacherThreadRequestSchema>

export interface ContextThreadScope {
  userId: string
  companyId: string
  projectId: string
}

export interface ContextThreadResult {
  id: string
  channelId: string
  contextType: ContextType
  contextId: string
  participantIds: string[]
  created: boolean
}
