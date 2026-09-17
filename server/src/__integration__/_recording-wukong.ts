import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { WukongClient, _setWukongClientForTests } from '../im/wukong.js'
import type { ImMessage } from '../im/types.js'

/** Exercise the HTTP client, including copies created with an action's AbortSignal. */
export async function installRecordingWukong() {
  const messages: ImMessage[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(chunk)
    const input = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    response.setHeader('content-type','application/json')
    if (request.url === '/message/send') {
      const payload = JSON.parse(Buffer.from(input.payload,'base64').toString())
      const messageSeq = messages.length + 1, messageId = `recorded-${messageSeq}`
      messages.push({ channelId: input.channel_id,channelType: input.channel_type,fromUid: input.from_uid,
        payload,messageId,messageSeq,clientMsgNo: payload.clientMsgNo,timestamp: Date.now() / 1000 })
      response.end(JSON.stringify({ message_id: messageId,message_seq: messageSeq }))
    } else if (request.url === '/channel/messagesync') {
      response.end(JSON.stringify({ messages: messages.filter(message => message.channelId === input.channel_id
        && (!input.start_message_seq || message.messageSeq <= input.start_message_seq)).slice(-(input.limit || 80))
        .map(message => ({ ...message,payload: Buffer.from(JSON.stringify(message.payload)).toString('base64') })) }))
    } else response.end(JSON.stringify({ messages: [] }))
  })
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve))
  const address = server.address(); assert.ok(address && typeof address === 'object')
  _setWukongClientForTests(new WukongClient({ apiUrl: `http://127.0.0.1:${address.port}`,wsUrl: 'ws://unused',apiToken: 'fixture',webhookSecret: 'fixture' }))
  return { messages,close: () => new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())) }
}
