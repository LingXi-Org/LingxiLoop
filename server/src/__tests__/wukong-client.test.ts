import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { WukongClient } from '../im/wukong.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

test('WuKong channel reconciliation uses the v3 integer-switch contract', async () => {
  let body: Record<string, unknown> = {}
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response('{"status":200}', { status: 200 })
  }
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  await client.upsertChannel({ channelId: 'study', channelType: 2, title: 'Study Room', members: ['student', 'nova'] })
  assert.deepEqual(body, {
    channel_id: 'study', channel_type: 2, large: 0, reset: 1, subscribers: ['student', 'nova'],
  })
})

test('WuKong adapter uses v3 message endpoints and preserves client_msg_no', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), init })
    return new Response(JSON.stringify({ message_id: 'wk-1', message_seq: 9 }), { status: 200 })
  }
  const client = new WukongClient({ apiUrl: 'http://wk:5001', wsUrl: 'ws://wk:5200', apiToken: 'token', webhookSecret: 'secret' })
  const sent = await client.sendMessage('study', 2, 'nova', { version: 1, kind: 'text', clientMsgNo: 'client-1', body: 'hello' })
  assert.deepEqual(sent, { messageId: 'wk-1', messageSeq: 9 })
  assert.equal(calls[0]?.url, 'http://wk:5001/message/send')
  const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>
  assert.equal(body.client_msg_no, 'client-1')
  assert.deepEqual(JSON.parse(Buffer.from(String(body.payload), 'base64').toString('utf8')), {
    type: 1000, version: 1, kind: 'text', clientMsgNo: 'client-1', body: 'hello',
  })
  const headers = calls[0]?.init?.headers as Record<string, string> | undefined
  assert.equal(headers?.token, 'token')
})

test('WuKong adapter syncs channel history and decodes Lingxi payloads', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  const encoded = Buffer.from(JSON.stringify({
    type: 1000, version: 1, kind: 'text', clientMsgNo: 'client-9', body: 'learn',
  })).toString('base64')
  globalThis.fetch = async (input, init) => {
    calls.push({ url: String(input), body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    return new Response(JSON.stringify({ messages: [{
      message_idstr: 'wk-9', message_seq: 9, client_msg_no: 'client-9', channel_id: 'study',
      channel_type: 2, from_uid: 'sage', timestamp: 123, payload: encoded,
    }] }), { status: 200 })
  }
  const client = new WukongClient({ apiUrl: 'http://wk:5001', wsUrl: 'ws://wk:5200', apiToken: 'token', webhookSecret: 'secret' })
  const messages = await client.syncMessages('study', 2, 80, 'student', 9)
  assert.equal(calls[0]?.url, 'http://wk:5001/channel/messagesync')
  assert.equal(calls[0]?.body.login_uid, 'student')
  assert.equal(calls[0]?.body.end_message_seq, 9)
  assert.equal(calls[0]?.body.pull_mode, 1)
  assert.equal(messages[0]?.payload.body, 'learn')
  assert.equal(messages[0]?.messageId, 'wk-9')
  assert.equal(messages[0]?.clientMsgNo, 'client-9')
})

test('WuKong history repairs authoritative membership once before retrying', async () => {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = []
  globalThis.fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> })
    if (calls.length === 1) {
      return new Response('{"msg":"internal/message: valid channel membership required","status":400}', { status: 400 })
    }
    return new Response(url.endsWith('/channel/messagesync') ? '{"messages":[]}' : '{}', { status: 200 })
  }
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  const profile = { channelId: 'study', channelType: 2 as const, title: 'Study Room', members: ['student', 'nova'] }

  assert.deepEqual(await client.syncMessages('study', 2, 80, 'student', 0, profile), [])
  assert.deepEqual(calls.map(({ url }) => url), [
    'http://wk/channel/messagesync',
    'http://wk/channel',
    'http://wk/channel/messagesync',
  ])
  assert.deepEqual(calls[1]?.body, {
    channel_id: 'study', channel_type: 2, large: 0, reset: 1, subscribers: ['student', 'nova'],
  })
})

test('WuKong history rejects invalid pagination before making a provider request', async () => {
  let called = false
  globalThis.fetch = async () => { called = true; return new Response('{}') }
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  await assert.rejects(() => client.syncMessages('study', 2, 0), /limit/)
  await assert.rejects(() => client.syncMessages('study', 2, 80, 'student', -1), /cursor/)
  assert.equal(called, false)
})

test('WuKong adapter treats missing empty-channel sync state as empty results', async () => {
  globalThis.fetch = async () => new Response('messagesync not found', { status: 404 })
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  assert.deepEqual(await client.syncMessages('empty', 2), [])
  await assert.doesNotReject(client.clearUnread('student', 'empty', 2))
})

test('WuKong client sets the exact remaining unread count for partial visibility', async () => {
  let requestUrl = ''
  let body: Record<string, unknown> = {}
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input)
    body = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response('{}', { status: 200 })
  }
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  await client.setUnread('student', 'study', 2, 4)
  assert.equal(requestUrl, 'http://wk/conversations/setUnread')
  assert.deepEqual(body, { uid: 'student', channel_id: 'study', channel_type: 2, unread: 4 })
})

test('WuKong adapter accepts v3 empty-state errors returned as HTTP 400', async () => {
  const responses = [
    '{"msg":"internal/message: channel not found: channel: channel not found: {direct-nova-6fd4-efca5d 2}","status":400}',
    '{"msg":"db: not found","status":400}',
  ]
  globalThis.fetch = async () => new Response(responses.shift(), { status: 400 })
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  assert.deepEqual(await client.syncMessages('direct-nova-6fd4-efca5d', 2), [])
  await assert.doesNotReject(client.clearUnread('student', 'direct-nova-6fd4-efca5d', 2))
})

test('WuKong adapter treats the empty-channel 500 response as empty results', async () => {
  globalThis.fetch = async () => new Response('messagesync not found', { status: 500 })
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  assert.deepEqual(await client.syncMessages('empty', 2), [])
  await assert.doesNotReject(client.clearUnread('student', 'empty', 2))
})

test('WuKong adapter recognizes structured and localized empty-channel 500 responses', async () => {
  for (const detail of [
    '{"error":"channel does not exist"}',
    '{"message":"no_messages"}',
    '{"message":"频道不存在"}',
  ]) {
    globalThis.fetch = async () => new Response(detail, { status: 500 })
    const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
    assert.deepEqual(await client.syncMessages('empty', 2), [])
  }
})

test('WuKong adapter does not hide unrelated history failures', async () => {
  globalThis.fetch = async () => new Response('storage unavailable', { status: 500 })
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  await assert.rejects(() => client.syncMessages('study', 2), /storage unavailable/)
})

test('WuKong adapter does not hide unrelated HTTP 400 failures', async () => {
  globalThis.fetch = async () => new Response('{"msg":"channel_id cannot be empty","status":400}', { status: 400 })
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  await assert.rejects(() => client.syncMessages('study', 2), /channel_id cannot be empty/)
  await assert.rejects(() => client.clearUnread('student', 'study', 2), /channel_id cannot be empty/)
})

test('WuKong stream events include enough routing metadata for the browser', async () => {
  let body: Record<string, unknown> = {}
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>
    return new Response('{}', { status: 200 })
  }
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: 'secret' })
  await client.emitEvent({
    channelId: 'study', channelType: 2, fromUid: 'nova', clientMsgNo: 'preview-1',
    eventId: 'evt-1', eventType: 'stream.delta', data: { kind: 'text', delta: 'hi' },
  })
  assert.deepEqual(body.payload, {
    kind: 'text', delta: 'hi', channelId: 'study', channelType: 2, fromUid: 'nova', clientMsgNo: 'preview-1',
  })
})

test('WuKong webhook signatures are constant-time HMAC contracts', () => {
  const raw = Buffer.from('{"event":"message.committed"}')
  const secret = 'test-webhook-secret'
  const signature = createHmac('sha256', secret).update(raw).digest('hex')
  const client = new WukongClient({ apiUrl: 'http://wk', wsUrl: 'ws://wk', apiToken: 'token', webhookSecret: secret })
  assert.equal(client.verifyWebhook(raw, `sha256=${signature}`), true)
  assert.equal(client.verifyWebhook(raw, 'sha256=deadbeef'), false)
  assert.equal(client.verifyWebhook(Buffer.from('tampered'), `sha256=${signature}`), false)
})
