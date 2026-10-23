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
    assert.match(instructions, /When that contract supports sealed intermediate answers/)
    assert.match(instructions, /continue with append/)
    assert.match(instructions, /final segment add only missing content instead of repeating sealed text/)
    assert.match(instructions, /Otherwise, keep the complete answer in the native final response as required by that driver/)
    assert.match(instructions, /available, authorized chat\.send tool may still send settled lead-in messages/)
    assert.match(instructions, /If chat\.send is unavailable, use the native answer channel under the same driver contract/)
    assert.equal(prompt.blocks?.find(block => block.source === 'product:rules')?.truncated, false)
  }
})

test('compiled native segments preserve review, acceptance and group dispatch obligations', () => {
  const instructions = buildPromptContext(context(true), new ProductRuntimePolicy(), 0).systemInstructions
  assert.ok(instructions.includes(GROUP_COLLABORATION_RULES.trim()))
  assert.match(instructions, /Group assignments belong only in the native final response, never chat\.send/)
  assert.match(instructions, /Your final reply is committed to the group before those members start/)
  assert.match(instructions, /Do not state conclusions requiring review before that review is complete/)
  assert.match(instructions, /normal acceptance, citation and complete-deliverable checks to the full native answer/)
  assert.match(instructions, /earlier sealed segments do not waive these checks/)
  assert.match(instructions, /Prior messages are not permission to skip verification or claim unfinished work is complete/)
  assert.match(instructions, /internal tasks return their required reports and scheduled summaries keep their existing delivery workflow/)
})
