import assert from 'node:assert/strict'
import test, { mock } from 'node:test'
// These schema tests must never load IM/database clients or read private evidence.
mock.module('../im/public.js', { namedExports: { getAgentChannelHistory: () => { throw new Error('unexpected IM read') } } })
mock.module('../modules/access/public.js', { namedExports: { createPermissionService: () => { throw new Error('unexpected permission read') } } })
const { homeworkSubmitSchema } = await import('../modules/learning/homework-contracts.js')

const request = { expectedAnswerRevision: 3, reportId: 'report', idempotencyKey: 'submission-497' }
test('missing and empty conversation references give the same actionable preflight rejection', () => {
  for (const input of [request, { ...request, conversationReferences: [] }]) {
    const result = homeworkSubmitSchema.safeParse(input)
    assert.equal(result.success, false)
    if (!result.success) assert.equal(result.error.issues[0].message, '请关联至少一段有本人作答和助手回复的对话')
  }
})
test('selected references remain bounded and require a full turn before business reads', () => {
  const reference = { channelId: 'room', messageIds: ['student-message', 'assistant-message'] }
  assert.equal(homeworkSubmitSchema.safeParse({ ...request, conversationReferences: [reference] }).success, true)
  for (const refs of [[{ ...reference, messageIds: ['student-message'] }], Array(21).fill(reference)]) {
    assert.equal(homeworkSubmitSchema.safeParse({ ...request, conversationReferences: refs }).success, false)
  }
})
