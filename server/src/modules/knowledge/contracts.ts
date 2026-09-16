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
  name: z.string().trim().min(1).max(200)
    .refine((name) => !/[\\/\u0000-\u001f\u007f]/.test(name), 'invalid file name'),
  mime: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/markdown', 'text/csv', 'application/json',
  ]),
  size: z.coerce.number().int().positive(),
}).strict()

export const updateSourceRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
}).strict()

const sourceId = z.string().trim().min(1).max(200)
const expectedSource = z.object({ enabled: z.boolean().optional(), status: z.string().trim().min(1).max(2000).optional(), title: z.string().trim().min(1).max(2000).optional() })
  .strict().refine(value => Object.keys(value).length > 0, 'expected source fields are required')
export const agentKnowledgeSchemas = {
  list_sources: z.object({}).strict(),
  search: z.object({ query: z.string().trim().min(1).max(4000), limit: z.number().int().min(1).max(8).default(8) }).strict(),
  read_source: z.object({ sourceId, offset: z.number().int().nonnegative().safe().default(0),
    limit: z.number().int().min(1).max(16_000).default(16_000) }).strict(),
  check_source: z.object({ sourceId, expected: expectedSource }).strict(),
  add_text: createSourceRequestSchema.options[0].omit({ kind: true, idempotencyKey: true }).extend({ title: updateSourceRequestSchema.shape.title,
    text: createSourceRequestSchema.options[0].shape.text.max(200_000) }).strict(),
  add_url: createSourceRequestSchema.options[1].omit({ kind: true, idempotencyKey: true }).strict(),
  add_file: z.object({ title: updateSourceRequestSchema.shape.title.optional(), clientMsgNo: sourceId }).strict(),
  retry_ingestion: z.object({ sourceId }).strict(),
  set_source_enabled: z.object({ sourceId, enabled: z.boolean() }).strict(),
  delete_source: z.object({ sourceId }).strict(),
}

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
export type UpdateSourceInput = z.infer<typeof updateSourceRequestSchema>
export type KnowledgeVisibilityScope = 'PRIVATE' | 'PROJECT'
export type KnowledgeCreatedVia = 'USER' | 'AGENT'

export interface KnowledgeScope {
  userId: string
  companyId: string
  projectId: string
}
