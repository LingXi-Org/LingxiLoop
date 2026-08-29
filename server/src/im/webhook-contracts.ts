import { z } from 'zod'

const lingxiMessageSchema = z.object({
  version: z.literal(1),
  kind: z.enum([
    'text', 'attachment', 'system', 'tool_activity', 'approval', 'handoff',
    'questionnaire', 'poll', 'artifact', 'canvas', 'learning_mission',
  ]),
  clientMsgNo: z.string().min(1).max(80),
  body: z.string().max(64 * 1024).optional(),
  replyToClientMsgNo: z.string().min(1).optional(),
  refs: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}).strict()

const webhookEnvelopeSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  message: z.object({
    channel_id: z.string().min(1),
    from_uid: z.string().min(1),
    client_msg_no: z.string().min(1).max(80),
    payload: z.unknown(),
  }).passthrough(),
}).passthrough()

function decodePayload(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return null
  for (const candidate of [value, Buffer.from(value, 'base64').toString('utf8')]) {
    try { return JSON.parse(candidate) as unknown } catch { /* try the next supported wire representation */ }
  }
  return null
}

type ParsedWukongWebhook =
  | { success: false; error: z.ZodError }
  | {
      success: true
      data: {
        eventId: string
        eventType: string
        channelId: string
        fromUid: string
        clientMsgNo: string
        payload: z.infer<typeof lingxiMessageSchema>
      }
    }

export function parseWukongWebhook(value: unknown): ParsedWukongWebhook {
  const envelope = webhookEnvelopeSchema.safeParse(value)
  if (!envelope.success) return envelope
  const payload = lingxiMessageSchema.safeParse(decodePayload(envelope.data.message.payload))
  if (!payload.success) return payload
  if (payload.data.clientMsgNo !== envelope.data.message.client_msg_no) {
    const mismatch = lingxiMessageSchema.safeParse(null)
    if (!mismatch.success) return mismatch
    throw new Error('unreachable payload mismatch validation state')
  }
  return {
    success: true as const,
    data: {
      eventId: envelope.data.event_id,
      eventType: envelope.data.event_type,
      channelId: envelope.data.message.channel_id,
      fromUid: envelope.data.message.from_uid,
      clientMsgNo: envelope.data.message.client_msg_no,
      payload: payload.data,
    },
  }
}
