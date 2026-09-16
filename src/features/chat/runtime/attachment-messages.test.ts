import assert from 'node:assert/strict'
import test from 'node:test'
import type { ApiAttachment } from '@/api/contracts'
import { attachmentMessages } from './attachment-messages'

test('all attachments are committed under unique nonces and only the final message carries the question and wakes the agent', () => {
  const files = ['a.txt','b.txt','c.txt'].map(name => ({ name, url: `https://files.invalid/${name}`, key: `attachments/company/${name}`,
    mime: 'text/plain', size: 10, kind: 'file' } as ApiAttachment & { key: string }))
  const messages = attachmentMessages(files,'Compare all three files.','thread',{ mentionedIds: ['agent'],mentionAll: false })
  assert.equal(new Set(messages.map(message => message.clientMsgNo)).size,3)
  assert.deepEqual(messages.map(message => [message.data?.name,message.body,message.data?.suppressAgentWake,message.replyToClientMsgNo]),
    [['a.txt','',true,'thread'],['b.txt','',true,'thread'],['c.txt','Compare all three files.',undefined,'thread']])
  assert.deepEqual(messages[2].data?.attachmentClientMsgNos,messages.map(message => message.clientMsgNo))
  assert.deepEqual(messages[2].data?.mentionedIds,['agent'])
  assert.deepEqual(attachmentMessages(files.slice(0,1),'',null,{ mentionedIds: [],mentionAll: false })[0].body,'')
  assert.throws(() => attachmentMessages(Array(21).fill(files[0]),'',null,{ mentionedIds: [],mentionAll: false }),/20/)
})
