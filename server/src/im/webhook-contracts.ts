import { nativeMessageSchema, type NativeMessage } from './message-types.js'
import { decodeNativePayload } from './wukong.js'
import { z } from 'zod'

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

const msgNotifySchema = z.array(z.object({
  message_idstr: z.string().min(1),
  channel_id: z.string().min(1),
  from_uid: z.string().min(1),
  client_msg_no: z.string().min(1).max(80),
  payload: z.unknown(),
}).passthrough()).length(1)

type ParsedWukongWebhook =
  | { success: false; error: z.ZodError<unknown> }
  | {
      success: true
      data: {
        eventId: string
        eventType: string
        channelId: string
        fromUid: string
        clientMsgNo: string
        payload: NativeMessage
      }
    }

export function parseWukongWebhook(value: unknown): ParsedWukongWebhook {
  const notify = msgNotifySchema.safeParse(value)
  const normalized = notify.success ? {
    event_id: `msg.notify:${notify.data[0].message_idstr}`,
    event_type: 'msg.notify',
    message: notify.data[0],
  } : value
  const envelope = webhookEnvelopeSchema.safeParse(normalized)
  if (!envelope.success) return envelope
  let decoded: unknown
  try {
    if (typeof envelope.data.message.payload !== 'string') throw new Error('base64 payload required')
    decoded = decodeNativePayload(envelope.data.message.payload)
  } catch { return { success: false, error: new z.ZodError([{ code: 'custom', path: ['payload'], message: 'invalid native message protocol' }]) } }
  const payload = nativeMessageSchema.safeParse(decoded)
  if (!payload.success) return { success: false, error: new z.ZodError([{ code: 'custom', path: ['payload'], message: 'invalid native message protocol' }]) }
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
