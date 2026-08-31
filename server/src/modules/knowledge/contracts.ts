import { z } from 'zod'

export const createProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(1000).default(''),
  color: z.string().max(200).nullable().optional(),
}).strict()

export const updateProjectRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(1000).optional(),
  color: z.string().max(200).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'nothing to update')

export const createSourceRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), idempotencyKey: z.string().trim().min(8).max(200), title: z.string().trim().max(200).optional(), text: z.string().trim().min(1) }).strict(),
  z.object({ kind: z.literal('url'), idempotencyKey: z.string().trim().min(8).max(200), title: z.string().trim().max(200).optional(), url: z.string().trim().url() }).strict(),
])

export const presignSourceRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  name: z.string().trim().min(1).max(200),
  mime: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown', 'text/csv', 'application/json',
  ]),
  size: z.coerce.number().int().positive(),
}).strict()

export const sourceSelectionRequestSchema = z.object({
  excludedSourceIds: z.array(z.string().trim().min(1).max(200)).max(500),
}).strict()

export const moveConversationRequestSchema = z.object({
  projectId: z.string({ error: 'projectId is required; conversations cannot be detached from a workspace' })
    .trim().min(1, 'projectId is required; conversations cannot be detached from a workspace'),
}).strict()

export type ProjectPatch = z.infer<typeof updateProjectRequestSchema>
export type CreateSourceInput = z.infer<typeof createSourceRequestSchema>
export type PresignSourceInput = z.infer<typeof presignSourceRequestSchema>
export type KnowledgeVisibilityScope = 'PRIVATE' | 'PROJECT'
export type KnowledgeCreatedVia = 'USER' | 'AGENT'

export interface KnowledgeScope {
  userId: string
  companyId: string
  projectId: string
}
