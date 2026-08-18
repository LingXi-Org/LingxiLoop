/**
 * Dev helper — publish a `message.new` event to CH_MESSAGE_NEW to
 * trigger the scheduler's wake path. Useful for exercising
 * scheduler.drain → runtime mode without actually sending a real
 * message.
 *
 *   tsx server/src/agents/runtime/probe-wake.ts <conversationId> <authorId>
 *
 * The conversation must already exist and have agent members.
 */
import { redis, CH_MESSAGE_NEW } from '../../redis.js'

async function main(): Promise<void> {
  const conversationId = process.argv[2]
  const authorId = process.argv[3]
  if (!conversationId || !authorId) {
    console.error('usage: tsx probe-wake.ts <conversationId> <authorId>')
    process.exit(2)
  }
  await redis.publish(CH_MESSAGE_NEW, JSON.stringify({
    type: 'message.new',
    conversationId,
    message: { authorId },
  }))
  console.log(`[probe-wake] published msg.new for convo=${conversationId} author=${authorId}`)
  redis.disconnect()
}

void main()
