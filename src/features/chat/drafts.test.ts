import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readComposerDraft, saveComposerDraft } from './drafts'

test('drafts isolate tenant/account/course/thread, expire, clear and persist references without URLs or browser files', () => {
  const entries = new Map<string, string>()
  Object.assign(globalThis, { window: { localStorage: { getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value) } } })
  const scope = { companyId: 'tenant', userId: 'student', projectId: 'course', conversationId: 'room', threadRootId: 'thread' }
  const attachment = { id: 'attachments/tenant/a.png', name: 'a.png', contentType: 'image/png',
    status: { type: 'requires-action' }, apiAttachment: { key: 'attachments/tenant/a.png' }, file: 'PRIVATE', url: 'https://secret/?token=PRIVATE' }
  saveComposerDraft(scope, { text: '我的思路', attachments: [attachment] }, 100)
  assert.equal(readComposerDraft(scope, 101)?.text, '我的思路')
  assert.deepEqual(readComposerDraft(scope, 101)?.attachments, [{ id: attachment.id, name: 'a.png', contentType: 'image/png' }])
  assert.doesNotMatch([...entries.values()].join(''), /PRIVATE|token|apiAttachment/)
  for (const change of [{ companyId: 'other' }, { userId: 'teacher' }, { projectId: 'other' }, { threadRootId: null }]) {
    assert.equal(readComposerDraft({ ...scope, ...change }, 101), null)
  }
  assert.equal(readComposerDraft(scope, 100 + 8 * 86400000), null)
  saveComposerDraft(scope, { text: '', attachments: [] }, 200)
  assert.equal(readComposerDraft(scope, 201), null)
  for (const key of entries.keys()) entries.set(key, '{broken')
  saveComposerDraft(scope, { text: '损坏缓存后仍能保存', attachments: [] }, 202)
  assert.equal(readComposerDraft(scope, 203)?.text, '损坏缓存后仍能保存')
  assert.equal(readComposerDraft({ ...scope, kind: 'questionnaire' }, 203), null)
  Object.assign(window.localStorage, { getItem: () => { throw new Error('disabled') }, setItem: () => { throw new Error('quota') } })
  assert.equal(readComposerDraft(scope), null)
  assert.doesNotThrow(() => saveComposerDraft(scope, { text: 'x', attachments: [] }))
})
