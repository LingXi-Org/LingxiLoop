import assert from 'node:assert/strict'
import test from 'node:test'
import { createNativeMessage, decodeNativeMessage, nativeMessageSchema } from './nativeMessage'

test('history omits unsupported data cards without losing adjacent text, attachments or nested messages', () => {
  const child = createNativeMessage({ id: 'child', role: 'assistant', content: [{ type: 'text', text: 'child answer' }] })
  const current = createNativeMessage({ id: 'mixed', role: 'assistant', content: [
    { type: 'text', text: 'kept answer' },
    { type: 'file', data: '/api/files?key=attachments/slides.pptx', sourceType: 'url', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    { type: 'tool-call', toolCallId: 'tool', toolName: 'chat.send', args: {}, argsText: '{}', messages: [child as never] },
  ] })
  const original = structuredClone(current)
  const retired = { type: 'data', name: 'presentation-artifact', data: { artifactId: 'gone', title: 'old deck' } }
  const stored = { ...current, content: [retired, ...current.content, { type: 'data', name: 'future-unknown-card', data: {} }] }
  const tool = stored.content[3] as { messages: unknown[] }
  tool.messages = [{ ...child, content: [retired, ...child.content] }]
  assert.equal(nativeMessageSchema.safeParse(stored).success, false, 'retired cards cannot be written')
  const decoded = decodeNativeMessage(stored)
  assert.deepEqual(decoded.message, original)
  assert.equal(decoded.display.content.length, 3)
  assert.deepEqual(stored.content[0], retired, 'decode never mutates source history')
})

test('old IM artifact metadata excludes sources whose product authorizer is retired', () => {
  const message = createNativeMessage({ id: 'old-run', role: 'assistant', content: [{ type: 'text', text: 'shared answer' }],
    custom: { harness: { artifacts: [{ path: 'files/lesson.pptx', sha256: 'a'.repeat(64) },
      { path: 'documents/lesson.md', source: { ref: 'document:lesson' } }] } } })
  const expected = structuredClone(message)
  const harness = message.metadata.custom.harness as { artifacts: unknown[] }
  harness.artifacts.push({ path: 'presentations/old.html', source: { ref: 'presentation:old' } })
  assert.deepEqual(decodeNativeMessage(message).message, expected)
})
