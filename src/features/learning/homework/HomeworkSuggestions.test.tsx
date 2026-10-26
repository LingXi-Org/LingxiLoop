import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import { HomeworkSuggestions } from './HomeworkSuggestions'
import type { HomeworkValidationFinding } from './contracts'

const finding: HomeworkValidationFinding = { field: 'criteria', severity: 'teacher_review', criterionIndex: 0, original: '解释方案价值。', excerpt: '解释方案价值。', reason: '价值需教师判断。', suggestion: '提供方案比较。', replacement: '比较两种方案，列出约束和取舍依据。', observableEvidence: '计算与比较过程', teacherReview: '教学价值', instructionChange: '正文同步补充比较的场景。' }

test('519: proposals expose original, editable alternative, evidence and coordinated task edits without applying them', () => {
  let calls = 0
  const $ = load(renderToStaticMarkup(<HomeworkSuggestions findings={[finding]} criteria={[finding.original]} busy={false} onApply={() => { calls++ }} />))
  assert.match($.text(), /原文：解释方案价值/)
  assert.match($.text(), /学生需提供：计算与比较过程/)
  assert.match($.text(), /教师判断：教学价值/)
  assert.match($.text(), /还需同步修改作业正文/)
  assert.equal($('textarea').text(), finding.replacement)
  assert.ok($('label').attr('for'))
  assert.match($('button').text(), /将此条填入编辑器.*保留原稿/)
  assert.equal(calls, 0)
})

test('519: changed standards suppress stale apply controls and busy drafts disable decisions', () => {
  const changed = load(renderToStaticMarkup(<HomeworkSuggestions findings={[finding]} criteria={['教师的新编辑']} busy={false} onApply={() => {}} />))
  assert.equal(changed('textarea,button').length, 0)
  assert.match(changed.text(), /保存并重新检查/)
  const busy = load(renderToStaticMarkup(<HomeworkSuggestions findings={[finding]} criteria={[finding.original]} busy onApply={() => {}} />))
  assert.equal(busy('button:disabled').length, 2)
})
