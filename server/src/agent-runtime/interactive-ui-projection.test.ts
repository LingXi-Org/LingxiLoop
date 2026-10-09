import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, userMessageSchema } from '../../../src/lib/nativeMessage.js'
import { OPENUI_LANGUAGE } from '../../../src/lib/interactive-ui/catalog.js'
import { projectLessonText, messageLessons, assertLessonCitationSpans } from './interactive-ui-projection.js'
import { runMessageParts } from './message-projection.js'

// Failures: raw DSL flashes, unclosed final source, forged metadata, lost surrounding text,
// unstable identity across previews, unsupported versions, citations crossing an embedded UI.
const source = 'root = Lesson("对比", "两者有共同点和区别。", [Text("观察异同")])'
const fenced = (value = source) => `前文\n\n\`\`\`${OPENUI_LANGUAGE}\n${value}\n\`\`\`\n\n后文`
test('projection keeps prose, binds a canonical source and preserves preview identity', () => {
  const parts = projectLessonText(fenced(), 'run', false)
  const message = createNativeMessage({ id: 'run-run', role: 'assistant', content: parts })
  const [lesson] = messageLessons(message)
  assert.equal(lesson.source, source)
  assert.equal(lesson.messageId, message.id)
  assert.equal(lesson.phase, 'ready')
  assert.equal(lesson.sourceHash.length, 64)
  assert.deepEqual(parts.filter(part => part.type === 'text').map(part => part.text), ['前文\n\n', '\n\n后文'])
  const preview = createNativeMessage({ id: 'run-run', role: 'assistant', content: projectLessonText(fenced(), 'run', true) })
  assert.equal(messageLessons(preview)[0].uiId, lesson.uiId)
  assert.equal(messageLessons(preview)[0].phase, 'preview')
})
test('draft/final malformed blocks fall back locally without exposing source', () => {
  for (const [body, preview] of [[fenced('root = Unknown("bad")'), false], [`before\n\`\`\`${OPENUI_LANGUAGE}\nroot = Lesson(`, true], [`\`\`\`${OPENUI_LANGUAGE}\n${source}`, false]] as const) {
    const parts = projectLessonText(body, 'run', preview)
    assert.ok(!JSON.stringify(parts).includes('root ='))
    assert.ok(parts.every(part => part.type === 'text'))
  }
  const view = { ...createRunView('run'), lifecycle: 'leased' as const, draft: fenced() }
  assert.ok(runMessageParts(view).some(part => part.type === 'generative-ui'))
  assert.deepEqual(projectLessonText('只用一句话回答。', 'run', false), [{ type: 'text', text: '只用一句话回答。' }])
})
test('citation source offsets cannot cross or enter a UI block', () => {
  assert.doesNotThrow(() => assertLessonCitationSpans(fenced(), [{ start: 0, end: 2 }]))
  assert.throws(() => assertLessonCitationSpans(fenced(), [{ start: 0, end: 50 }]), /citation/)
})
test('human UI events are bounded and reject identity/authority injection', () => {
  const uiInteraction = { uiId: 'ui', messageId: 'run-run', revision: 1, sourceHash: 'a'.repeat(64), actionId: 'explain', kind: 'explain', idempotencyKey: 'once', state: {} }
  const human = createNativeMessage({ id: 'human', role: 'user', content: [{ type: 'text', text: '解释' }], custom: { uiInteraction } })
  assert.ok(userMessageSchema.safeParse(human).success)
  for (const added of [{ userId: 'other' }, { state: { value: {} } }, { revision: 0 }, { action: 'teacher.approve' }]) {
    assert.equal(userMessageSchema.safeParse({ ...human, metadata: { custom: { uiInteraction: { ...uiInteraction, ...added } } } }).success, false)
  }
})
