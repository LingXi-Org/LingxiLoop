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

test('519: wording and manual review findings do not block, but grounded contradictions still do', () => {
  const network = { title: '子网', instructions: '6 个小问共 7 个空。/22 子网可分配的主机地址数是多少？', criteria: ['主机数为 1022，即 2^(32-22)-2。', '解释设计方案的取舍。'] }
  const advisory = { field: 'criteria', excerpt: '主机数为 1022', reason: '可以补充各空编号，主机数与公式一致。', suggestion: '保持主机数口径。', severity: 'suggestion' }
  const manual = { field: 'criteria', excerpt: '解释设计方案的取舍。', reason: '方案价值需要教师判断。', suggestion: '提供比较依据。', severity: 'teacher_review', replacement: '比较两种设计，列出约束、计算过程及取舍依据。', observableEvidence: '两种设计与计算过程', teacherReview: '取舍的教学价值', instructionChange: '' }
  const parsed = parseHomeworkValidation({ valid: false, issues: [advisory, manual] }, network)
  assert.equal(parsed.status, 'READY')
  assert.equal(parsed.findings?.[1].criterionIndex, 1)
  assert.equal(parsed.findings?.[1].original, network.criteria[1])
  assert.equal(network.criteria[1], '解释设计方案的取舍。')
  assert.equal(parseHomeworkValidation({ valid: false, issues: [{ ...advisory, severity: 'blocker', reason: '主机数不应写为地址总数 1024。' }] }, network).status, 'INVALID')
})

test('519: alternatives must be grounded, complete and unambiguous', () => {
  for (const patch of [
    { replacement: '新标准', observableEvidence: '' },
    { replacement: '新标准', observableEvidence: '推导', teacherReview: '', instructionChange: '' },
    { excerpt: '不存在', severity: 'suggestion' },
  ]) assert.throws(() => parseHomeworkValidation({ valid: false, issues: [{ ...issue, ...patch }] }, draft))
  assert.throws(() => parseHomeworkValidation({ valid: false, issues: [issue] }, { ...draft, criteria: [issue.excerpt, `${issue.excerpt}再解释`] }))
})

test('519: teacher-only criteria cannot be promoted to automated mastery by a model response', async () => {
  const { applyHomeworkReviewBoundary } = await import('../modules/learning/homework-validation.js')
  const findings = parseHomeworkValidation({ valid: false, issues: [{ ...issue, severity: 'teacher_review' }] }, draft).findings!
  const result = applyHomeworkReviewBoundary(draft.criteria.map(criterion => ({ criterion, met: true, independent: true, feedback: '模型称已达标' })), findings)
  assert.equal(result[0].met, false)
  assert.equal(result[0].independent, false)
  assert.match(result[0].feedback, /需要教师复核/)
  assert.equal(result[1].met, true)
})
