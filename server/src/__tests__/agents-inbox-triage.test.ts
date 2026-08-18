import { afterEach, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyInboxTriage } from '../agents/inbox-triage.js'
import type { ContextRow, InboxRow, PersonaRow } from '../agents/runtime/client.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { redis, sub } from '../redis.js'

afterEach(() => {
  __setLlmClientOverrideForTesting(null)
})

// classifyInboxTriage now gathers active work claims (gatherClaimsByConvo →
// inprocClient.peekWorklog → Redis), which loads the eagerly-connecting Redis
// client. Disconnect it so the process can exit — same pattern the other
// Redis-touching suites use.
after(() => {
  try { redis.disconnect() } catch { /* ignore */ }
  try { sub.disconnect() } catch { /* ignore */ }
})

const PERSONA: PersonaRow = {
  id: 'atlas-1234',
  name: 'Atlas',
  role: 'Ops',
  style: 'Short and practical.',
  model: null,
  companyId: 'co-1',
}

function inboxRow(overrides: Partial<InboxRow> = {}): InboxRow {
  return {
    id: 'm-1',
    conversation_id: 'allhands-1',
    company_id: 'co-1',
    conversation_title: 'All hands',
    conversation_kind: 'group',
    conversation_topic: null,
    author_id: 'human-1',
    author_kind: 'human',
    author_name: 'Yetone',
    body: 'hello @all',
    kind: 'text',
    sequence: 1,
    created_at: '2026-05-26T10:00:00Z',
    attachment: null,
    quoted_message_id: null,
    quoted: null,
    ...overrides,
  }
}

function contextRow(overrides: Partial<ContextRow> = {}): ContextRow {
  return {
    ...inboxRow(overrides),
    is_unread: true,
    is_self: false,
    conversation_topic: null,
    project_name: null,
    reactions: [],
    ...overrides,
  }
}

function stubLlm(outputText: string): void {
  __setLlmClientOverrideForTesting((async () => ({
    responses: {
      create: async () => ({ output_text: outputText }),
    },
  })) as unknown as Parameters<typeof __setLlmClientOverrideForTesting>[0])
}

// Capture the exact params passed to responses.create, to assert request shape.
function captureLlm(): { params: () => Record<string, unknown> | null } {
  let captured: Record<string, unknown> | null = null
  __setLlmClientOverrideForTesting((async () => ({
    responses: {
      create: async (p: Record<string, unknown>) => { captured = p; return { output_text: '{"actionable":false,"reason":"r","promptNote":"n"}' } },
    },
  })) as unknown as Parameters<typeof __setLlmClientOverrideForTesting>[0])
  return { params: () => captured }
}

test('triage request carries the word "json" in the INPUT (else json_object 400 → fail-open)', async () => {
  const cap = captureLlm()
  // Agent-authored so the request actually reaches the model (a human message
  // fast-paths and never builds an LLM request).
  await classifyInboxTriage({
    agentId: PERSONA.id, companyId: PERSONA.companyId, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'atlas-1', body: 'team, please each weigh in', conversation_kind: 'group' })],
    context: [contextRow({ author_kind: 'agent', author_id: 'atlas-1', body: 'team, please each weigh in', conversation_kind: 'group' })],
  })
  const p = cap.params()
  assert.ok(p, 'responses.create should have been called')
  assert.match(String(p!.input), /json/i, 'input must contain "json" so the json_object format is accepted')
  assert.deepEqual((p!.text as { format?: { type?: string } }).format?.type, 'json_object')
})

test('human @all fast-paths to actionable=true WITHOUT the model (human-sacred, gate would only ever say yes)', async () => {
  // A human broadcast to the group is never gated: the cerebellum's contract is
  // "human → actionable=true, ALWAYS", so the model can only answer yes. Skip it.
  stubLlm(JSON.stringify({ actionable: false, reason: 'the model must NOT be consulted for a human message' }))
  const verdict = await classifyInboxTriage({
    agentId: PERSONA.id,
    companyId: PERSONA.companyId,
    persona: PERSONA,
    inbox: [inboxRow()],
    context: [contextRow()],
  })

  assert.equal(verdict.actionable, true)
  assert.equal(verdict.source, 'human-group', 'short-circuited — the model (stubbed to false) was not consulted')
})

test('an informational human broadcast is STILL not gated (human-sacred beats broadcast-suppression)', async () => {
  // A purely informational "@all heads up" wakes the big brain, which then reads the
  // room and stays silent per GLANCE_YIELD_RULES if nothing needs it. We deliberately
  // do NOT let the gate suppress a human broadcast to save wakes — never gate a human.
  // (If informational-broadcast suppression is ever wanted, it's a separate, explicit
  // change to the gate instructions, not a silent side effect of triage.)
  stubLlm(JSON.stringify({ actionable: false, reason: 'broadcast statement, no specific ask' }))
  const verdict = await classifyInboxTriage({
    agentId: PERSONA.id,
    companyId: PERSONA.companyId,
    persona: PERSONA,
    inbox: [inboxRow({ body: '@all heads up, staging will be redeployed in 10 minutes' })],
    context: [contextRow({ body: '@all heads up, staging will be redeployed in 10 minutes' })],
  })

  assert.equal(verdict.actionable, true, 'a human broadcast still wakes the big brain — it decides to stay silent, the gate does not')
  assert.equal(verdict.source, 'human-group')
})

test('a HUMAN 1:1 DM short-circuits to actionable=true WITHOUT calling the model (never gate a human DM)', async () => {
  // The most important DM rule: a human messaging an agent 1:1 must ALWAYS get a
  // response. No cerebellum in the way — if it ever judged "not relevant" the human
  // would be left hanging, the worst failure. So a human DM never reaches the model.
  stubLlm(JSON.stringify({ actionable: false, reason: 'the model must NOT be consulted here' }))
  const verdict = await classifyInboxTriage({
    agentId: PERSONA.id,
    companyId: PERSONA.companyId,
    persona: PERSONA,
    inbox: [inboxRow({ conversation_kind: 'direct', body: 'can you fix the deploy?' })],
    context: [contextRow({ conversation_kind: 'direct', body: 'can you fix the deploy?' })],
  })

  assert.equal(verdict.actionable, true, 'human DM is always actionable')
  assert.equal(verdict.source, 'human-dm', 'short-circuited — the model (stubbed to false) was not consulted')
})

test('human group messages (greeting / open question / counting) all fast-path to actionable=true (no model, no responseMode gymnastics)', async () => {
  // These used to be routed to the model to compute a responseMode hint (each /
  // one-of-us). That hint is unused in production — the big brain decides who/how
  // by reading the room — so a human message no longer pays the gate at all; it
  // fast-paths. The model is stubbed to false to PROVE it isn't consulted.
  stubLlm(JSON.stringify({ actionable: false, reason: 'the model must NOT be consulted for a human message' }))
  for (const body of ['大家好呀', 'anyone know how to reset the staging db?', '@all count upward, each reply once']) {
    const verdict = await classifyInboxTriage({
      agentId: PERSONA.id, companyId: PERSONA.companyId, persona: PERSONA,
      inbox: [inboxRow({ author_kind: 'human', body })],
      context: [contextRow({ author_kind: 'human', body })],
    })
    assert.equal(verdict.actionable, true, `${body} → actionable`)
    assert.equal(verdict.source, 'human-group', `${body} → human-group (model not consulted)`)
  }
})

test('ambiguous group chatter from a PEER can be skipped by support-model triage', async () => {
  // Agent-authored chatter DOES reach the model (only human messages fast-path);
  // the gate can skip it. This is the noise the triage layer exists to suppress.
  stubLlm(JSON.stringify({
    actionable: false,
    reason: 'casual group chatter not addressed to this agent',
    promptNote: 'Stay quiet; nothing needs this agent.',
  }))

  const verdict = await classifyInboxTriage({
    agentId: PERSONA.id,
    companyId: PERSONA.companyId,
    persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'nice, sounds good' })],
    context: [contextRow({ author_kind: 'agent', author_id: 'bram-1', author_name: 'Bram', body: 'nice, sounds good' })],
  })

  assert.equal(verdict.actionable, false)
  assert.equal(verdict.source, 'support-model')
  assert.match(verdict.reason, /casual group chatter/)
})

function stubLlmThrows(err: unknown): void {
  __setLlmClientOverrideForTesting((async () => ({
    responses: { create: async () => { throw err } },
  })) as unknown as Parameters<typeof __setLlmClientOverrideForTesting>[0])
}

test('a rate-limited model FAILS CLOSED — never wakes the big brain (the quota-burn guard)', async () => {
  // Agent-authored so the wake actually reaches the model (a human message
  // fast-paths and never hits the rate-limit path — humans are served regardless).
  stubLlmThrows(Object.assign(new Error('429 Too Many Requests'), { status: 429 }))
  const v = await classifyInboxTriage({
    agentId: PERSONA.id, companyId: PERSONA.companyId, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'atlas-1', body: 'team, weigh in on the roadmap' })],
    context: [contextRow({ author_kind: 'agent', author_id: 'atlas-1', body: 'team, weigh in on the roadmap' })],
  })
  assert.equal(v.actionable, false, 'rate-limited → do NOT escalate to the big brain')
  assert.equal(v.source, 'rate-limited')
})

test('a NON-rate-limit error still fails OPEN (safe to let the brain decide)', async () => {
  stubLlmThrows(new Error('ECONNRESET socket hang up'))
  const v = await classifyInboxTriage({
    agentId: PERSONA.id, companyId: PERSONA.companyId, persona: PERSONA,
    inbox: [inboxRow({ author_kind: 'agent', author_id: 'atlas-1', body: 'team, weigh in on the roadmap' })],
    context: [contextRow({ author_kind: 'agent', author_id: 'atlas-1', body: 'team, weigh in on the roadmap' })],
  })
  assert.equal(v.actionable, true)
  assert.equal(v.source, 'fail-open')
})
