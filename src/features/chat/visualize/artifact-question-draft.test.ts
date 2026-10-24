import assert from 'node:assert/strict'
import test from 'node:test'
import { artifactQuestionScope } from './artifact-question-draft'
import { readComposerDraft, saveComposerDraft } from '../drafts'

test('artifact question cache follows actual account/course/source scope and clears only its own receipt', () => {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value),
  } } })
  try {
    const target = { workspaceIdentity: 'company', workspacePath: 'course', sessionId: 'conversation', path: '/topology.html', instanceKey: 'instance', sourceMessageId: 'source' }
    const scope = artifactQuestionScope(target, 'company', 'student')
    saveComposerDraft(scope, { text: '我认为是 /27，请提示下一步。', attachments: [] }, 1000)
    assert.equal(readComposerDraft(scope, 1001)?.text, '我认为是 /27，请提示下一步。')
    for (const other of [artifactQuestionScope(target, 'company', 'other'), artifactQuestionScope(target, 'other-company', 'student'),
      artifactQuestionScope({ ...target, workspaceIdentity: 'other-company' }, 'other-company', 'student'),
      artifactQuestionScope({ ...target, workspacePath: 'other-course' }, 'company', 'student'),
      artifactQuestionScope({ ...target, sessionId: 'other-conversation' }, 'company', 'student'),
      artifactQuestionScope({ ...target, sourceMessageId: 'other-source' }, 'company', 'student'),
      artifactQuestionScope({ ...target, instanceKey: 'other-instance' }, 'company', 'student'),
      artifactQuestionScope({ ...target, path: '/other.html' }, 'company', 'student'), artifactQuestionScope(target, 'company', null)]) {
      assert.equal(readComposerDraft(other, 1001), null)
    }
    saveComposerDraft(scope, { text: '', attachments: [] }, 1002)
    assert.equal(readComposerDraft(scope, 1003), null)
  } finally { Reflect.deleteProperty(globalThis, 'window') }
})
