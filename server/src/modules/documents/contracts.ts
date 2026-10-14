import { z } from 'zod'

export const createDocumentRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  conversationId: z.string().trim().min(1).nullable().optional(),
}).strict()

export const renameDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
}).strict()

const agentText = z.string().min(1).max(64_000)
const agentId = z.string().trim().min(1).max(2000)
export const agentDocumentEditOperationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('append'), text: agentText }).strict(),
  z.object({ kind: z.literal('replace'), find: agentText, replace: z.string().max(64_000) }).strict(),
  z.object({ kind: z.literal('insertParagraph'), at: z.enum(['start', 'end']), text: agentText }).strict(),
  z.object({ kind: z.literal('replaceBlock'), anchorText: agentText, text: z.string().max(64_000) }).strict(),
  z.object({ kind: z.literal('image'), src: z.url().max(8000).refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password
  }, 'image source must be HTTPS without credentials'), alt: z.string().max(2000).nullable(),
  placement: z.union([z.object({ mode: z.enum(['start', 'end']) }).strict(),
    z.object({ mode: z.enum(['replace', 'after', 'before']), anchorText: agentText }).strict()]) }).strict(),
  z.object({ kind: z.literal('imageDelete'), match: z.discriminatedUnion('by', [
    z.object({ by: z.literal('src'), src: agentText.max(8000) }).strict(),
    z.object({ by: z.literal('src-contains'), substring: agentText.max(8000) }).strict(),
    z.object({ by: z.literal('alt'), alt: agentText.max(8000) }).strict(),
  ]) }).strict(),
])
export const agentDocumentSchemas = {
  list: z.object({}).strict(),
  recent: z.object({ sinceMinutes: z.int().min(1).max(43_200).default(60) }).strict(),
  read: z.object({ documentId: agentId }).strict(),
  create: z.object({ title: renameDocumentRequestSchema.shape.title, body: z.string().max(64_000) }).strict(),
  edit: z.object({ documentId: agentId, expectedRevision: z.string().min(1).max(200),
    operations: z.array(agentDocumentEditOperationSchema).min(1).max(32).refine(value => JSON.stringify(value).length <= 64_000, 'edits exceed 64000 characters') }).strict(),
  rename: renameDocumentRequestSchema.extend({ documentId: agentId, expectedTitle: z.string().max(2000) }).strict(),
  delete: z.object({ documentId: agentId, expectedRevision: z.string().min(1).max(200) }).strict(),
}

export interface DocumentPayload {
  id: string
  title: string
  createdBy: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

export interface RecentDocumentCreation {
  id: string
  title: string
  createdBy: string
  createdAt: Date
}

export interface DocumentScope {
  userId: string
  companyId: string
  projectId: string
}

export interface DocumentChangedEvent {
  type: 'doc.changed'
  kind: 'document.created' | 'document.updated' | 'document.deleted'
  companyId: string
  workspaceId: string
  documentId: string
  actorId: string
}

export interface DocumentUpdateEvent {
  type: 'doc.update'
  companyId: string
  documentId: string
  updateB64: string
  originId: string
  authorId: string
}

export interface DocumentAwarenessEvent {
  type: 'doc.awareness'
  companyId: string
  documentId: string
  updateB64: string
  originId: string
}

export type AgentImagePlacement =
  | { mode: 'start' | 'end' }
  | { mode: 'replace' | 'after' | 'before'; anchorText: string }

export type AgentImageDeleteMatch =
  | { by: 'src'; src: string }
  | { by: 'src-contains'; substring: string }
  | { by: 'alt'; alt: string }

export type AgentDocumentEditOperation = z.infer<typeof agentDocumentEditOperationSchema>

export interface AgentDocumentEditResult {
  replaced: number
  imagePlaced: 'absolute' | 'anchor' | 'anchor-missed' | null
  imagesDeleted: number
  blocksReplaced: number
}
