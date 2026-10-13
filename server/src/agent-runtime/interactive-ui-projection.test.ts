import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, userMessageSchema } from '../../../src/lib/nativeMessage.js'
import { OPENUI_LANGUAGE } from '../../../src/lib/interactive-ui/catalog.js'
import { projectLessonText, messageLessons, assertLessonCitationSpans, verifyLessonCandidate } from './interactive-ui-projection.js'
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
// Live generation can omit fences entirely, or stream its defaults before the root.
test('unfenced lesson candidates stay private until the runtime repairs the boundary', () => {
  for (const body of [source, '$angle = 45', 'plot = ProjectilePlot($angle, 20, 9.81, 0)', `$angle = 45\n${source}`,
    `\`\`\`\n${source}\n\`\`\``, `\`\`\`openui-lang\n${source}\n\`\`\``, `    ${source}`,
    `前文\n\n$angle = 45\n${source}\n\n后文`]) {
    const checks = verifyLessonCandidate(body)
    assert.equal(checks.length, 1)
    assert.equal(checks[0].status, 'failed')
    assert.match(JSON.stringify(checks), /fence/)
    for (const preview of [true, false]) {
      const parts = projectLessonText(body, 'run', preview)
      assert.ok(parts.every(part => part.type === 'text'))
      assert.doesNotMatch(JSON.stringify(parts), /root =|\$angle|ProjectilePlot/)
    }
  }
  for (const example of [`\`\`\`js\n${source}\n\`\`\``, `> ${source}`, `写法示例：\`${source}\``, `\`example\n${source}\n\``, '$x = 45$', 'root = sqrt(4)']) {
    assert.deepEqual(verifyLessonCandidate(example), [])
    assert.deepEqual(projectLessonText(example, 'run', true), [{ type: 'text', text: example }])
  }
  for (const partial of ['$', '$angle', '$angle ', '$angle = ', '$answer = "']) {
    assert.deepEqual(projectLessonText(partial, 'run', true), [{ type: 'text', text: '正在生成交互讲解…' }])
  }
})
test('citation source offsets cannot cross or enter a UI block', () => {
  assert.doesNotThrow(() => assertLessonCitationSpans(fenced(), [{ start: 0, end: 2 }]))
  assert.throws(() => assertLessonCitationSpans(fenced(), [{ start: 0, end: 50 }]), /citation/)
})
test('candidate validation reports bounded errors without source and preserves ordinary examples', () => {
  assert.deepEqual(verifyLessonCandidate('普通回答'), [])
  assert.deepEqual(verifyLessonCandidate('```js\nroot = Lesson("example")\n```'), [])
  assert.equal(verifyLessonCandidate(fenced())[0].status, 'passed')
  const failed = verifyLessonCandidate(fenced('root = Lesson("PRIVATE", "PRIVATE", [p,q])\np = Prediction("prediction", "PRIVATE", $prediction)\nq = Prediction("answer", "PRIVATE", $answer)'))
  assert.equal(failed[0].status, 'failed')
  assert.match(JSON.stringify(failed), /interactive-ui:unbound-state/)
  assert.match(JSON.stringify(failed), /Declare literal defaults for.*\$prediction.*\$answer/)
  assert.doesNotMatch(JSON.stringify(failed), /PRIVATE|root =/)
  // A model cannot repair a rejected default from a generic component error.
  const choice = verifyLessonCandidate(fenced('$answer = ""\nroot = Lesson("PRIVATE", "PRIVATE", [c])\nc = Choice("answer", "PRIVATE", $answer, ["one", "two"])'))
  assert.match(JSON.stringify(choice), /Choice.*default.*exactly.*options/)
  assert.doesNotMatch(JSON.stringify(choice), /PRIVATE|root =/)
  const props = verifyLessonCandidate(fenced('root = Lesson("PRIVATE", "PRIVATE", [Text("PRIVATE")], null, 0)'))
  assert.match(JSON.stringify(props), /Lesson\.revisionOf.*Lesson\.baseRevision/)
  assert.match(JSON.stringify(props), /Omit optional/)
  assert.doesNotMatch(JSON.stringify(props), /PRIVATE|root =/)
  assert.equal(verifyLessonCandidate(`\`\`\`${OPENUI_LANGUAGE}\n${source}`)[0].status, 'failed')
  assert.equal(verifyLessonCandidate(Array(5).fill(fenced()).join('\n\n')).at(-1)?.status, 'failed')
})
test('human UI events are bounded and reject identity/authority injection', () => {
  const uiInteraction = { uiId: 'ui', messageId: 'run-run', revision: 1, sourceHash: 'a'.repeat(64), actionId: 'explain', kind: 'explain', idempotencyKey: 'once', state: {} }
  const human = createNativeMessage({ id: 'human', role: 'user', content: [{ type: 'text', text: '解释' }], custom: { uiInteraction } })
  assert.ok(userMessageSchema.safeParse(human).success)
  for (const added of [{ userId: 'other' }, { state: { value: {} } }, { revision: 0 }, { action: 'teacher.approve' }]) {
    assert.equal(userMessageSchema.safeParse({ ...human, metadata: { custom: { uiInteraction: { ...uiInteraction, ...added } } } }).success, false)
  }
})
