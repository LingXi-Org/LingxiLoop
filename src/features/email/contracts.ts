export interface EmailAttachmentInput {
  key: string
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface EmailThread {
  conversationId: string
  title: string
  updatedAt: string
  lastSubject: string | null
  lastFrom: string | null
  lastAt: string | null
  lastBody: string | null
}

export interface EmailMessage {
  id: string
  sequence: number
  body: string
  createdAt: string
  email: {
    subject: string
    from: string
    to: string[]
    cc: string[]
    direction: 'in' | 'out'
    hasHtml: boolean
    transportStatus: string
    attachments: Array<{ id: string; filename: string; sizeBytes: number; url: string | null; truncated: boolean }>
  }
}

export interface SendEmailInput {
  idempotencyKey: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  attachments?: EmailAttachmentInput[]
}

export interface ReplyEmailInput {
  idempotencyKey: string
  body: string
  cc?: string[]
  attachments?: EmailAttachmentInput[]
}

export interface EmailDeliveryResult {
  messageId: string
  conversationId: string
  transportStatus: string
  error?: string | null
}

export type EmailComposition =
  | { mode: 'new' }
  | { mode: 'reply'; replyToMessageId: string }
  | null
