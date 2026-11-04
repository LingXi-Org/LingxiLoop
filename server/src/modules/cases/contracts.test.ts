import assert from 'node:assert/strict'
import { test } from 'node:test'
import { caseContentSchema, caseOptionSchema } from './contracts.js'

test('case cover and college metadata is bounded and survives content validation', () => {
  const content = caseContentSchema.parse({ title: 'KV', coverText: ' KV ', coverColor: 'blue', college: ' 计算机学院 ' })
  assert.equal(content.coverText, 'KV')
  assert.equal(content.college, '计算机学院')
  for (const change of [{ coverColor: 'url(javascript:alert(1))' }, { coverText: 'x'.repeat(25) }, { college: 'x'.repeat(81) }]) {
    assert.equal(caseContentSchema.safeParse({ title: 'KV', ...change }).success, false)
  }
})

test('only named category and college options are accepted', () => {
  assert.deepEqual(caseOptionSchema.parse({ kind: 'category', name: ' 推理优化 ' }), { kind: 'category', name: '推理优化' })
  for (const input of [{ kind: 'college', name: ' ' }, { kind: 'role', name: 'TEACHER' }, { kind: 'category', name: 'x'.repeat(81) }]) {
    assert.equal(caseOptionSchema.safeParse(input).success, false)
  }
})
