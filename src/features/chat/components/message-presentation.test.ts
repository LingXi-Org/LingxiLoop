import assert from 'node:assert/strict'
import test from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { inputOwner, ownsApproval, messagePresentation } from './message-presentation'

const annotation = (id: string, kind: string, extra = {}) => ({ lingxiloop: { activity: { version: 1, id, kind, label: id, ...extra } } })
const tool = (id: string, extra = {}) => ({ type: 'tool-call', toolCallId: id, toolName: 'fixture.tool', args: {}, argsText: '', ...extra })
const message = (content: unknown[], custom = {}, status = { type: 'requires-action', reason: 'interrupt' }): ThreadMessage => ({ id: 'run-r', role: 'assistant', createdAt: new Date(0), content, status,
  metadata: { custom: { runId: 'r', harnessControl: true, harness: { runId: 'r', requestVersion: 3, lifecycle: 'waiting', goalOutcome: { status: 'awaiting_input' } }, ...custom } } }) as unknown as ThreadMessage

test('only the unique current interrupt owns input; ambiguous interrupts fall back to the run', () => {
  const interrupt = { type: 'human', payload: {} }
  assert.deepEqual(inputOwner(message([tool('a', { interrupt })])), { type: 'tool', toolCallId: 'a' })
  const ambiguous = message([tool('a', { interrupt, providerMetadata: annotation('a', 'attention') }), tool('b', { interrupt, providerMetadata: annotation('b', 'attention') })])
  assert.deepEqual(inputOwner(ambiguous), { type: 'harness' })
  assert.deepEqual(messagePresentation(ambiguous).map(item => item.region), ['attention', 'attention'], 'ambiguous current waits stay discoverable without extra forms')
  assert.deepEqual(inputOwner(message([tool('a', { interrupt, providerMetadata: annotation('a', 'attention', { requestVersion: 2 }) })])), { type: 'harness' })
  assert.deepEqual(inputOwner(message([], { questionnaireWait: { questionId: 'q', requestVersion: 3 } })), { type: 'questionnaire' })
  assert.deepEqual(inputOwner(message([tool('a', { interrupt })], {}, { type: 'complete', reason: 'stop' })), { type: 'none' })
})

test('one current matching approval owns controls and resolved/old requests cannot submit', () => {
  const approval = { id: 'gate' }
  const current = message([tool('a', { approval }), tool('b', { approval })], { harness: { runId: 'r', requestVersion: 3, lifecycle: 'waiting', goalOutcome: { status: 'awaiting_approval', approvalId: 'gate' } } })
  assert.equal(ownsApproval(current, 'a', 'gate'), true)
  assert.equal(ownsApproval(current, 'b', 'gate'), false)
  assert.equal(ownsApproval(current, 'a', 'other-gate'), false)
  assert.equal(ownsApproval({ ...current, status: { type: 'complete', reason: 'stop' } }, 'a', 'gate'), false)
})

test('explicit process is exclusive and legacy structured results are visible', () => {
  const parts = [tool('ordinary', { result: { status: 'completed' }, providerMetadata: annotation('ordinary', 'tool') }),
    { type: 'text', text: 'process', providerMetadata: annotation('process', 'commentary') },
    { type: 'text', text: 'answer', providerMetadata: annotation('answer', 'answer') },
    tool('legacy', { result: { memory: { items: [] } }, providerMetadata: annotation('legacy', 'tool') }),
    { type: 'text', text: 'unclassified' }]
  assert.deepEqual(messagePresentation(message(parts)).map(item => item.region), ['process', 'process', 'body', 'body', 'body'])
})

test('recovered errors join process while unresolved current failures remain visible', () => {
  const part = tool('failed', { isError: true, result: { status: 'failed' }, providerMetadata: annotation('failed', 'attention') })
  assert.equal(messagePresentation(message([part]))[0]?.region, 'attention')
  const recovered = message([part], { harness: { lifecycle: 'succeeded', requestVersion: 3, goalOutcome: { status: 'satisfied' } } }, { type: 'complete', reason: 'stop' })
  assert.equal(messagePresentation(recovered)[0]?.region, 'process')
  const unknown = { ...recovered, content: [tool('uncertain', { result: { status: 'unknown' }, providerMetadata: annotation('uncertain', 'attention') })] } as unknown as ThreadMessage
  assert.equal(messagePresentation(unknown)[0]?.region, 'attention', 'an unverified side effect remains visible even when the answer succeeded')
})

test('stable trusted answer identity survives index movement but resets on new request', () => {
  const answer = { type: 'text', text: 'first', providerMetadata: annotation('accepted', 'answer') }
  const first = messagePresentation(message([tool('tool'), answer]))[1]!
  const committed = messagePresentation(message([answer, tool('tool')]))[0]!
  assert.equal(first.key, committed.key)
  const next = messagePresentation(message([answer], { harness: { requestVersion: 4 } }))[0]!
  assert.notEqual(next.key, first.key)
})

test('known event order stays ordered while unknown legacy entries retain their server slots', async () => {
  const { orderActivityEntries } = await import('./message-presentation')
  const items = [{ id: 'later', order: 20 }, { id: 'legacy' }, { id: 'earlier', order: 10 }, { id: 'same-time', order: 20 }]
  assert.deepEqual(orderActivityEntries(items).map(item => item.id), ['earlier', 'legacy', 'later', 'same-time'])
  assert.deepEqual(items.map(item => item.id), ['later', 'legacy', 'earlier', 'same-time'], 'ordering does not mutate live or page state')
})
