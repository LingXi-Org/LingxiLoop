import assert from 'node:assert/strict'
import test from 'node:test'
import { homeworkSubmissionAttempt, homeworkSubmissionBlocker } from './submission'
import type { HomeworkStudent } from './contracts'

const answer = { text: '我的作答', links: [], attachments: [] }
const student = { channelId: 'room', status: 'LEARNING', canSubmit: true, hasLearningRecord: true, reportStatus: 'READY',
  answerRevision: 3, report: { id: 'report', answerRevision: 3, evidenceSources: [{ messageId: 'student-message', excerpt: '我的推导' }] } } as HomeworkStudent
const references = [{ channelId: 'room', messageIds: ['student-message', 'assistant-message'] }]
const blocker = (patch: Partial<HomeworkStudent> = {}, dirty = false, uploading = false, refs = references) =>
  homeworkSubmissionBlocker({ student: { ...student, ...patch }, answer, dirty, uploading, references: refs, canSubmit: true })

test('missing and unrelated references explain the next step; a matching turn immediately unblocks submission', () => {
  assert.match(blocker({}, false, false, []), /选择.*勾选/)
  assert.match(blocker({}, false, false, [{ channelId: 'room', messageIds: ['other-user', 'assistant'] }]), /学习报告.*依据/)
  assert.match(blocker({}, false, false, [{ channelId: 'other-room', messageIds: ['student-message', 'assistant'] }]), /学习报告.*依据/)
  assert.equal(blocker(), '')
})

test('answer, upload, learning and report prerequisites stay explicit even with a selected reference', () => {
  assert.match(blocker({}, false, true), /附件.*上传/)
  assert.match(blocker({}, true), /保存.*报告/)
  assert.match(blocker({ hasLearningRecord: false }), /学习对话/)
  assert.match(blocker({ reportStatus: 'PENDING' }), /报告.*生成/)
  assert.match(blocker({ reportStatus: 'INVALID', report: null }), /更新报告/)
  assert.match(blocker({ report: { ...student.report!, answerRevision: 2 } }), /更新报告/)
  assert.match(blocker({ canSubmit: false }), /暂不接收/)
})


test('a failed unchanged attempt keeps its identity, while correcting references creates a fresh key', () => {
  const first = homeworkSubmissionAttempt(null, 'report', 3, references)
  assert.equal(homeworkSubmissionAttempt(first, 'report', 3, structuredClone(references)), first)
  const corrected = homeworkSubmissionAttempt(first, 'report', 3, [...references, { channelId: 'room', messageIds: ['other-user', 'other-assistant'] }])
  assert.notEqual(corrected.key, first.key)
  assert.equal(homeworkSubmissionAttempt(corrected, 'report', 3, [...references, { channelId: 'room', messageIds: ['other-user', 'other-assistant'] }]), corrected)
  assert.notEqual(homeworkSubmissionAttempt(first, 'new-report', 3, references).key, first.key)
  assert.notEqual(homeworkSubmissionAttempt(first, 'report', 4, references).key, first.key)
})
