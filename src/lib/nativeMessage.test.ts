import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { deserializeMessage, serializeMessage, nativeMessageSchema, userMessageSchema } from './nativeMessage'

// Failure cases: lost fields/order, nested dates, executable UI props, unknown parts,
// legacy payload acceptance, forged assistant input, duplicate/too many attachments.
test('native messages survive JSON and nested-message replay without losing content or metadata', () => {
  const child: ThreadMessage = { id: 'child', role: 'user', createdAt: new Date(0), content: [{ type: 'text', text: 'child' }], attachments: [], metadata: { custom: {} } }
  const message: ThreadMessage = { id: 'reply', role: 'assistant', createdAt: new Date('2026-10-02T00:00:00Z'),
    content: [
      { type: 'text', text: 'answer', status: { type: 'complete' }, providerMetadata: { provider: { id: 'a' } } },
      { type: 'reasoning', text: 'public summary', unstable_summary: 'summary' },
      { type: 'source', sourceType: 'url', id: 'url', url: 'https://example.com', title: 'URL' },
      { type: 'source', sourceType: 'document', id: 'doc', title: 'Document', mediaType: 'application/pdf', filename: 'doc.pdf' },
      { type: 'image', image: 'https://example.com/image.png', filename: 'image.png' },
      { type: 'file', data: 'https://example.com/audio.mp3', sourceType: 'url', mimeType: 'audio/mpeg', filename: 'audio.mp3' },
      { type: 'data', name: 'citation-claims', data: { claims: [] } },
      { type: 'generative-ui', id: 'card', spec: { root: { component: 'Card', children: ['hello'] } } },
      { type: 'tool-call', toolCallId: 'call', toolName: 'calendar.get', args: { eventId: 'event' }, argsText: '{"eventId":"event"}',
        result: { status: 'completed' }, artifact: { id: 'artifact' }, isError: false, parentId: 'parent', messages: [child],
        timing: { startedAt: 10, completedAt: 20 }, providerMetadata: { provider: { trace: 'display-only' } },
        mcp: { app: { resourceUri: 'ui://fixture/card', mimeType: 'text/html', visibility: ['app'], serverId: 'fixture' } },
        modelContent: [{ type: 'text', text: 'model result' }, { type: 'file', data: 'aGVsbG8=', mediaType: 'text/plain', filename: 'model.txt' }],
        approval: { id: 'approval', approved: false, reason: 'declined', isAutomatic: false, optionId: 'deny',
          options: [{ id: 'deny', kind: 'deny-once', label: '拒绝一次', grants: [], confirm: { title: '确认' } }] }, interrupt: { type: 'human', payload: { prompt: 'confirm' } } },
    ], status: { type: 'complete', reason: 'stop' }, metadata: { unstable_state: null, unstable_data: [], unstable_annotations: [],
      steps: [{ messageId: 'step', usage: { inputTokens: 10, outputTokens: 20 } }], custom: { runId: 'run' },
      timing: { streamStartTime: 1, firstTokenTime: 2, totalStreamTime: 20, tokenCount: 10, tokensPerSecond: 500, totalChunks: 2, toolCallCount: 1 },
      submittedFeedback: { type: 'positive' }, isOptimistic: false } }
  assert.deepEqual(deserializeMessage(JSON.parse(JSON.stringify(serializeMessage(message)))), message)
})

test('native protocol rejects legacy messages, unsupported parts and executable component trees', () => {
  const message = { id: 'message', role: 'assistant', createdAt: new Date(0).toISOString(), content: [], status: { type: 'complete', reason: 'stop' },
    metadata: { unstable_state: null, unstable_data: [], unstable_annotations: [], steps: [], custom: {} } }
  assert.equal(nativeMessageSchema.safeParse({ version: 1, kind: 'text', clientMsgNo: 'old', body: 'old' }).success, false)
  for (const part of [{ type: 'unknown' }, { type: 'audio', audio: { data: '', format: 'mp3' } },
    { type: 'generative-ui', spec: { root: { component: 'script', props: { children: 'alert(1)' } } } },
    { type: 'generative-ui', spec: { root: { component: 'Card', props: { dangerouslySetInnerHTML: { __html: 'bad' } } } } }]) {
    assert.equal(nativeMessageSchema.safeParse({ ...message, content: [part] }).success, false)
  }
  assert.equal(userMessageSchema.safeParse(message).success, false)
})

test('one user message carries all attachments exactly once and rejects forged routing', () => {
  const attachment = (id: string) => ({ id, type: 'document', name: id, contentType: 'text/plain', status: { type: 'complete' },
    content: [{ type: 'file', data: id, sourceType: 'id', filename: id, mimeType: 'text/plain' }] })
  const message = { id: 'user', role: 'user', createdAt: new Date(0).toISOString(), content: [{ type: 'text', text: 'read both' }],
    attachments: [attachment('one'), attachment('two')], metadata: { custom: {} } }
  assert.deepEqual(userMessageSchema.parse(message), message)
  assert.equal(userMessageSchema.safeParse({ ...message, attachments: [attachment('one'), attachment('one')] }).success, false)
  assert.equal(userMessageSchema.safeParse({ ...message, attachments: Array.from({ length: 21 }, (_, i) => attachment(String(i))) }).success, false)
  assert.equal(userMessageSchema.safeParse({ ...message, metadata: { custom: { suppressAgentWake: true, refs: { agentId: 'forged' } } } }).success, false)
})
