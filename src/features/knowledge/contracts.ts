export type KnowledgeSourceStatus = 'upload_pending' | 'queued' | 'processing' | 'ready' | 'failed'

export interface KnowledgeSource {
  id: string
  kind: 'file' | 'url' | 'text'
  title: string
  mimeType: string | null
  sizeBytes: number
  originalUrl: string | null
  originalFileUrl?: string | null
  status: KnowledgeSourceStatus
  stage: string
  error: string | null
  isTruncated: boolean
  visibilityScope: 'PRIVATE' | 'PROJECT'
  ownerUserId: string
  ownerName?: string
  createdBy: string
  createdVia: 'USER' | 'AGENT'
  createdAt: string
  updatedAt: string
  chunkCount?: number
  extractedText?: string | null
  originClientMsgNo?: string | null
}

export interface KnowledgeCitation {
  sourceId: string
  sourceTitle: string
  excerpt: string
  sourceUrl?: string
  position: number
  marker: string
}

export interface ConversationSourceSelection {
  conversationId: string
  sources: Array<{ sourceId: string; title: string; status: KnowledgeSourceStatus; enabled: boolean }>
}
