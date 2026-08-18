/**
 * Unit tests for declared assistant-text relay validation. The runtime no
 * longer infers a relay target from inbox shape; it only validates a target
 * the model explicitly declared through set_turn_status.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-auto-relay.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveDeclaredAutoRelayTarget,
  type AutoRelayInboxRow,
} from '../agents/auto-relay.js'

function row(over: Partial<AutoRelayInboxRow>): AutoRelayInboxRow {
  return {
    conversation_id: over.conversation_id ?? 'c-1',
    conversation_kind: over.conversation_kind ?? 'direct',
    company_id: over.company_id ?? 'co-1',
    body: over.body ?? '',
  }
}

test('resolveDeclaredAutoRelayTarget: reply directive validates an inbox conversation', () => {
  const out = resolveDeclaredAutoRelayTarget(
    [row({ conversation_id: 'c-dm', conversation_kind: 'direct' })],
    { action: 'reply', conversationId: 'c-dm', reason: 'send the draft' },
  )
  assert.ok(out)
  assert.equal(out!.conversationId, 'c-dm')
  assert.equal(out!.companyId, 'co-1')
  assert.equal(out!.reason, 'send the draft')
})

test('resolveDeclaredAutoRelayTarget: target can be a group when explicitly declared', () => {
  const out = resolveDeclaredAutoRelayTarget(
    [
      row({ conversation_id: 'c-dm', conversation_kind: 'direct' }),
      row({ conversation_id: 'g-1', conversation_kind: 'group', company_id: 'co-2' }),
    ],
    { action: 'reply', conversationId: 'g-1' },
  )
  assert.ok(out)
  assert.equal(out!.conversationId, 'g-1')
  assert.equal(out!.companyId, 'co-2')
  assert.match(out!.reason, /model declared/)
})

test('resolveDeclaredAutoRelayTarget: no route is inferred for none/drop', () => {
  const inbox = [row({ conversation_id: 'c-dm' })]
  assert.equal(resolveDeclaredAutoRelayTarget(inbox, { action: 'none', conversationId: 'c-dm' }), null)
  assert.equal(resolveDeclaredAutoRelayTarget(inbox, { action: 'drop', conversationId: 'c-dm' }), null)
})

test('resolveDeclaredAutoRelayTarget: rejects missing or out-of-inbox targets', () => {
  const inbox = [row({ conversation_id: 'c-dm' })]
  assert.equal(resolveDeclaredAutoRelayTarget(inbox, { action: 'reply', conversationId: null }), null)
  assert.equal(resolveDeclaredAutoRelayTarget(inbox, { action: 'reply', conversationId: 'other' }), null)
})

test('resolveDeclaredAutoRelayTarget: duplicate inbox rows collapse by lookup, not heuristic', () => {
  const out = resolveDeclaredAutoRelayTarget(
    [
      row({ conversation_id: 'c-dm', body: 'first' }),
      row({ conversation_id: 'c-dm', body: 'second' }),
    ],
    { action: 'reply', conversationId: 'c-dm' },
  )
  assert.ok(out)
  assert.equal(out!.conversationId, 'c-dm')
})
