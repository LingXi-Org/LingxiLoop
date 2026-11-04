import assert from 'node:assert/strict'
import { test } from 'node:test'
import { teacherReviewFindings, applyHomeworkReviewBoundary } from '../modules/learning/homework-validation.js'

test('674 explicit teacher grade criteria retain the boundary without model validation findings', () => {
  const criteria = ['独立完成子网计算', '教师依据四级量规确定最终评分档']
  const findings = teacherReviewFindings({ instructions: '由教师最终评定。', criteria, validation_findings: [] })
  const result = applyHomeworkReviewBoundary(criteria.map(criterion => ({ criterion, met: true, independent: true, feedback: '已达成优秀档' })), findings)
  assert.equal(result[0].met, true)
  assert.equal(result[1].met, false)
  assert.equal(result[1].independent, false)
  assert.equal(result[1].reviewRequired, true)
  assert.doesNotMatch(result[1].feedback, /已达成优秀档/)
})

test('674 teacher-only grades in instructions bind grading criteria without classifying ordinary computation as grading', () => {
  const criteria = ['计算结果正确', '评分等级达到优秀档']
  const findings = teacherReviewFindings({ instructions: '最终评分档由教师人工确定。', criteria, validation_findings: [] })
  assert.deepEqual(findings.map(item => item.original), [criteria[1]])
})
