import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
const base = process.argv[2] ?? 'http://127.0.0.1:55044'
async function request(path, body) {
  const response = await fetch(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) })
  const text = await response.text()
  assert.equal(response.status, 200, `${path}: ${text}`)
  return text ? JSON.parse(text) : {}
}
const ready = await request('/readyz')
const channel = `issue444-${randomUUID()}`, uid = 'issue444-synthetic-user', nonce = randomUUID()
await request('/channel', { channel_id: channel, channel_type: 2, large: 0, reset: 1, subscribers: [uid] })
const payload = Buffer.from(JSON.stringify({ type: 1, content: 'issue444 synthetic build verification' })).toString('base64')
let receipt
for (let attempt = 0; attempt < 20; attempt++) {
  receipt = await request('/message/send', { from_uid: uid, channel_id: channel, channel_type: 2, client_msg_no: nonce, payload })
  if (receipt.reason === 1) break
  await new Promise(resolve => setTimeout(resolve, 100))
}
assert.equal(receipt.reason, 1)
assert.ok(receipt.message_seq > 0)
const history = await request('/channel/messagesync', { login_uid: uid, channel_id: channel, channel_type: 2, start_message_seq: 0, end_message_seq: 0, limit: 10, pull_mode: 0 })
const messages = history.messages ?? history
assert.ok(Array.isArray(messages), JSON.stringify(history))
const sent = messages.find(message => message.client_msg_no === nonce)
assert.ok(sent, JSON.stringify(history))
assert.equal(sent.message_seq, receipt.message_seq)
assert.equal(sent.payload, payload)
console.log(JSON.stringify({ ready, acceptedReason: receipt.reason, messageSeq: receipt.message_seq, historyRoundTrip: true }, null, 2))
