import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleHarness, skillIndex, type TurnContext } from '@lingxi-org/lingxios'
import { createProductHarness } from '../agent-runtime/harness.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { PUBLIC_ANSWER_RULES, KNOWLEDGE_CITATION_RULES } from '../agent-runtime/public-answer-rules.js'
import { selectedSkillRules } from '../agent-runtime/skill-context.js'
import { productSkills } from '../agent-runtime/system-skills.js'

// This checks trusted guidance admission and conflicting-rule regression. It
// does not pretend a scripted model proves live-provider disclosure behavior.
test('ordinary policy and selected public-progress guidance cover all visible output without a second model', () => {
  const harness = assembleHarness(createProductHarness([]))
  const ctx = { work: { id: 'run', tenantId: 'tenant', principalId: 'human' },
    capabilities: ['chat', 'skills'], grants: [{ name: 'chat' }, { name: 'skills' }],
    tools: [{ name: 'chat__report_progress', action: 'chat.report_progress' }, { name: 'skills__load', action: 'skills.load' }],
    harness: harness.context, messages: [], persona: { name: 'Agent', role: 'assistant', instructions: '' },
    productRules: PUBLIC_ANSWER_RULES + KNOWLEDGE_CITATION_RULES, snapshotVersion: { requestVersion: 1 } } as unknown as TurnContext
  const rules = new ProductRuntimePolicy().productRules({} as never, ctx)
  assert.ok(rules.includes(PUBLIC_ANSWER_RULES))
  const index = skillIndex(productSkills.find(skill => skill.name === 'public-task-progress')!)
  ctx.executionSteps = [{ id: 'load', kind: 'skills__load', requestVersion: 1, artifacts: [],
    input: { arguments: JSON.stringify({ name: index.name, version: index.version, hash: index.hash }) },
    output: JSON.stringify({ receipts: [{ action: 'skills.load', result: { ok: true, value: index } }] }) }]
  const selected = selectedSkillRules(ctx)
  assert.ok(selected.includes(PUBLIC_ANSWER_RULES), 'the actual selected body, including after compaction, retains public guidance')
  for (const text of [rules, selected]) {
    assert.match(text, /plan titles and steps, citations, parentheses, tables and links/)
    assert.match(text, /instead of reciting fields or translating a record field by field/)
    assert.match(text, /Never invent a name or output “@未识别成员” as an author placeholder/)
    assert.match(text, /never hide a failure or fabricate a successful read/)
    assert.match(text, /explicit human request.*minimum directly relevant, authorized technical detail/)
    assert.match(text, /never permits credentials, tokens or unrelated private data, even in code, quoted JSON, tables or URLs/)
  }
})

test('course guidance allows source titles and preserves excerpt scope and observed retrieval failures', () => {
  const skill = productSkills.find(skill => skill.name === 'course-evidence')!
  assert.ok(skill.body.includes(KNOWLEDGE_CITATION_RULES))
  assert.match(skill.body, /Each citation marker identifies its own returned excerpt/)
  assert.match(skill.body, /does not change an earlier failed search into a successful search/)
  assert.doesNotMatch(skill.body, /Cite the supported answer wording, not/)
  assert.match(KNOWLEDGE_CITATION_RULES, /when no original link is available.*recorded excerpt/)
})
