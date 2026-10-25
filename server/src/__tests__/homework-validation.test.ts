import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHomeworkValidation } from '../modules/learning/homework-validation.js'

const draft = { title: '三角形面积', instructions: '独立说明三角形与矩形的面积关系，并计算一个新例子。', criteria: ['进行十次对话。', '独立说明面积关系。'] }
const issue = { field: 'criteria', excerpt: '进行十次对话。', reason: '对话次数不能证明独立掌握。', suggestion: '改为独立解释面积关系，并计算一个新例子。' }

test('homework rejection identifies the actual field and preserves a concrete reason and next edit', () => {
  assert.deepEqual(parseHomeworkValidation({ valid: false, issues: [issue] }, draft), {
    status: 'INVALID', feedback: '验收标准第 1 条「进行十次对话。」：对话次数不能证明独立掌握。\n建议：改为独立解释面积关系，并计算一个新例子。',
  })
  assert.deepEqual(parseHomeworkValidation({ valid: true, feedback: '可以确认发布。' }, draft), { status: 'READY', feedback: '可以确认发布。' })
})

test('ambiguous or ungrounded homework denials cannot become confirmed input failures', () => {
  for (const result of [
    { valid: false, feedback: '无法验证作业要求或完整读取材料，请检查内容、提供可读取的文字材料后重试。' },
    { valid: false, issues: [] },
    { valid: false, issues: [{ ...issue, excerpt: '不存在的验收标准' }] },
    { valid: false, issues: [{ ...issue, field: 'instructions' }] },
    { valid: false, issues: [{ ...issue, suggestion: ' ' }] },
  ]) assert.throws(() => parseHomeworkValidation(result, draft))
})

test('an explicitly incomplete homework check stays retryable and does not relay a false material diagnosis', () => {
  const result = parseHomeworkValidation({ valid: null, feedback: '无法读取材料，请更换附件。' }, draft)
  assert.equal(result.status, 'ERROR')
  assert.match(result.feedback, /未能确认.*重新检查/)
  assert.doesNotMatch(result.feedback, /更换附件|要求需要修改/)
})
