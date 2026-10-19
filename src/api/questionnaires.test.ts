import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

// Isolation failure modes: unescaped channel/question IDs, missing cancellation,
// malformed states enabling submission, submitted state without canonical answers.
test('questionnaire API scopes URLs and validates durable state before use', async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = []
  let response: unknown = { status: 'waiting', readOnly: false }
  mock.module('./core/http', { namedExports: { http: async (path: string, init?: RequestInit) => { calls.push({ path, init }); return response } } })
  const { questionnairesApi } = await import('./questionnaires')
  const controller = new AbortController()
  assert.deepEqual(await questionnairesApi.read('room/a', 'question/b', controller.signal), response)
  assert.equal(calls[0].path, '/im/channels/room%2Fa/questionnaires/question%2Fb')
  assert.equal(calls[0].init?.signal, controller.signal)
  for (const invalid of [{ status: 'submitted', readOnly: true }, { status: 'waiting' }, { status: 'other', readOnly: false }]) {
    response = invalid
    await assert.rejects(questionnairesApi.read('room', 'question'))
  }
  response = { status: 'submitted', readOnly: true, answers: { goal: 'saved' } }
  assert.deepEqual(await questionnairesApi.read('room', 'question'), response)
  response = { status: 'resuming', readOnly: true, answers: { goal: 'frozen' }, retryable: true }
  assert.deepEqual(await questionnairesApi.read('room', 'question'), response)
  response = { status: 'pending', readOnly: true, answers: { goal: 'frozen' } }
  assert.deepEqual(await questionnairesApi.read('room', 'question'), response)
})
