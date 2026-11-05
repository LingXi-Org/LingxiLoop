import assert from 'node:assert/strict'
import test from 'node:test'
import { CommentDraftStore } from './comment-drafts'

test('closing and reopening keeps the pending submission and prevents a duplicate',()=>{
  const drafts=new CommentDraftStore()
  drafts.set('reply:thread','待发送回复')
  const ticket=drafts.begin('reply:thread','待发送回复')!
  assert.equal(drafts.pending('reply:thread'),true)
  assert.equal(drafts.get('reply:thread'),'待发送回复')
  assert.equal(drafts.begin('reply:thread','再次发送'),undefined)
  drafts.finish('reply:thread',ticket,true)
  assert.equal(drafts.size,0)
})

test('an old ACK cannot remove newer text or a later submission',()=>{
  const drafts=new CommentDraftStore(),key='reply:thread'
  drafts.set(key,'已提交的文字');const first=drafts.begin(key,'已提交的文字')!
  drafts.set(key,'后续输入');drafts.finish(key,first,true)
  assert.equal(drafts.get(key),'后续输入')
  assert.equal(drafts.pending(key),false)
  const second=drafts.begin(key,'后续输入')!
  drafts.finish(key,first,true)
  assert.equal(drafts.get(key),'后续输入');assert.equal(drafts.pending(key),true)
  drafts.finish(key,second,false)
  assert.equal(drafts.get(key),'后续输入');assert.equal(drafts.failed(key),true)
  drafts.delete(key);assert.equal(drafts.size,0)
})

test('a reopened thread also recognizes its pending edit or creation',()=>{
  const drafts=new CommentDraftStore()
  drafts.begin('edit:thread:message','编辑中的评论')
  assert.equal(drafts.pendingForThread('thread'),true)
  assert.equal(drafts.pendingForThread('other'),false)
  drafts.begin('new:anchor','新评论')
  assert.equal(drafts.pendingForThread('created','anchor'),true)
  assert.deepEqual(drafts.recovery()['new:anchor'].text,'新评论')
})
