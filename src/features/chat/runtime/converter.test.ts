import assert from 'node:assert/strict'
import test from 'node:test'
import type { ImEnvelope } from '@/lib/im/wukong'
import { createNativeMessage, serializeMessage, DATA_NAMES } from '@/lib/nativeMessage'
import type { Participant } from '@/types'
import { convertEnvelope, convertEnvelopeBatch, projectMessageGroups } from './converter'
import { getLingxiMessageMetadata } from './model'

const participants: Record<string, Participant> = {
  me: { id: 'me', kind: 'human', name: 'Me', initial: 'M', avatarBg: '#fff', status: 'avail' },
  agent: { id: 'agent', kind: 'agent', name: 'Scout', initial: 'S', avatarBg: '#fff', status: 'avail' },
}
function envelope(kind: 'text' | 'attachment' | 'poll', data: Record<string, unknown> = {}, patch: Partial<ImEnvelope> = {}): ImEnvelope {
  return { messageId: `${kind}-server`, messageSeq: 7, clientMsgNo: `${kind}-client`, channelId: 'room', channelType: 2,
    fromUid: kind === 'text' ? 'me' : 'agent', timestamp: 1_767_225_600,
    payload: createNativeMessage({ id: patch.messageId ?? `${kind}-client`, role: kind === 'text' ? 'user' : 'assistant', createdAt: new Date((patch.timestamp ?? 1_767_225_600) * 1000).toISOString(),
      content: kind === 'text' ? [{ type: 'text', text: 'hello' }] : kind === 'attachment'
        ? [{ type: 'file', data: String(data.url ?? 'https://example.com/lesson.pdf'), filename: String(data.name ?? 'lesson.pdf'), mimeType: 'application/pdf', sourceType: 'url' }]
        : [{ type: 'data', name: 'poll', data }] }), ...patch }
}

test('native identity, date, role and content survive IM decoration independently of the viewer', () => {
  const input = envelope('text')
  for (const timestamp of [0, 1_767_225_600, 1_767_225_600_000]) for (const meId of ['me', 'other']) {
    const message = convertEnvelope({ ...input, timestamp }, { participants, meId })
    assert.equal(message.id, input.payload.id)
    assert.equal(message.role, 'user')
    assert.equal(message.createdAt.toISOString(), input.payload.createdAt)
    assert.deepEqual(message.content, input.payload.content)
    assert.equal(getLingxiMessageMetadata(message).isMine, meId === 'me')
    assert.equal(getLingxiMessageMetadata(message).imMessageId, input.messageId)
  }
})

test('business data stays native and JSON replay retains all fields instead of fabricating tool calls', () => {
  for (const name of DATA_NAMES) {
    const payload = createNativeMessage({ id: name, role: 'assistant', content: [{ type: 'data', name, data: { title: name } }],
      custom: { refs: { agentId: 'agent' } } })
    const message = convertEnvelope({ ...envelope('text'), fromUid: 'agent', payload }, { participants, meId: 'me' })
    assert.deepEqual(message.content, payload.content)
    assert.deepEqual(message.status, payload.status)
    assert.deepEqual(serializeMessage(message).content, payload.content)
    assert.equal(getLingxiMessageMetadata(message).schema, 'lingxiloop.thread-message.v2')
  }
})

test('batch conversion is stable, deduplicated, and projects sender grouping', () => {
  const first = envelope('poll', { title: '工具状态' }, { messageId: 'one', messageSeq: 1, timestamp: 1_767_225_600 })
  const second = envelope('poll', { title: '工具状态' }, { messageId: 'two', messageSeq: 2, timestamp: 1_767_225_610 })
  second.payload = { ...second.payload, id: 'two' }
  const duplicate = { ...second, messageSeq: 2 }
  const messages = convertEnvelopeBatch([second, first, duplicate], { participants, meId: 'me' })
  assert.deepEqual(messages.map((message) => message.id), ['one', 'two'])
  assert.equal(getLingxiMessageMetadata(messages[0]!).groupEnd, false)
  assert.equal(getLingxiMessageMetadata(messages[1]!).groupStart, false)
})

test('clusters adjacent text, attachments, and assistant-ui cards by sender rather than message kind', () => {
  const agentText = envelope('text', {}, { fromUid: 'agent', messageId: 'agent-text', messageSeq: 1, timestamp: 1_767_225_600 })
  const agentCard = envelope('poll', { title: '卡片' }, { fromUid: 'agent', messageId: 'agent-card', messageSeq: 2, timestamp: 1_767_225_610 })
  agentCard.payload = { ...agentCard.payload, id: 'agent-card' }
  const mineText = envelope('text', {}, { messageId: 'mine-text', messageSeq: 3, timestamp: 1_767_226_000 })
  const mineAttachment = envelope('attachment', { name: 'lesson.pdf', url: 'https://example.com/lesson.pdf', mime: 'application/pdf' }, { fromUid: 'me', messageId: 'mine-attachment', messageSeq: 4, timestamp: 1_767_226_010 })
  mineAttachment.payload = { ...mineAttachment.payload, id: 'mine-attachment' }

  const messages = convertEnvelopeBatch([agentText, agentCard, mineText, mineAttachment], { participants, meId: 'me' })
  const metadata = messages.map(getLingxiMessageMetadata)

  assert.deepEqual(metadata.map(({ groupStart, groupEnd, isMine }) => ({ groupStart, groupEnd, isMine })), [
    { groupStart: true, groupEnd: false, isMine: false },
    { groupStart: false, groupEnd: true, isMine: false },
    { groupStart: true, groupEnd: false, isMine: true },
    { groupStart: false, groupEnd: true, isMine: true },
  ])
  assert.deepEqual(metadata.map(({ presentation }) => presentation), [
    'conversation',
    'special-card',
    'conversation',
    'special-card',
  ])
})

test('a card-first agent cluster inherits the following bubble chrome once', () => {
  const card = envelope('poll', { title: '卡片' }, {
    fromUid: 'agent', messageId: 'agent-card', messageSeq: 1, timestamp: 1_767_225_600,
  })
  const text = envelope('text', {}, {
    fromUid: 'agent', messageId: 'agent-text', messageSeq: 2, timestamp: 1_767_225_610,
  })
  const messages = convertEnvelopeBatch([card, text], { participants, meId: 'me' })
  const chromeAt = messages[1]!.createdAt.toISOString()

  assert.deepEqual(messages.map((message) => getLingxiMessageMetadata(message).clusterChromeAt), [chromeAt, chromeAt])
})

test('group projection preserves messages whose cluster position did not change', () => {
  const messages = convertEnvelopeBatch([
    envelope('text', {}, { messageId: 'one', messageSeq: 1 }),
    envelope('text', {}, { messageId: 'two', messageSeq: 2, timestamp: 1_767_225_610 }),
  ], { participants, meId: 'me' })
  assert.deepEqual(projectMessageGroups(messages), messages)
  assert.equal(projectMessageGroups(messages)[0], messages[0])
  assert.equal(projectMessageGroups(messages)[1], messages[1])
})


test('retired content protocols and forged run identities fail closed', () => {
  assert.throws(() => convertEnvelope({ ...envelope('text'), payload: { version: 1, kind: 'text', body: 'old' } as never }, { participants, meId: 'me' }))
  const payload = createNativeMessage({ id: 'run-r', role: 'assistant', content: [], custom: { runId: 'r', harness: { runId: 'r' }, refs: { agentId: 'other' } } })
  assert.throws(() => convertEnvelope({ ...envelope('text'), payload }, { participants, meId: 'me' }), /身份/)
})
