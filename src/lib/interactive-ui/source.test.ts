import assert from 'node:assert/strict'
import test from 'node:test'
import { extractLessonBlocks, parseLessonSource, restoreLessonState, validateLessonState } from './source.js'

const source = `$angle = 45
$prediction = ""
root = Lesson("抛射运动", "角度改变轨迹。", [control,plot,prediction,explain])
control = Parameter("angle", "角度", $angle, 0, 90, 1, "°", "projectile.angle")
plot = ProjectilePlot($angle, 20, 9.81, 0)
prediction = Prediction("prediction", "先预测结果", $prediction)
explain = LearningAction("explain", "explain", "解释当前结果")`

test('upstream parser produces a validated composable lesson and bounded state/action contracts', () => {
  const lesson = parseLessonSource(source)
  assert.equal(lesson.fallback, '角度改变轨迹。')
  assert.deepEqual(lesson.actions, [{ id: 'explain', kind: 'explain', label: '解释当前结果' }])
  assert.deepEqual(lesson.defaults, { $angle: 45, $prediction: '' })
  assert.deepEqual(validateLessonState(lesson, { $angle: 60, $prediction: '更远' }), { $angle: 60, $prediction: '更远' })
  assert.throws(() => validateLessonState(lesson, { $angle: 100, $prediction: '' }))
  assert.throws(() => validateLessonState(lesson, { $angle: 45, $prediction: '', $forged: true }))
  assert.throws(() => validateLessonState(lesson, { $angle: Number.NaN, $prediction: '' }))
})

test('partial upstream parsing permits safe preview but final parsing never accepts autoclosure', () => {
  const partial = source.slice(0, -3)
  assert.doesNotThrow(() => parseLessonSource(partial, { preview: true }))
  assert.throws(() => parseLessonSource(partial))
  for (const invalid of [source.replace('ProjectilePlot', 'Malicious'), source + '\nunknown = Text("orphan")',
    source.replace('control,plot', 'missing,plot'), source + '\ndata = Query("fetch", {})',
    source.replace('20, 9.81', '20 / 0, 9.81'), source + '\n$angle = 90', source + '\ngarbage',
    source.replace('$angle = 45', '$angle = 1e309')]) assert.throws(() => parseLessonSource(invalid))
  assert.throws(() => parseLessonSource('a'.repeat(40_000)))
  assert.throws(() => parseLessonSource('root = Lesson("x","x",' + '['.repeat(100) + '1' + ']'.repeat(100) + ')'))
})

test('only top-level exact fenced blocks enter the UI channel; ordinary examples remain text', () => {
  const body = '说明\n\n```lingxiloop-openui-v1\n' + source + '\n```\n\n结论'
  const blocks = extractLessonBlocks(body)
  assert.equal(blocks.length, 1)
  assert.equal(blocks[0].source, source)
  assert.equal(blocks[0].closed, true)
  assert.equal(body.slice(blocks[0].start, blocks[0].end).startsWith('```lingxiloop-openui-v1'), true)
  assert.equal(extractLessonBlocks('````markdown\n' + body + '\n````').length, 0)
  assert.equal(extractLessonBlocks(body.split('\n').map(line => '> ' + line).join('\n')).length, 0)
  assert.equal(extractLessonBlocks('```js\n' + source + '\n```').length, 0)
  assert.equal(extractLessonBlocks('```lingxiloop-openui-v1\n' + source)[0].closed, false)
})

test('revision hydration retains only compatible controls and never silently clamps values', () => {
  const before = parseLessonSource(source)
  const compatible = parseLessonSource(source.replace('角度改变轨迹。', '比较同一角度的轨迹。'))
  assert.deepEqual(restoreLessonState(before.fields, compatible, { $angle: 60, $prediction: '更远' }), {
    state: { $angle: 60, $prediction: '更远' }, resetKeys: [],
  })
  const changed = parseLessonSource(source.replace('90, 1, "°"', '50, 1, "°"'))
  assert.deepEqual(restoreLessonState(before.fields, changed, { $angle: 60, $prediction: '更远' }), {
    state: { $angle: 45, $prediction: '更远' }, resetKeys: ['$angle'],
  })
})

test('moving a state binding between polynomial coefficients resets its computational meaning', () => {
  const initial = '$a = 1\nroot = Lesson("函数", "比较函数。", [p,g])\np = Parameter("a", "系数", $a, 0, 5, 1, "", "coefficient")\ng = FunctionPlot([{id:"f",a:$a,b:0,c:0}],[-5,5])'
  const before = parseLessonSource(initial)
  const changed = parseLessonSource(initial.replace('a:$a,b:0,c:0', 'a:0,b:0,c:$a'))
  assert.deepEqual(restoreLessonState(before.fields, changed, { $a: 4 }), { state: { $a: 1 }, resetKeys: ['$a'] })
})

test('a changed prediction question does not restore an answer to the old question', () => {
  const before = parseLessonSource(source)
  const changed = parseLessonSource(source.replace('先预测结果', '预测初速度翻倍后的射程'))
  assert.deepEqual(restoreLessonState(before.fields, changed, { $angle: 60, $prediction: '更远' }), {
    state: { $angle: 60, $prediction: '' }, resetKeys: ['$prediction'],
  })
})

test('repeated reference expansion is bounded before upstream tree materialization', () => {
  const repeated = ['root = Lesson("x", "x", [a3])', 'a0 = Text("leaf")',
    ...Array.from({ length: 3 }, (_, index) => `a${index + 1} = Layout([${Array(16).fill(`a${index}`).join(',')}])`)].join('\n')
  for (const preview of [false, true]) assert.throws(() => parseLessonSource(repeated, { preview }), /expansion-budget/)
})
