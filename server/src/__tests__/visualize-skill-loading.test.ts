import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assembleHarness, buildPromptContext, skillIndex, type SkillDefinition, type ToolDefinition, type TurnContext } from '@lyyzka/lingxios'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { selectedSkillRules } from '../agent-runtime/skill-context.js'
import { createProductHarness, productSkills } from '../agent-runtime/harness.js'
import { visualizeHostInstructions, visualizeSkill, visualizeSkillAdaptations } from '../agent-runtime/visualize-skill.js'
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
  assert.match(prompt.systemInstructions, /do not reload or paginate/i)
  assert.match(prompt.systemInstructions, /public explanation/i)
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

test('first-turn authoring route precedes documentation reads while load-only stays read-only', () => {
  const instructions = visualizeHostInstructions('/authorized/output')
  assert.match(instructions, /explicitly requests.*skills\.activate/i)
  assert.match(instructions, /before.*(?:loading|reference)/i)
  assert.match(instructions, /promise.*(?:delivery|completion)/i)
  assert.match(instructions, /(?:read.only|Loading references).*do not activate/i)
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

// Failure model: docs/evidence/issue-366/EARLY-ANSWER-PROMPT-FAILURE-MODEL.md.
test('initial and selected visualization guidance use the declared answer channel without an extra preamble turn', () => {
  const selected = context(), initial = context(undefined, false)
  const previous = buildPromptContext(selected, policy, 0)
  const restored = buildPromptContext({ ...selected, promptContextCandidate: previous }, policy, 2)
  for (const instructions of [buildPromptContext(initial, policy, 0).systemInstructions, previous.systemInstructions, restored.systemInstructions]) {
    assert.match(instructions, /public answer channel specified by the trusted model driver/)
    assert.match(instructions, /same response as a necessary native tool call/)
    assert.match(instructions, /Do not add a separate preamble turn/)
    assert.match(instructions, /do not repeat already delivered answer text/)
    assert.match(instructions, /Do not claim a future tool result/)
    assert.match(instructions, /Plain companion prose.*not.*public answer/)
    assert.match(instructions, /When the request or trusted workflow restricts the answer to supplied facts, use only supplied facts and verified tool results/)
    assert.match(instructions, /Otherwise established general knowledge remains available without mandatory retrieval/)
    assert.match(instructions, /label any necessary inference/)
    assert.match(instructions, /Do not add unsolicited review invitations or assign work to yourself/)
    assert.match(instructions, /Native lifecycle events already show tool activity/)
    assert.match(instructions, /do not report each tool separately/)
    assert.doesNotMatch(instructions, /streaming in ordinary response text/)
    assert.equal(instructions.split('Do not add a separate preamble turn').length, 2, 'Complete channel guidance occurs once')
  }
  for (const instructions of [visualizeHostInstructions('/authorized/output'), visualizeSkillAdaptations]) {
    assert.match(instructions, /public answer channel specified by the trusted model driver/)
    assert.doesNotMatch(instructions, /streaming in ordinary response text/)
    assert.doesNotMatch(instructions, /Do not add a separate preamble turn/)
  }
  assert.notEqual(visualizeSkill.version, '0a1fc56d279fd1001f78387bd81aec1c26767411-host-readback-2')
  assert.notEqual(createProductHarness(tools).version, '3.8.6-conditional-readback-2')
})

// Failure model: docs/evidence/issue-366/DRIVER-FRAMING-CONSISTENCY.md (written first).
test('product and visualization instructions defer wire encoding and branch selection to the trusted driver', () => {
  const selected = context(), previous = buildPromptContext(selected, policy, 0)
  const instructions = [
    createProductHarness(tools).rules!,
    buildPromptContext(context(undefined, false), policy, 0).systemInstructions,
    previous.systemInstructions,
    buildPromptContext({ ...selected, promptContextCandidate: previous }, policy, 2).systemInstructions,
    visualizeHostInstructions('/authorized/output'),
    visualizeSkillAdaptations,
  ]
  for (const text of instructions) {
    assert.doesNotMatch(text, /complete native object|outcome\s*:\s*null|Follow its field order|tools remain native tool_calls|product harness governs response framing/i)
    assert.match(text, /trusted model driver.*(?:wire|encoding)/i)
  }
  assert.notEqual(createProductHarness(tools).version, '3.8.9-public-answer-channel-1')
  assert.notEqual(visualizeSkill.version, '0a1fc56d279fd1001f78387bd81aec1c26767411-host-answer-channel-3')
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
  assert.match(skill.body, /declared public `answer` field/)
  assert.match(skill.body, /native response framing/)
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
  const crowded = { ...visualizeSkill, body: 'x'.repeat(63000) + '\nFINAL_CONSTRAINT' }
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
