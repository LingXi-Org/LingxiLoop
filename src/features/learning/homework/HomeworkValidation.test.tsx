import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from 'cheerio'
import type { Homework } from './contracts'
import { canPublishHomeworkDraft } from './contracts'
import { HomeworkValidation } from './HomeworkValidation'

const validation = (status: Homework['validation']['status'], feedback = '') => ({ status, feedback, revision: 7 })

test('an invalid draft has a destructive alert, icon, actual explanation and a concrete next step', () => {
  const $ = load(renderToStaticMarkup(<HomeworkValidation validation={validation('INVALID', '验收标准未说明需要提交什么。')} dirty={false} busy={false} onRetry={() => {}} />))
  assert.equal($('[role="alert"]').length, 1)
  assert.ok($('[role="alert"]').hasClass('text-destructive'))
  assert.equal($('[role="alert"] svg[aria-hidden="true"]').length, 1)
  assert.match($.text(), /验收标准未说明需要提交什么。/)
  assert.match($.text(), /修改作业要求或验收标准后，保存并重新检查/)
})

test('material and service errors explain different recovery actions and allow checking again', () => {
  const material = load(renderToStaticMarkup(<HomeworkValidation validation={validation('MATERIAL_ERROR', '课程提纲.pptx：未读到文字，请添加文字说明。')} dirty={false} busy={false} onRetry={() => {}} />))
  const service = load(renderToStaticMarkup(<HomeworkValidation validation={validation('ERROR')} dirty={false} busy={false} onRetry={() => {}} />))
  const serviceWithDetail = load(renderToStaticMarkup(<HomeworkValidation validation={validation('ERROR', '课程提纲.pptx暂时无法读取。请重试检查；若仍失败，请重新上传该文件。')} dirty={false} busy={false} onRetry={() => {}} />))
  assert.match(material.text(), /课程提纲.pptx：未读到文字，请添加文字说明。/)
  assert.match(service.text(), /检查服务暂时不可用/)
  assert.match(service.text(), /草稿和附件已保留/)
  assert.match(serviceWithDetail.text(), /课程提纲.pptx暂时无法读取。请重试检查；若仍失败，请重新上传该文件。/)
  assert.match(serviceWithDetail.text(), /草稿和附件已保留/)
  for (const $ of [material, service]) assert.equal($('button').text(), '重试检查')
})

test('editing hides stale validation feedback and retry controls until the new draft is saved', () => {
  for (const status of ['INVALID', 'MATERIAL_ERROR', 'ERROR', 'READY', 'PENDING'] as const) {
    const $ = load(renderToStaticMarkup(<HomeworkValidation validation={validation(status, '过期结果')} dirty busy={false} onRetry={() => {}} />))
    assert.doesNotMatch($.text(), /过期结果/)
    assert.equal($('button').length, 0)
    assert.match($.text(), /保存修改/)
  }
})

test('publish requires a clean draft with permission and the current revision ready', () => {
  const draft = { status: 'DRAFT', revision: 7, validation: validation('READY'), canPublish: true } as Homework
  assert.equal(canPublishHomeworkDraft(draft, false), true)
  for (const candidate of [
    { ...draft, validation: { ...draft.validation, revision: 6 } },
    { ...draft, canPublish: false },
    { ...draft, status: 'PUBLISHED' as const },
    ...(['PENDING', 'INVALID', 'MATERIAL_ERROR', 'ERROR'] as const).map(status => ({ ...draft, validation: validation(status) })),
  ]) assert.equal(canPublishHomeworkDraft(candidate, false), false)
  assert.equal(canPublishHomeworkDraft(draft, true), false)
})
