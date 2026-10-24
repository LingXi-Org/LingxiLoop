import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DeliveryPort } from '@lyyzka/lingxios'
import { createRunListInvalidation } from '../agent-runtime/run-list-invalidation.js'

test('inline events cannot invalidate before waitWork; the existing durable outbox retries until parked', async () => {
  const notifications: object[] = [], states: string[] = []
  let status = 'leased'
  const callback = createRunListInvalidation(async () => ({ async readRun() {
    states.push(status)
    return { id: 'run', fence: 3, requestVersion: 2, status, goalOutcome: { status: 'awaiting_input', requestVersion: 2 } } as never
  } }), (...args) => notifications.push(args))
  const work = { id: 'run', fence: 3, requestVersion: 2, tenantId: 'company', agentId: 'agent', sessionId: 'native-session', principalId: 'human',
    conversation: { conversationId: 'room', internal: false } } as Parameters<DeliveryPort['onEvent']>[0]
  const event = { runId: 'run', seq: 1, stage: 'completed', kind: 'goal.waiting', visibility: 'user', data: { goalOutcome: { status: 'awaiting_input', requestVersion: 2, verification: 'not_run', question: 'Synthetic question' } } } as Parameters<DeliveryPort['onEvent']>[1]
  const context = { signal: AbortSignal.timeout(1000), deadlineAt: new Date(Date.now() + 1000).toISOString() }
  await callback(work, event)
  assert.equal(states.length, 0, 'inline delivery returns before work can park')
  await assert.rejects(callback(work, event, context), /awaits the durable run transition/)
  assert.equal(notifications.length, 0)
  status = 'waiting'
  await callback(work, event, context)
  assert.equal(notifications.length, 1)
  assert.deepEqual(notifications[0], [{ tenantId: 'company', agentId: 'agent', sessionId: 'native-session', runId: 'run', principalId: 'human' }, 'room'])
  assert.deepEqual(states, ['leased', 'waiting'])
})
test('stale request/fence and internal events never publish a run-list hint', async () => {
  let notifications = 0
  const callback = createRunListInvalidation(async () => ({ async readRun() { return { id: 'run', fence: 4, requestVersion: 3, status: 'waiting' } as never } }), () => { notifications++ })
  const work = { id: 'run', fence: 3, requestVersion: 2, tenantId: 'company', agentId: 'agent', sessionId: 'session', principalId: 'human', conversation: { conversationId: 'room' } } as Parameters<DeliveryPort['onEvent']>[0]
  const event = { runId: 'run', seq: 1, stage: 'completed', kind: 'goal.waiting', visibility: 'user', data: { goalOutcome: { status: 'awaiting_input', requestVersion: 2, verification: 'not_run', question: 'Synthetic' } } } as Parameters<DeliveryPort['onEvent']>[1]
  const context = { signal: AbortSignal.timeout(1000), deadlineAt: new Date(Date.now() + 1000).toISOString() }
  await callback(work, event, context)
  await callback(work, { ...event, visibility: 'internal' }, context)
  await callback({ ...work, conversation: { ...work.conversation!, internal: true } }, event, context)
  assert.equal(notifications, 0)
})
