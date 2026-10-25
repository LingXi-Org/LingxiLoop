import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import type { DeliveryPort, RunState, TerminalFeedback } from '@lyyzka/lingxios'
import { nativeText, type NativeMessage } from '../../../src/lib/nativeMessage.js'

test('terminal port preserves accepted feedback, fences stale versions and never wakes agents', async () => {
  type Payload = NativeMessage
  const receipts = new Map<string, Payload>(), sent: Payload[] = []
  const checks: string[] = []
  const feedback: TerminalFeedback = { id: 'synthetic-feedback', rootWorkId: 'synthetic-root', requestVersion: 1, status: 'failed', reason: 'execution_failed',
    failedCount: 1, cancelledCount: 0, notStartedCount: 0, notStartedAgentIds: [], createdAt: '2026-10-24T00:00:00Z', suppressAgentWake: true }
  let state: RunState = {
    run: { id: 'synthetic-root', status: 'succeeded', requestVersion: 1, fence: 1, resultId: 'synthetic-result', resultFence: 1,
      kind: 'turn', attempts: 1, createdAt: '', availableAt: '', heartbeatAt: null, lastProgressAt: null, goalOutcome: null, error: null },
    message: { version: 2, runId: 'synthetic-root', agentId: 'synthetic-agent', sessionId: 'synthetic-session', body: 'Delivered answer.', envelope: {
      version: 1, requestVersion: 1, body: 'Delivered answer.', evidenceSnapshotId: 'synthetic-evidence', citations: [], artifacts: [],
      goalOutcome: { status: 'satisfied', verification: 'passed', requestVersion: 1 } } }, delivery: 'delivered',
  }
  let ingests = 0, diagnosticReads = 0
  let acceptedReference: string | undefined, sendKind = 'accepted'
  let currentFeedback = feedback
  const database = { query: async () => ({ rows: [] }) }
  const api = { readTerminal: async () => ({ feedback: currentFeedback, delivery: 'pending' }), readRunState: async () => state, readRun: async () => state.run,
    readEvents: async () => { diagnosticReads++; return { events: [], nextSeq: 0 } }, conversations: { ingest: async () => { ingests++ } } }
  mock.module('../agent-runtime/assistant-transport.js', { namedExports: { readRunProjection() {} } })
  mock.module('../agent-runtime/assistant-text.js', { namedExports: { assistantTextViolation: () => null } })
  mock.module('../im/public.js', { namedExports: { sendAgentChannelMessage() {}, sendSystemChannelMessage: async (input: { clientNonce: string; payload: Payload }) => {
    if (sendKind === 'accepted' && !receipts.has(input.clientNonce)) { receipts.set(input.clientNonce, input.payload); sent.push(input.payload) }
    return { kind: sendKind }
  } } })
  mock.module('../agent-runtime/context.js', { namedExports: { loadRuntimeBinding: async () => { checks.push('binding') } } })
  mock.module('../agent-runtime/identity.js', { namedExports: { productConversationId: () => 'synthetic-room', assertFrozenAudience: async () => { checks.push('audience') }, bindProductRun() {}, notifyRunAvailable() {} } })
  mock.module('../agent-runtime/product-callbacks.js', { namedExports: { runProductCallback: async (context: object, callback: (scope: object) => Promise<unknown>) => callback({ ...context, database }) } })
  mock.module('../agent-runtime/run-list-invalidation.js', { namedExports: { createRunListInvalidation: () => () => {} } })
  mock.module('../agent-runtime/conversations.js', { namedExports: { syncConversationPolicy() {} } })
  mock.module('../im/messages-repository.js', { namedExports: { getSendAcceptance: async (_database: object, input: { clientNonce: string }) => receipts.has(input.clientNonce) ? { payload: receipts.get(input.clientNonce) } : null } })
  mock.module('../agent-runtime/conversation-handoff.js', { namedExports: { conversationHandoffMentions() { throw new Error('terminal notifications cannot dispatch mentions') } } })
  mock.module('../agent-runtime/delivery-reference.js', { namedExports: { readDeliveredReference: async () => acceptedReference } })
  mock.module('../modules/canvas/index.js', { namedExports: { assertCanvasRequestCurrent: async () => { checks.push('canvas') } } })
  const { createProductDelivery } = await import('../agent-runtime/delivery.js')
  const deliver = createProductDelivery(async () => api as never).deliverTerminal!
  const work = { id: 'synthetic-root', tenantId: 'synthetic-company', agentId: 'synthetic-agent', sessionId: 'synthetic-session', principalId: 'synthetic-human',
    conversation: { internal: false, audience: { participantIds: ['synthetic-human', 'synthetic-agent'] } } } as Parameters<NonNullable<DeliveryPort['deliverTerminal']>>[0]
  const context = { signal: new AbortController().signal, deadlineAt: new Date(Date.now() + 5000).toISOString() }
  await deliver(work, feedback, context)
  assert.equal(sent.length, 1)
  assert.match(nativeText(sent[0]), /已有答复已发送.*后续协作未全部完成/)
  assert.equal(sent[0].role, 'system')
  assert.equal(sent[0].metadata.custom.suppressAgentWake, true)
  assert.equal(sent[0].metadata.custom.terminalScopeVersion, 1)
  assert.equal(sent[0].metadata.custom.terminalScope, 'follow_up')
  assert.equal(diagnosticReads, 0)
  assert.deepEqual(checks, ['binding', 'canvas', 'audience', 'binding', 'canvas', 'audience'])
  // A retry must reuse the first accepted payload even if optional facts change.
  state = { ...state, delivery: 'failed' }
  await deliver(work, feedback, context)
  assert.equal(sent.length, 1)
  assert.equal(ingests, 0)
  assert.match(nativeText(receipts.get('terminal-synthetic-feedback')!), /已有答复已发送/)
  assert.equal(receipts.get('terminal-synthetic-feedback')!.metadata.custom.terminalScope, 'follow_up')
  currentFeedback = { ...feedback, id: 'synthetic-delivery' }
  await deliver(work, currentFeedback, context)
  assert.equal(sent[1].metadata.custom.terminalScope, 'delivery')
  assert.match(nativeText(sent[1]), /发送未能确认/)
  acceptedReference = 'synthetic-accepted-message'
  currentFeedback = { ...feedback, id: 'synthetic-finalization' }
  await deliver(work, currentFeedback, context)
  assert.equal(sent[2].metadata.custom.terminalScope, 'finalization')
  assert.match(nativeText(sent[2]), /答复已发送.*收尾未能完成/)
  sendKind = 'rejected'
  currentFeedback = { ...feedback, id: 'synthetic-not-accepted' }
  await assert.rejects(deliver(work, currentFeedback, context), /terminal delivery rejected/)
  assert.equal(receipts.has('terminal-synthetic-not-accepted'), false, 'real notification delivery failure is retried by the runtime')
  state = { ...state, run: { ...state.run, requestVersion: 2 } }
  await deliver(work, { ...feedback, id: 'synthetic-stale' }, context)
  assert.equal(sent.length, 3, 'stale request version cannot publish terminal feedback')
  mock.restoreAll()
})
