import { z } from 'zod'

export const imHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).default(80),
  beforeSeq: z.coerce.number().int().nonnegative().default(0),
}).strict()

export const imReactionRequestSchema = z.object({
  messageId: z.string().trim().min(1),
  messageSeq: z.number().int().positive().safe(),
  emoji: z.string().trim().min(1).max(32),
}).strict()

const userMessagePayloadSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['text', 'attachment']),
  clientMsgNo: z.string().trim().min(1).max(80),
  body: z.string().optional(),
  replyToClientMsgNo: z.string().trim().min(1).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((payload, context) => {
  if (payload.kind === 'text' && !payload.body?.trim()) {
    context.addIssue({ code: 'custom', message: 'text message body is required', path: ['body'] })
  }
})

export const imSendAcceptanceRequestSchema = z.object({
  clientNonce: z.string().trim().min(1).max(80),
  payload: userMessagePayloadSchema,
}).strict()

export const imReadRequestSchema = z.object({
  readThroughSeq: z.number().int().positive().safe(),
}).strict()

export const imReadReceiptsQuerySchema = z.object({
  fromSeq: z.coerce.number().int().positive().safe(),
  toSeq: z.coerce.number().int().positive().safe(),
}).strict().refine((query) => query.toSeq >= query.fromSeq, {
  message: 'toSeq must be greater than or equal to fromSeq',
  path: ['toSeq'],
})

export const approvalResolutionRequestSchema = z.object({ approved: z.boolean() }).strict()

export const agentRunControlRequestSchema = z.object({
  agentId: z.string().trim().min(1),
  channelId: z.string().trim().min(1),
}).strict()

export const agentRunSteerRequestSchema = agentRunControlRequestSchema.extend({
  text: z.string().trim().min(1).max(4_000),
  clientRequestId: z.string().trim().min(1).max(80),
}).strict()
