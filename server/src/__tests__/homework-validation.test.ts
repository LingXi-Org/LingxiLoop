import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyHomeworkReviewBoundary, parseHomeworkValidation } from '../modules/learning/homework-validation.js'

const draft = { title: '比较网络方案', instructions: '比较两种网络方案，说明你的选择及理由。', criteria: ['说明方案的优点和取舍。'] }
const issue = { field: 'criteria', excerpt: draft.criteria[0], reason: '取舍需要教师结合教学目标判断。', suggestion: '可补充比较依据，由教师复核。' }

test('558 missing severity retains an actionable teacher review instead of inventing a blocker', () => {
  const result = parseHomeworkValidation({ valid: false, issues: [issue] }, draft)
  assert.equal(result.status, 'READY')
  assert.equal(result.findings?.[0].severity, 'teacher_review')
  assert.equal(result.findings?.[0].original, draft.criteria[0])
  const criteria = applyHomeworkReviewBoundary([{ criterion: draft.criteria[0], met: true, independent: true, feedback: '已说明取舍' }], result.findings!)
  assert.equal(criteria[0].reviewRequired, true)
  assert.equal(criteria[0].met, false)
  assert.deepEqual(draft.criteria, ['说明方案的优点和取舍。'])
})

test('558 unclassified wording and unsupported blocker labels remain nonblocking findings', () => {
  for (const severity of [undefined, 'blocker']) {
    const result = parseHomeworkValidation({ valid: false, issues: [{ field: 'instructions', excerpt: draft.instructions,
      reason: '建议分点描述并补充评分细则。', suggestion: '可按比较、选择、理由分点描述。', ...(severity ? { severity } : {}) }] }, draft)
    assert.equal(result.status, 'READY')
    assert.equal(result.findings?.[0].severity, 'suggestion')
  }
  const manual = parseHomeworkValidation({ valid: false, issues: [{ ...issue, severity: 'blocker' }] }, draft)
  assert.equal(manual.status, 'READY')
  assert.equal(manual.findings?.[0].severity, 'teacher_review')
})

test('558 a grounded contradiction still blocks with the exact conflicting requirement', () => {
  const network = { title: '子网', instructions: '/22 子网可分配主机数为 1022，请解释计算过程。', criteria: ['可分配主机数为 1024。'] }
  const result = parseHomeworkValidation({ valid: false, issues: [{ field: 'criteria', excerpt: network.criteria[0],
    severity: 'blocker', blockingReason: 'contradiction', conflictingExcerpt: '可分配主机数为 1022',
    reason: '正文要求 1022，与标准中的 1024 不一致。', suggestion: '将标准中的 1024 改为 1022。' }] }, network)
  assert.equal(result.status, 'INVALID')
  assert.equal(result.findings?.[0].severity, 'blocker')
  assert.match(result.feedback, /1022.*1024/)
})

test('558 missing essential task content still blocks while malformed contradiction evidence is a service error', () => {
  const incomplete = { ...draft, instructions: '请回答下列题目。' }
  assert.equal(parseHomeworkValidation({ valid: false, issues: [{ field: 'instructions', excerpt: incomplete.instructions,
    severity: 'blocker', blockingReason: 'missing_essential_content', reason: '要求回答下列题目，但正文和所附资料没有提供题目。', suggestion: '补上需要回答的题目。' }] }, incomplete).status, 'INVALID')
  for (const conflictingExcerpt of [undefined, draft.criteria[0], '不存在的要求']) {
    assert.throws(() => parseHomeworkValidation({ valid: false, issues: [{ ...issue, severity: 'blocker', blockingReason: 'contradiction', conflictingExcerpt }] }, draft))
  }
})

test('558 contradictory material excerpts must come from supplied readable materials', () => {
  const result = parseHomeworkValidation({ valid: false, issues: [{ ...issue, severity: 'blocker', blockingReason: 'contradiction',
    conflictingExcerpt: '本题只允许比较一种方案', reason: '附件要求一种，正文要求两种。', suggestion: '统一比较范围。' }] }, draft,
  [{ text: '本题只允许比较一种方案', source: 'synthetic.txt', hash: 'synthetic' }])
  assert.equal(result.status, 'INVALID')
})

test('558 uncertain model checks and ungrounded findings never become confirmed content failures', () => {
  assert.equal(parseHomeworkValidation({ valid: null, feedback: '无法判断。' }, draft).status, 'ERROR')
  assert.throws(() => parseHomeworkValidation({ valid: false, issues: [{ ...issue, excerpt: '不在原稿中' }] }, draft))
})

test('558 ready model responses retain nonblocking teacher-review findings', () => {
  const result = parseHomeworkValidation({ valid: true, feedback: '可发布，最终判断由教师完成。', issues: [{ ...issue, severity: 'teacher_review' }] }, draft)
  assert.equal(result.status, 'READY')
  assert.equal(result.findings?.[0].severity, 'teacher_review')
  assert.equal(result.findings?.[0].original, draft.criteria[0])
})
