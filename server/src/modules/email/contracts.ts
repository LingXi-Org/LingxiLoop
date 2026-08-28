import { z } from 'zod'

export const outboundAttachmentSchema = z.object({
  key: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(0),
}).strict()

const attachmentsSchema = z.array(outboundAttachmentSchema).max(16).default([]).superRefine((attachments, context) => {
  const total = attachments.reduce((sum, attachment) => sum + attachment.sizeBytes, 0)
  if (total > 25 * 1024 * 1024) {
    context.addIssue({ code: 'custom', message: 'attachments exceed 26214400 bytes total' })
  }
})

export const sendEmailRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(256),
  to: z.array(z.string().trim().min(1)).min(1),
  cc: z.array(z.string().trim().min(1)).default([]),
  subject: z.string().trim().min(1).max(998),
  body: z.string().trim().min(1).max(50_000),
  attachments: attachmentsSchema,
}).strict()

export const replyEmailRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(256),
  body: z.string().trim().min(1).max(50_000),
  cc: z.array(z.string().trim().min(1)).default([]),
  attachments: attachmentsSchema,
}).strict()

const inboundAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(120),
  sizeBytes: z.number().int().min(0),
  contentBase64: z.string().max(14_000_000),
  truncated: z.boolean(),
}).strict().superRefine((attachment, context) => {
  if (!attachment.truncated && attachment.sizeBytes > 10 * 1024 * 1024) {
    context.addIssue({ code: 'custom', message: 'non-truncated attachment exceeds 10 MiB' })
  }
})

export const inboundEmailPayloadSchema = z.object({
  messageId: z.string().trim().min(1).max(998),
  inReplyTo: z.string().trim().min(1).max(998).nullable(),
  references: z.array(z.string().trim().min(1).max(998)).max(128),
  from: z.string().trim().min(1).max(998),
  to: z.array(z.string().trim().min(1).max(998)).max(64),
  cc: z.array(z.string().trim().min(1).max(998)).max(64),
  subject: z.string().max(998),
  text: z.string().max(5_000_000),
  html: z.string().max(20_000_000).nullable(),
  rawSizeBytes: z.number().int().min(0).max(25 * 1024 * 1024),
  autoSubmitted: z.string().trim().max(200).nullable(),
  attachments: z.array(inboundAttachmentSchema).max(32),
}).strict().superRefine((payload, context) => {
  const forwardedBytes = payload.attachments
    .filter((attachment) => !attachment.truncated)
    .reduce((total, attachment) => total + attachment.sizeBytes, 0)
  if (forwardedBytes > 18 * 1024 * 1024) {
    context.addIssue({ code: 'custom', message: 'forwarded attachments exceed 18 MiB' })
  }
})

export type SendEmailInput = z.infer<typeof sendEmailRequestSchema>
export type ReplyEmailInput = z.infer<typeof replyEmailRequestSchema>
export type OutboundAttachmentInput = z.infer<typeof outboundAttachmentSchema>
export type InboundEmailPayload = z.infer<typeof inboundEmailPayloadSchema>

export interface EmailScope {
  userId: string
  companyId: string
}

export interface EmailSendPayload {
  messageId: string
  conversationId: string
  transportStatus: 'sent' | 'failed'
  error?: string
}

export type EmailHtmlPayload =
  | { kind: 'empty' }
  | { kind: 'html'; html: string }

export interface PersistEmailMessageInput {
  conversationId: string
  companyId: string
  authorId: string
  direction: 'in' | 'out'
  transportStatus: 'queued' | 'sending' | 'sent' | 'failed' | 'received'
  transportError?: string | null
  smtpMessageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string
  fromAddr: string
  toAddrs: string[]
  ccAddrs?: string[]
  bccAddrs?: string[]
  body: string
  html?: string | null
  rawSizeBytes?: number | null
  autoSubmitted?: boolean
  idempotencyKey?: string
  attachments?: Array<{
    filename: string
    mimeType: string
    sizeBytes: number
    storageKey: string | null
    truncated?: boolean
  }>
}

export interface PersistedEmailAttachment {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  storageKey: string | null
  truncated: boolean
}

export interface EmailRetryCandidate {
  messageId: string
  conversationId: string
  companyId: string
  smtpMessageId: string | null
  inReplyTo: string | null
  references: string[]
  subject: string
  fromAddress: string
  toAddresses: string[]
  ccAddresses: string[]
  body: string
  autoSubmitted: boolean
  retryAttempts: number
}

export interface EmailRetryAttachment {
  filename: string
  mimeType: string
  sizeBytes: number
  storageKey: string | null
  truncated: boolean
}
