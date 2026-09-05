export interface DocumentRecord {
  id: string
  title: string
  createdBy: string
  conversationId: string | null
  createdAt: string
  updatedAt: string
}

export interface DocumentChangedEvent {
  type: 'doc.changed'
  kind: 'document.created' | 'document.updated' | 'document.deleted'
  documentId: string
  actorId?: string
}
