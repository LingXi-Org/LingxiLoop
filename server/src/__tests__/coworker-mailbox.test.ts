import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { executeCommunicationActions } from '../agents/lingxigraph-adapter.js'
import { resolveMailboxDelivery } from '../agents/mailbox-delivery.js'
import { resolveAgentRecipients, type GroupRouteInput } from '../agents/message-routing.js'

const group: GroupRouteInput = {
  conversationKind: 'group',
  authorId: 'agent-a',
  authorKind: 'agent',
  leaderId: 'agent-b',
  agents: [{ id: 'agent-a', muted: false }, { id: 'agent-b', muted: false }],
  mentionedIds: ['agent-b'],
  mentionAll: false,
}

test('A/C: ordinary peer input is always NEXT_TURN and never activates, regardless of final timing', () => {
  assert.deepEqual(resolveMailboxDelivery({ authorKind: 'agent', activation: 'deliver', targetBusy: true }), {
    activate: false,
    steerCurrentTurn: false,
    phase: 'NEXT_TURN',
  })
  assert.deepEqual(resolveMailboxDelivery({ authorKind: 'agent', activation: 'deliver', targetBusy: false }), {
    activate: false,
    steerCurrentTurn: false,
    phase: 'NEXT_TURN',
  })
  assert.deepEqual(resolveAgentRecipients(group), [])
})

test('D: human steer and formal handoff can enter CURRENT_TURN through safe-point steering', () => {
  assert.deepEqual(resolveMailboxDelivery({ authorKind: 'human', targetBusy: true }), {
    activate: true,
    steerCurrentTurn: true,
    phase: 'CURRENT_TURN',
  })
  assert.deepEqual(resolveMailboxDelivery({ authorKind: 'agent', activation: 'trigger', targetBusy: true }), {
    activate: true,
    steerCurrentTurn: true,
    phase: 'CURRENT_TURN',
  })
})

test('B/E: handoff plus duplicate mention resolves one owner activation', () => {
  assert.deepEqual(resolveAgentRecipients({
    ...group,
    mentionedIds: ['agent-b', 'agent-b'],
    activation: 'trigger',
  }), ['agent-b'])
})

test('B: handoff.create owns its durable action key at the sink', async () => {
  let ledgerClaimed = false
  let internalKey: string | undefined
  const execution = await executeCommunicationActions({
    agentId: 'agent-a',
    inputScopeKey: 'scope-1',
    actions: [{ type: 'handoff.create', conversationId: 'conv-1', toAgentId: 'agent-b', title: 'Own this task' }],
    executeCli: async (_argv, internal) => {
      internalKey = internal?.idempotencyKey
      return { ok: true, exitCode: 0, text: 'created' }
    },
    ledger: {
      async claim() { ledgerClaimed = true; return { claimed: true } },
      async markSucceeded() {},
      async markFailed() {},
    },
  })
  assert.equal(execution.completed, true)
  assert.equal(ledgerClaimed, false, 'generic replay ledger must not race the handoff sink')
  assert.match(internalKey ?? '', /^[a-f0-9]{64}$/)
})

test('handoff schema and publisher pin idempotency plus trigger-only activation', async () => {
  const migration = await readFile(new URL('../db/migrate.ts', import.meta.url), 'utf8')
  const coworker = await readFile(new URL('../agents/coworker.ts', import.meta.url), 'utf8')
  assert.match(migration, /idx_agent_handoffs_idempotency_key/)
  assert.match(coworker, /ON CONFLICT \(idempotency_key\)[\s\S]*DO NOTHING/)
  assert.match(coworker, /activation: 'trigger'/)
})
