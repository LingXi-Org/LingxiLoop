import { z } from 'zod'

export const contextTypeSchema = z.enum([
  'LEARNING',
  'TEACHER_TAKEOVER',
  'INTERVENTION',
  'CASE_DISCUSSION',
  'TEACHER_OPERATIONS',
])

const idSchema = z.string().trim().min(1).max(200)

export const createTeacherThreadRequestSchema = z.object({
  contextType: z.enum(['TEACHER_TAKEOVER', 'INTERVENTION']),
  studentId: idSchema,
  caseId: idSchema.optional(),
}).strict().superRefine((input, context) => {
  if (input.contextType === 'INTERVENTION' && !input.caseId) {
    context.addIssue({ code: 'custom', path: ['caseId'], message: 'caseId required for INTERVENTION' })
  }
  if (input.contextType === 'TEACHER_TAKEOVER' && input.caseId) {
    context.addIssue({ code: 'custom', path: ['caseId'], message: 'caseId is only valid for INTERVENTION' })
  }
})

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
