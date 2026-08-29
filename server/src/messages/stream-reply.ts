import type { MessageDeltaEvent } from '../redis.js'

const MESSAGE_DELTA_CHANNEL = 'lingxiloop:msg.delta'
type PublishEvent = (channel: string, event: MessageDeltaEvent) => Promise<unknown>

async function defaultPublish(channel: string, event: MessageDeltaEvent): Promise<unknown> {
  const { publish } = await import('../redis.js')
  return publish(channel, event)
}

export function splitReplyChunks(body: string, baseSize = 24, intervalMs = 20, maxDurationMs = 2_000): string[] {
  const chars = Array.from(body)
  if (chars.length === 0) return []
  const maxChunks = Math.max(1, Math.floor(maxDurationMs / intervalMs))
  const size = Math.max(baseSize, Math.ceil(chars.length / maxChunks))
  const chunks: string[] = []
  for (let i = 0; i < chars.length; i += size) chunks.push(chars.slice(i, i + size).join(''))
  return chunks
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Publish the complete presentation stream. Transport failures propagate. */
export async function replayReplyStream(
  base: Omit<MessageDeltaEvent, 'type' | 'delta' | 'done'>,
  body: string,
  publishEvent: PublishEvent = defaultPublish,
): Promise<boolean> {
  await publishEvent(MESSAGE_DELTA_CHANNEL, { ...base, type: 'message.delta', delta: '', done: false })
  for (const chunk of splitReplyChunks(body)) {
    await delay(20)
    await publishEvent(MESSAGE_DELTA_CHANNEL, { ...base, type: 'message.delta', delta: chunk, done: false })
  }
  return true
}

export async function finishReplyStream(
  base: Omit<MessageDeltaEvent, 'type' | 'delta' | 'done'>,
  publishEvent: PublishEvent = defaultPublish,
): Promise<void> {
  await publishEvent(MESSAGE_DELTA_CHANNEL, { ...base, type: 'message.delta', delta: '', done: true })
}
