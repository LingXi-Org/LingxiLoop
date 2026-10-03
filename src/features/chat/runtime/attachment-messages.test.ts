import assert from 'node:assert/strict'
import test from 'node:test'
import type { CompleteAttachment } from '@assistant-ui/react'
import type { ApiAttachment } from '@/api/contracts'
import { attachmentMessage, uploadedAttachment } from './attachment-messages'

test('one submission commits all attachments in order with one identity and one question', () => {
  const files = ['a.txt','b.txt','c.txt'].map(name => uploadedAttachment({ name, url: `https://files.invalid/${name}`, key: `attachments/company/${name}`,
    mime: 'text/plain', size: 10, kind: 'file' } as ApiAttachment & { key: string }) as CompleteAttachment)
  const message = attachmentMessage(files, 'Compare all three files.', 'thread', { mentionedIds: ['agent'], mentionAll: false })
  assert.ok(message.role === 'user')
  assert.deepEqual(message.attachments, files)
  assert.deepEqual(message.content, [{ type: 'text', text: 'Compare all three files.' }])
  assert.deepEqual(message.metadata.custom, { replyToClientMsgNo: 'thread', mentionedIds: ['agent'], mentionAll: false })
  assert.deepEqual(attachmentMessage(files.slice(0,1), '', null, { mentionedIds: [], mentionAll: false }).content, [])
  assert.throws(() => attachmentMessage(Array(21).fill(files[0]), '', null, { mentionedIds: [], mentionAll: false }), /20/)
})
