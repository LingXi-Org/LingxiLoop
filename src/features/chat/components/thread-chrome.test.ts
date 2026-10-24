import assert from 'node:assert/strict'
import test from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { createQuestionSelector, createThreadChromeSelector } from './thread-chrome'

const message = (id: string, role: 'user' | 'assistant' = 'assistant'): ThreadMessage => ({ id, role, createdAt: new Date(1), content: [{ type: 'text', text: id }], attachments: [], metadata: { custom: { schema: 'lingxiloop.thread-message.v2', clientMessageId: id, sequence: 1 } } }) as ThreadMessage

test('body deltas preserve chrome and row identities; receipts and branches still update', () => {
  const select = createThreadChromeSelector(message => message.id), a = message('a'), b = message('b')
  const initial = select([a,b]), delta = { ...b, content: [{ type: 'text', text: 'longer answer' }] } as ThreadMessage
  assert.equal(select([a,delta]), initial)
  const receipt = select([a,{ ...delta, metadata: { custom: { ...delta.metadata.custom, sequence: 2 } } } as ThreadMessage])
  assert.notEqual(receipt, initial); assert.equal(receipt.rows, initial.rows); assert.match(receipt.readReceiptKey, /2/)
  const branch = select([a,{ ...delta, metadata: { custom: { ...delta.metadata.custom, replyBranches: { index: 1 } } } } as ThreadMessage])
  assert.notEqual(branch.branchKey, initial.branchKey)
  const prepended = select([message('older'),a,b]); assert.deepEqual(prepended.rows.map(row => [row.key,row.index]), [['older',0],['a',1],['b',2]])
  const replaced = select([a,message('replacement')]); assert.equal(replaced.rows[1]!.key,'replacement')
})

test('first-message time and validity changes remain observable', () => {
  const select = createThreadChromeSelector(message => message.id), a=message('a'), initial=select([a])
  assert.notEqual(select([{ ...a, createdAt: new Date(2) }]), initial)
  assert.equal(select([{ ...a, metadata: { custom: { ...a.metadata.custom, timestampMissing: true } } } as ThreadMessage]).first?.timestampMissing,true)
})

test('unchanged user text is read once across assistant updates, while edits and attachments invalidate', () => {
  let reads=0;const user=message('u','user');Object.defineProperty(user,'content',{get(){reads++;return [{type:'text',text:'原始提问'}]}})
  const select=createQuestionSelector(), first=select([user,message('a')]);const firstReads=reads
  for(let i=0;i<240;i++)assert.equal(select([user,message(`answer${i}`)]),first)
  assert.equal(reads,firstReads)
  assert.equal(select([{...user,content:[{type:'text',text:'修订提问'}]} as ThreadMessage])[0]!.preview,'修订提问')
  assert.equal(select([{...user,role:'user',content:[],attachments:[{id:'file',type:'document',name:'资料.pdf',contentType:'application/pdf',status:{type:'complete'},content:[]}]} as ThreadMessage])[0]!.preview,'附件：资料.pdf')
})
