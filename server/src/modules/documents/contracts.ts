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

export interface DocumentMentionRecipient {
  id: string
  kind: 'human' | 'agent'
  name: string
}

export interface DocumentMentionEvent {
  type: 'doc.mention'
  deliveryId: string
  companyId: string
  documentId: string
  documentTitle: string
  mentionerId: string
  mentionerName: string
  mentionedIds: string[]
  workspaceId: string
}

export interface DocumentMentionDelivery {
  id: string
  companyId: string
  documentId: string
  projectId: string
  mentionerId: string
  mentionerName: string
  documentTitle: string
  recipients: DocumentMentionRecipient[]
  leaseOwner: string
  attempts: number
}

export type AgentImagePlacement =
  | { mode: 'start' | 'end' }
  | { mode: 'replace' | 'after' | 'before'; anchorText: string }

export type AgentImageDeleteMatch =
  | { by: 'src'; src: string }
  | { by: 'src-contains'; substring: string }
  | { by: 'alt'; alt: string }

export type AgentDocumentEditOperation =
  | { kind: 'append'; text: string }
  | { kind: 'replace'; find: string; replace: string }
  | { kind: 'insertParagraph'; at: 'start' | 'end'; text: string }
  | { kind: 'replaceBlock'; anchorText: string; text: string }
  | { kind: 'image'; src: string; alt: string | null; placement: AgentImagePlacement }
  | { kind: 'imageDelete'; match: AgentImageDeleteMatch }

export interface AgentDocumentEditResult {
  replaced: number
  imagePlaced: 'absolute' | 'anchor' | 'anchor-missed' | null
  imagesDeleted: number
  blocksReplaced: number
}
