import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { z as originalZ } from 'zod'

const calls = { activity: 0, segment: 0, missingActivity: 0, missingSegment: 0, failures: 0 }
const observed = <T extends { safeParse: (...args: never[]) => unknown; strict: (...args: never[]) => T }>(schema: T, kind: 'activity' | 'segment'): T => {
  const parse = schema.safeParse.bind(schema), strict = schema.strict.bind(schema)
  Object.assign(schema, {
    safeParse(value: unknown, ...options: unknown[]) {
      calls[kind]++
      if (value === undefined) calls[kind === 'activity' ? 'missingActivity' : 'missingSegment']++
      const result = parse(value as never, ...options as never[]) as { success: boolean }
      if (!result.success) calls.failures++
      return result
    },
    strict(...options: never[]) { return observed(strict(...options), kind) },
  })
  return schema
}
mock.module('zod', { namedExports: { z: new Proxy(originalZ, { get(target, key) {
  if (key !== 'object') return Reflect.get(target, key)
  return (shape: Parameters<typeof originalZ.object>[0]) => {
    const schema = originalZ.object(shape)
    if (shape && 'purpose' in shape && 'kind' in shape && 'label' in shape) return observed(schema as never, 'activity')
    if (shape && 'segmentId' in shape && 'partId' in shape && 'start' in shape) return observed(schema as never, 'segment')
    return schema
  }
} }) } })
const { activityAnnotation } = await import('./runActivity.js')
const { answerSegment } = await import('./answerSegment.js')
const text = '学生自己的推导'
const part = (activity?: unknown, answerSegment?: unknown) => ({ type: 'text', text, providerMetadata: { lingxiloop: { activity, answerSegment } } })

test('ordinary missing optional metadata returns without schema failure allocation', () => {
  const missing = [{ type: 'text', text }, { type: 'text', text, providerMetadata: {} }, part()]
  const started = performance.now()
  for (let i = 0; i < 1000; i++) for (const value of missing) {
    assert.equal(activityAnnotation(value), undefined)
    assert.equal(answerSegment(value), undefined)
  }
  console.log('OPTIONAL_METADATA_MISSING_COST', JSON.stringify({ iterations: 3000, elapsedMs: performance.now() - started, ...calls }))
  assert.equal(calls.missingActivity, 0)
  assert.equal(calls.missingSegment, 0)
  assert.equal(calls.failures, 0)
})

test('present null/malformed values keep their schema path, while valid metadata and segment bounds keep the same outputs', () => {
  const before = { activity: calls.activity, segment: calls.segment }
  for (const value of [null, false, 'malformed', {}, { version: 99 }]) {
    assert.equal(activityAnnotation(part(value)), undefined)
    assert.equal(answerSegment(part(undefined, value)), undefined)
  }
  assert.equal(calls.activity - before.activity, 5)
  assert.equal(calls.segment - before.segment, 5)
  const activity = { version: 1, id: 'answer', kind: 'answer', label: '正文', purpose: 'result' }
  const segment = { version: 3, messageId: 'message', segmentId: 'segment', partId: 'part', start: 7, end: 7 + text.length }
  assert.deepEqual(activityAnnotation(part(activity)), activity)
  assert.deepEqual(answerSegment(part(undefined, segment)), segment)
  for (const invalid of [{ ...segment, end: segment.end + 1 }, { ...segment, start: -1 }, { ...segment, extra: true }, { ...segment, version: 2 }]) {
    assert.equal(answerSegment(part(undefined, invalid)), undefined)
  }
  assert.equal(activityAnnotation(part({ ...activity, kind: 'private-reasoning' })), undefined)
  assert.equal(activityAnnotation(part({ ...activity, extra: true })), undefined)
})
