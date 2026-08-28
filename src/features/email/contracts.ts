export interface EmailAttachmentInput {
  key: string
  filename: string
  mimeType: string
  sizeBytes: number
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
