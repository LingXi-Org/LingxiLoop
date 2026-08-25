import assert from 'node:assert/strict'
import test from 'node:test'
import { withoutInlineKnowledgeCitations } from './knowledgeCitations'

test('validated inline citation markers are removed from message prose', () => {
  assert.equal(
    withoutInlineKnowledgeCitations('结论来自资料 [S1]，并由另一段支持 [S2][S1]。', [{ marker: 'S1' }, { marker: 'S2' }]),
    '结论来自资料，并由另一段支持。',
  )
})

test('unvalidated marker-like text stays visible', () => {
  assert.equal(
    withoutInlineKnowledgeCitations('保留 [S2]，移除 [S1]。', [{ marker: 'S1' }]),
    '保留 [S2]，移除。',
  )
})

test('messages without citation metadata are unchanged', () => {
  const body = '数组下标示例 [S1]'
  assert.equal(withoutInlineKnowledgeCitations(body), body)
})
