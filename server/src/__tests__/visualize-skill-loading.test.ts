import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assembleHarness, buildPromptContext, skillIndex, type SkillDefinition, type ToolDefinition, type TurnContext } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { selectedSkillRules } from '../agent-runtime/skill-context.js'
import { createProductHarness, productSkills } from '../agent-runtime/harness.js'
import { visualizeHostInstructions, visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { visualizeTools } from '../agent-runtime/visualize-tools.js'

// Failure model: docs/evidence/feedback-272/FAILURE-MODEL.md (written first).
const tools: ToolDefinition[] = visualizeSkill.actions.map(action => ({ action, name: action.replace('.', '__'), description: 'Synthetic authorized tool.',
  parameters: { type: 'object', properties: {}, additionalProperties: false }, effect: 'read', approval: false, parse: () => ({}), authorize: async () => {}, execute: async () => ({ ok: true }) }))
const policy = new ProductRuntimePolicy()
function context(skill?: SkillDefinition, selected = true): TurnContext {
  const profile = createProductHarness(tools)
  if (skill) {
    const capability = profile.capabilities.find(item => item.id === 'visualize')!
    capability.skills = [skill]
  }
  const harness = assembleHarness(profile)
  const index = skillIndex(skill ?? visualizeSkill)
  const selection = { id: 'select', kind: 'skills__load', requestVersion: 1, input: { arguments: JSON.stringify({ name: index.name, version: index.version, hash: index.hash }) }, output: '{}', artifacts: [] }
  return { work: { id: 'fixture', tenantId: 'tenant', principalId: 'human', agentId: 'agent', sessionId: 'session', triggerRef: 'source', kind: 'turn', lane: 'interactive', fence: 1, homeEpoch: 1, leaseToken: 'fixture', meta: { codeExecution: 'disabled' } },
    persona: { name: 'Tutor', role: 'assistant', instructions: '' }, capabilities: ['visualize', 'chat'], grants: [{ name: 'visualize' }, { name: 'chat' }, { name: 'skills', methods: ['load'] }], messages: [],
    snapshotVersion: { fence: 1, requestVersion: 1, sessionRevision: 1 }, executionSteps: selected ? [selection] : [],
    tools: [...harness.tools, { ...tools[0], name: 'skills__load', action: 'skills.load' }], harness: harness.context }
}

test('only the requested system skill enters the next prompt completely without pagination', () => {
  assert.equal(buildPromptContext(context(undefined, false), policy, 0).systemInstructions.includes(visualizeSkill.body), false)
  const current = context(), prompt = buildPromptContext(current, policy, 0)
  assert.ok(prompt.systemInstructions.includes(visualizeSkill.body))
  assert.equal(prompt.systemInstructions.split(visualizeSkill.body).length, 2)
  assert.ok(prompt.systemInstructions.includes(skillIndex(visualizeSkill).hash))
  assert.match(prompt.systemInstructions, /registered bodies remain complete.*after compaction/i)
  assert.match(prompt.systemInstructions, /Publish supported explanations/i)
  const rule = prompt.blocks!.find(block => block.source === 'product:rules')!
  assert.equal(rule.truncated, false)
  const restored = buildPromptContext({ ...current, promptContextCandidate: prompt }, policy, 2)
  assert.ok(restored.systemInstructions.includes(visualizeSkill.body), 'compaction/restart needs no observation cursor')
})

// Failure model: docs/evidence/issue-342/FAILURE-MODEL.md (written first).
test('explicit authoring selects the complete current skill without a preceding load', () => {
  const current = context()
  current.grants = current.grants!.map(grant => grant.name === 'skills' ? { name: 'skills', methods: ['load', 'activate'] } : grant)
  current.tools!.push({ ...tools[0], name: 'skills__activate', action: 'skills.activate' })
  current.executionSteps![0].kind = 'skills__activate'
  assert.ok(selectedSkillRules(current).includes(visualizeSkill.body))
  const activateOnly = { ...current, tools: current.tools!.filter(tool => tool.action !== 'skills.load'),
    grants: current.grants!.map(grant => grant.name === 'skills' ? { name: 'skills', methods: ['activate'] } : grant) }
  assert.ok(selectedSkillRules(activateOnly).includes(visualizeSkill.body), 'activation selection must not require a redundant load permission')
  assert.equal(selectedSkillRules({ ...current, snapshotVersion: { fence: 1, requestVersion: 2, sessionRevision: 2 } }), '')
  assert.equal(selectedSkillRules({ ...current, grants: current.grants!.map(grant => grant.name === 'skills' ? { name: 'skills', methods: ['load'] } : grant) }), '')
  const { name, version } = skillIndex(visualizeSkill)
  current.executionSteps![0].input.arguments = JSON.stringify({ name, version, hash: 'stale' })
  assert.equal(selectedSkillRules(current), '')
})

test('optional explanation selection requires a successful current activation and exact declaration shape', () => {
  const current = context(), index = skillIndex(visualizeSkill)
  const explanation = { explanationQuote: 'Explain the two stages.', authoringQuote: 'Create an interactive view.', factQuotes: ['Gather then Check.'], languageQuote: 'Use English.' }
  current.grants!.push({ name: 'skills', methods: ['activate'] })
  current.tools!.push({ ...tools[0], name: 'skills__activate', action: 'skills.activate' })
  const step = current.executionSteps![0]
  step.kind = 'skills__activate'
  const args = { name: index.name, version: index.version, hash: index.hash, explanation }
  step.input.arguments = JSON.stringify(args)
  step.output = JSON.stringify({ receipts: [{ action: 'skills.activate', result: { ok: true, value: { activation: {
    id: 'native-activation', tenantId: current.work.tenantId, runId: current.work.id, requestVersion: 1,
    skill: { name: index.name, version: index.version, hash: index.hash }, checker: 'product:visualize-delivery',
  } } } }] })
  const successful = step.output
  assert.ok(selectedSkillRules(current).includes(visualizeSkill.body))
  for (const invalid of [{ ...args, extra: true }, { ...args, explanation: { ...explanation, extra: true } },
    { ...args, explanation: { ...explanation, factQuotes: [] } }, { ...args, explanation: { ...explanation, explanationQuote: '' } }]) {
    step.input.arguments = JSON.stringify(invalid)
    assert.equal(selectedSkillRules(current), '')
  }
  step.input.arguments = JSON.stringify(args)
  for (const output of [undefined, '{}', '{"receipts":[{"action":"skills.activate","result":{"ok":false}}]}',
    successful.replace('"runId":"fixture"', '"runId":"other"'), successful.replace('"requestVersion":1', '"requestVersion":2')]) {
    step.output = output
    assert.equal(selectedSkillRules(current), '')
  }
  step.output = successful
  step.kind = 'skills__load'
  assert.equal(selectedSkillRules(current), '', 'load never accepts the activation-only declaration')
})

test('truncated activation keeps full skill only through exact native stage provenance', () => {
  const current = context(), { name, version, hash } = skillIndex(visualizeSkill)
  const explanation = { explanationQuote: 'Explain.', authoringQuote: 'Create.', factQuotes: ['Gather then Check.'] }
  current.grants!.push({ name: 'skills', methods: ['activate'] })
  current.tools!.push({ ...tools[0], name: 'skills__activate', action: 'skills.activate' })
  const step = current.executionSteps![0]
  step.kind = 'skills__activate'
  step.input.arguments = JSON.stringify({ name, version, hash, explanation })
  step.output = '{"truncated":true,"preview":"not authority"}'
  const quote = (text: string) => ({ sourceRef: 'source', start: 0, end: text.length, text })
  const stage: NonNullable<TurnContext['explanationStage']> = { version: 1, id: 'native-stage', activationId: 'native-activation', runId: current.work.id, requestVersion: 1,
    sourceRef: 'source', requestHash: 'native-current-request-hash', skill: { name, version, hash },
    quotes: { explanation: quote(explanation.explanationQuote), authoring: quote(explanation.authoringQuote), facts: explanation.factQuotes.map(quote) },
    authoringActions: ['visualize.save', 'visualize.chart', 'visualize.diagram', 'visualize.sliding_window'], status: 'pending' }
  assert.equal(selectedSkillRules(current), '')
  current.explanationStage = stage
  assert.ok(selectedSkillRules(current).includes(visualizeSkill.body))
  for (const patch of [{ runId: 'other' }, { requestVersion: 2 }, { stale: true }, { skill: { name, version, hash: 'old' } },
    { quotes: { ...stage.quotes, explanation: quote('Different request.') } }]) {
    current.explanationStage = { ...stage, ...patch }
    assert.equal(selectedSkillRules(current), '')
  }
  current.explanationStage = { ...stage, status: 'provided', provided: { partId: 'native-part', bodyHash: 'native-body-hash' } }
  assert.ok(selectedSkillRules(current).includes(visualizeSkill.body), 'provided stage still retains complete guidance')
  assert.equal(selectedSkillRules({ ...current, grants: [] }), '', 'stage proof never grants permission')
})

test('authoring activation and reference-only selection retain distinct obligations', () => {
  const instructions = visualizeHostInstructions('/authorized/output')
  assert.match(instructions, /skills\.activate.*requested authoring/i)
  assert.match(instructions, /skills\.load for documentation or existing-view reads and exports/i)
  assert.match(instructions, /completion requires the verified saved reference or a truthful non-delivery outcome/i)
  assert.match(createProductHarness(tools).rules!, /skills\.activate/)
  for (const action of ['visualize.save', 'visualize.read_reference']) {
    assert.match(visualizeTools.find(tool => tool.action === action)!.description, /skills\.activate/)
  }
  const current = context()
  assert.equal(current.executionSteps![0].kind, 'skills__load')
  assert.ok(selectedSkillRules(current).includes(visualizeSkill.body), 'load still supplies guidance without declaring authoring')
})

test('revoked tools remove preloaded skill even when a stale prompt is supplied', () => {
  const current = context(), old = buildPromptContext(current, policy, 0)
  for (const denied of [[], [{ name: 'visualize', methods: ['read_reference'] }]]) {
    const prompt = buildPromptContext({ ...current, grants: denied, promptContextCandidate: old }, policy, 1)
    assert.equal(prompt.systemInstructions.includes(visualizeSkill.body), false)
  }
  assert.equal(buildPromptContext({ ...current, responseProfile: 'fast' }, policy, 1).systemInstructions.includes(visualizeSkill.body), false)
  assert.equal(buildPromptContext({ ...current, work: { ...current.work, meta: { mode: 'chat' } } }, policy, 1).systemInstructions.includes(visualizeSkill.body), false)
})

test('duplicate literal readback is conditional on visible current original and matched host proof', () => {
  const instructions = visualizeHostInstructions('/authorized/output')
  assert.match(instructions, /complete literal original.*current request.*current context/i)
  assert.match(instructions, /readback\.status.*matched.*version.*sourceHash/i)
  for (const condition of ['restored', 'truncated', 'missing', 'changed', 'known']) assert.ok(instructions.includes(condition))
  assert.match(instructions, /otherwise.*visualize\.read/i)
  assert.match(instructions, /not.*semantic.*browser/i)
  assert.notEqual(visualizeSkill.version, '0a1fc56d279fd1001f78387bd81aec1c26767411')
  assert.notEqual(createProductHarness(tools).version, '3.8.6-on-demand-evidence-1')
})

// Failure model: docs/evidence/issue-366/CONDITIONAL-STAGE-FAILURE-MODEL.md.
test('initial, selected and restored prompts retain one driver-owned channel contract', () => {
  const selected = context(), initial = context(undefined, false)
  const previous = buildPromptContext(selected, policy, 0)
  const restored = buildPromptContext({ ...selected, promptContextCandidate: previous }, policy, 2)
  const channel = 'The trusted model driver owns public answer delivery and wire encoding.'
  for (const instructions of [buildPromptContext(initial, policy, 0).systemInstructions, previous.systemInstructions, restored.systemInstructions]) {
    assert.equal(instructions.split(channel).length, 2)
    assert.match(instructions, /Publish supported explanations through that channel/)
    assert.match(instructions, /companion text and private reasoning are internal/)
    assert.match(instructions, /supplied facts and verified tool results for source-restricted tasks/)
    assert.match(instructions, /otherwise established general knowledge with inferences labelled/)
    assert.match(instructions, /Describe completed tool results from their receipts/)
    assert.match(instructions, /Native lifecycle events show routine tool activity/)
    assert.doesNotMatch(instructions, /same response as a necessary native tool call|including alongside necessary tools|Do not add status-only preambles|final response must be your first user-facing message|overrides the upstream/)
    assert.doesNotMatch(instructions, /complete native object|outcome\s*:\s*null|Follow its field order|product harness governs response framing/)
  }
  assert.notEqual(createProductHarness(tools).version, '3.8.11-driver-owned-framing-2')
  assert.notEqual(visualizeSkill.version, '0a1fc56d279fd1001f78387bd81aec1c26767411-host-driver-framing-5')
})

test('body and version independently invalidate the compiled full-skill identity', () => {
  const before = buildPromptContext(context(), policy, 0)
  for (const next of [{ ...visualizeSkill, version: 'next' }, { ...visualizeSkill, body: visualizeSkill.body + '\nChanged fixture constraint.' }]) {
    const current = context(next)
    current.productRules = selectedSkillRules(current, [next])
    const after = buildPromptContext({ ...current, promptContextCandidate: before }, policy, 1)
    assert.notEqual(after.fingerprint, before.fingerprint)
    assert.notEqual(after.manifest!.prefix.sha256, before.manifest!.prefix.sha256)
    assert.ok(after.systemInstructions.includes(next.body))
    assert.ok(after.systemInstructions.includes(skillIndex(next).hash))
  }
})

test('selected public progress skill keeps plan identity while using native answer framing', () => {
  const skill = productSkills.find(item => item.name === 'public-task-progress')!
  assert.match(skill.body, /trusted model driver's public channel/)
  assert.match(skill.body, /user's language/)
  assert.doesNotMatch(skill.body, /ordinary answer/)
  assert.match(skill.body, /preserve each public item id/)
  assert.match(skill.body, /stable step ids and activeIndex/)
  assert.match(skill.body, /meaningful transitions/)
  assert.notEqual(skill.version, '1')
})

test('long skills preserve the last constraint and reject over-budget or empty bodies instead of truncating', () => {
  const long = { ...visualizeSkill, body: 'x'.repeat(62000) + '\nFINAL_CONSTRAINT' }
  const current = context(long)
  current.productRules = selectedSkillRules(current, [long])
  assert.ok(Buffer.byteLength(current.productRules) <= 64000)
  const prompt = buildPromptContext(current, policy, 0)
  assert.ok(prompt.systemInstructions.includes(long.body))
  const crowded = { ...visualizeSkill, body: 'x'.repeat(63900) + '\nFINAL_CONSTRAINT' }
  assert.throws(() => selectedSkillRules(context(crowded), [crowded]), /complete-context budget/)
  assert.throws(() => selectedSkillRules(context(), [{ ...visualizeSkill, body: 'x'.repeat(64001) }]), /invalid authored skill/)
  assert.throws(() => selectedSkillRules(context(), [{ ...visualizeSkill, body: '' }]), /invalid authored skill/)
})


test('every built-in skill supports exact on-demand selection, while stale version, uncompleted step and a new request do not', () => {
  for (const skill of productSkills) {
    const { name, version, hash } = skillIndex(skill)
    const current = context()
    current.harness!.skills = [skillIndex(skill)]
    current.tools = [...current.tools!, ...skill.actions.map(action => ({ ...tools[0], action, name: action.replace('.', '__') }))]
    current.grants = [...new Set(current.tools.map(tool => tool.action.split('.')[0]))].map(name => ({ name }))
    current.executionSteps![0].input.arguments = JSON.stringify({ name, version, hash })
    assert.ok(selectedSkillRules(current).includes(skill.body), name)
    assert.equal(selectedSkillRules({ ...current, snapshotVersion: { fence: 1, requestVersion: 2, sessionRevision: 2 } }), '')
    assert.equal(selectedSkillRules({ ...current, executionSteps: [{ ...current.executionSteps![0], output: undefined }] }), '')
    current.executionSteps![0].input.arguments = JSON.stringify({ name, version: 'stale', hash })
    assert.equal(selectedSkillRules(current), '')
  }
})

test('duplicate requests, failed previews and EOF cursors cannot duplicate or truncate the supplied skill', () => {
  const current = context()
  current.executionSteps = [current.executionSteps![0], { ...current.executionSteps![0], id: 'retry', output: '{"truncated":true,"preview":"not complete"}' },
    { id: 'range', requestVersion: 1, kind: 'observations__read', input: { arguments: '{"next":null}' }, output: '{"ok":false}', artifacts: [] }]
  assert.equal(selectedSkillRules(current).split(visualizeSkill.body).length, 2)
  current.executionSteps![0].output = '{"ok":false}'
  assert.ok(selectedSkillRules(current).includes(visualizeSkill.body), 'the trusted local body is independent of a failed redundant tool response')
})
