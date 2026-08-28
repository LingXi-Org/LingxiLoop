import { z } from 'zod'

export const createDocumentRequestSchema = z.object({
  title: z.string().trim().max(200).optional(),
  conversationId: z.string().trim().min(1).nullable().optional(),
}).strict()

export const renameDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
}).strict()

export interface DocumentPayload {
  id: string
  title: string
  createdBy: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
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
