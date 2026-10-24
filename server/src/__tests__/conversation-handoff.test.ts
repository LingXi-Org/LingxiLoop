import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TurnContext } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'

// Failure inventory: docs/evidence/issue-298/FAILURE-MODEL.md. Only an exact
// current peer handle can defer repair; quoted examples and arbitrary names
// cannot turn a missing requested deliverable into a completed turn.
const context = (): TurnContext => ({
  work: { id: 'run',agentId: 'agent',principalId: 'human',meta: { conversationTurn: true },
    conversation: { internal: false,audience: { participantIds: ['agent','human','peer'] } } },
  dynamic: { roster: [{ id: 'agent',name: 'Builder' },{ id: 'peer',name: 'Reviewer' },{ id: 'outside',name: 'Other agent' }] },
}) as unknown as TurnContext
const policy = new ProductRuntimePolicy() as ProductRuntimePolicy & { deferConversationRepair(text: string,context: TurnContext): boolean }

test('a real peer assignment is an explicit public contribution boundary',() => {
  for(const text of ['协作交接：@peer Please independently verify the result.','协作交接：@Reviewer Please independently verify the result.'])
    assert.equal(policy.deferConversationRepair(text,context()),true)
})
for (const text of [
  'The interactive comparison is ready below.', '@peer Please independently verify the result.', '- Specialist `@peer` Please independently verify the result.',
  '> 协作交接：@peer Please verify this.', '协作交接：@all Please verify this.', '协作交接：@outside Please verify this.',
  '@agent I will finish this later.', '@human Please wait.', '@outside Finish this.', '@missing Finish this.', '@Reviewer Finish this.', '@all Finish this.',
  '> @peer Please verify this.', '```text\n@peer Please verify this.\n```', '`print("@peer")` Please verify this.',
  '[Ask @peer](https://example.test)', 'https://example.test/@peer', 'person@peer.example.test', '@peer-suffix Please verify this.',
]) test(`does not defer for ${JSON.stringify(text)}`,() => {
  assert.equal(policy.deferConversationRepair(text,context()),false)
})
test('internal, missing-roster and removed-audience cases cannot defer',() => {
  for (const change of ['internal','roster','audience','conversationTurn'] as const) {
    const c = context()
    if (change === 'internal') c.work.conversation!.internal = true
    if (change === 'roster') c.dynamic!.roster = undefined
    if (change === 'audience') c.work.conversation!.audience.participantIds = ['agent','human']
    if (change === 'conversationTurn') c.work.meta!.conversationTurn = false
    assert.equal(policy.deferConversationRepair('协作交接：@peer Please verify the result.',c),false,change)
  }
})
