import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPromptContext, type TurnContext } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { GROUP_COLLABORATION_RULES, IM_CONVERSATION_RULES } from '../agent-runtime/conversation-style.js'

// Failure model: docs/evidence/issue-366/IM-NATIVE-ANSWER-CONTRACT-FAILURE-MODEL.md.
const send: NonNullable<TurnContext['tools']>[number] = {
  name: 'chat__send', action: 'chat.send', description: 'Synthetic authorized message.',
  parameters: { type: 'object', properties: { body: { type: 'string' } }, required: ['body'], additionalProperties: false },
  effect: 'uncertain', approval: false,
}
function context(withSend: boolean): TurnContext {
  return {
    work: { id: 'contract', tenantId: 'synthetic', principalId: 'human', agentId: 'tutor', sessionId: 'synthetic-session',
      triggerRef: 'request', kind: 'turn', lane: 'interactive', fence: 1, homeEpoch: 1, leaseToken: 'synthetic', meta: { codeExecution: 'disabled' } },
    persona: { name: 'Tutor', role: 'assistant', instructions: '' }, capabilities: withSend ? ['chat'] : [],
    grants: withSend ? [{ name: 'chat', methods: ['send'] }] : [], tools: withSend ? [send] : [], messages: [],
    productRules: IM_CONVERSATION_RULES + GROUP_COLLABORATION_RULES,
  }
}

for (const withSend of [false, true]) test(`compiled IM answer contract supports native segments with chat.send ${withSend ? 'available' : 'unavailable'}`, () => {
  const policy = new ProductRuntimePolicy(), current = context(withSend)
  const first = buildPromptContext(current, policy, 0)
  const restored = buildPromptContext({ ...current, promptContextCandidate: first }, policy, 1)
  for (const prompt of [first, restored]) {
    const instructions = prompt.systemInstructions
    assert.ok(instructions.includes(IM_CONVERSATION_RULES.trim()))
    assert.doesNotMatch(instructions, /coherent explanation normally belongs in one complete, directly streamed final answer/)
    assert.doesNotMatch(instructions, /Keep conclusions requiring review, provenance-bearing citations and complete deliverables in the native final result/)
    assert.match(instructions, /With sealed intermediate answers/)
    assert.match(instructions, /append new substance/)
    assert.match(instructions, /complete the remaining answer in the final segment/)
    assert.match(instructions, /Otherwise provide the complete native final answer required by that driver/)
    assert.match(instructions, /available, authorized chat\.send tool can deliver distinct settled conversational messages/)
    assert.match(instructions, /trusted model driver defines the public answer channel/)
    assert.equal(prompt.blocks?.find(block => block.source === 'product:rules')?.truncated, false)
  }
})

test('compiled native segments preserve review, acceptance and group dispatch obligations', () => {
  const instructions = buildPromptContext(context(true), new ProductRuntimePolicy(), 0).systemInstructions
  assert.ok(instructions.includes(GROUP_COLLABORATION_RULES.trim()))
  assert.match(instructions, /Group assignments belong only in the native final response, never chat\.send/)
  assert.match(instructions, /Your final reply is committed to the group before those members start/)
  assert.match(instructions, /Present conclusions requiring review after that review is complete/)
  assert.match(instructions, /acceptance, citation and complete-deliverable checks to the entire answer/)
  assert.match(instructions, /including earlier sealed segments and referenced artifacts/)
  assert.match(instructions, /Describe progress and remaining work accurately/)
  assert.match(instructions, /Internal tasks and scheduled summaries retain their existing delivery workflows/)
})
