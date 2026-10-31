import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleHarness, executionSnapshot, skillIndex, type TurnContext } from '@lyyzka/lingxios'
import { createProductHarness } from '../agent-runtime/harness.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { productSkills } from '../agent-runtime/system-skills.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { artifactReferencePages, readArtifactReference } from '../modules/artifacts/skills.js'
import { runtimeModelConfiguration } from '../agent-runtime/runtime.js'

const tools = createProductTools(() => { throw new Error('not used') }).filter(tool => tool.action !== 'memory.summary')
const harness = assembleHarness(createProductHarness(tools))
function context(): TurnContext {
  return { work: { id: 'run', tenantId: 'tenant', principalId: 'human', meta: { mode: 'execute' } },
    capabilities: [...harness.context.skills.flatMap(skill => skill.actions.map(action => action.split('.')[0])), 'skills', 'observations'],
    grants: [...new Set([...tools.map(tool => tool.action.split('.')[0]), 'skills', 'observations'])].map(name => ({ name })),
    tools: [...harness.tools, { name: 'skills__load', action: 'skills.load', effect: 'read', parameters: { type: 'object', properties: {}, additionalProperties: false }, description: 'load' }],
    harness: harness.context, snapshotVersion: { requestVersion: 1 }, executionSteps: [], persona: {}, messages: [],
  } as unknown as TurnContext
}
const policy = new ProductRuntimePolicy()
function selected(ctx: TurnContext, ok: boolean, overrides = {}) {
  const index = skillIndex(productSkills.find(skill => skill.name === 'claude-design')!)
  ctx.executionSteps = [{ id: 'load', artifacts: [], requestVersion: 1, kind: 'skills__load', input: { arguments: JSON.stringify({ name: index.name, version: index.version, hash: index.hash, ...overrides }) },
    output: JSON.stringify({ receipts: [{ action: 'skills.load', result: { ok, ...(ok ? { value: index } : { code: 'forbidden' }) } }] }) }] as TurnContext['executionSteps']
}
const permits = (ctx: TurnContext, action: string) => policy.kernelCapabilities(ctx).some(grant => grant.name === action.split('.')[0] && (!grant.methods || grant.methods.includes(action.split('.')[1])))

test('first decision contains current skill routes and exact dependent schemas before guidance is loaded', () => {
  const ctx = context(), rules = policy.productRules({} as never, ctx)
  assert.match(rules, /skills\.load.*no delivery|no delivery.*skills\.load/)
  assert.match(rules, /claude-design/)
  assert.match(rules, /format\.md/)
  assert.match(rules, /additionalProperties/)
  assert.equal(permits(ctx, 'design.read_reference'), false)
  assert.equal(permits(ctx, 'skills.load'), true)
  selected(ctx, true)
  assert.equal(permits(ctx, 'design.read_reference'), true)
  assert.match(policy.productRules({} as never, ctx), /Complete registered system skill/)
})

test('failed, stale, changed and revoked selections never unlock guidance-dependent actions', () => {
  const ctx = context()
  selected(ctx, false); assert.equal(permits(ctx, 'design.write_files'), false)
  selected(ctx, true, { hash: 'changed' }); assert.equal(permits(ctx, 'design.write_files'), false)
  selected(ctx, true); ctx.executionSteps![0].kind = 'skills__activate'; assert.equal(permits(ctx, 'design.write_files'), false)
  selected(ctx, true); ctx.snapshotVersion!.requestVersion = 2; assert.equal(permits(ctx, 'design.write_files'), false)
  ctx.snapshotVersion!.requestVersion = 1; ctx.grants = ctx.grants!.filter(grant => grant.name !== 'design')
  assert.equal(permits(ctx, 'design.write_files'), false)
  assert.doesNotMatch(policy.productRules({} as never, ctx), /Complete registered system skill.*claude-design/)
})

test('the first directory survives runtime exposure narrowing and preserves registered delivery workflows', () => {
  const ctx = context(), snapshot = executionSnapshot(ctx, policy)
  ctx.tools = snapshot.tools
  const rules = policy.productRules({} as never, ctx)
  assert.ok(rules.includes(skillIndex(productSkills.find(skill => skill.name === 'claude-design')!).hash))
  assert.match(rules, /"selectionAction":"skills.load"/)
  assert.match(rules, /"selectionAction":"skills.activate"/)
  assert.match(rules, /explanationBeforeAuthoring/)
  assert.match(rules, /"required":\["page"\]/)
})

test('reference admission and first description use the actual deployed directory', async () => {
  const reference = tools.find(tool => tool.action === 'design.read_reference')!
  assert.deepEqual((reference.parameters.properties.page as { enum: string[] }).enum, artifactReferencePages('design'))
  assert.match(reference.description, /format\.md/)
  assert.match(await readArtifactReference('design', String(reference.parse({ page: 'format.md' }).page)), /authoring format/)
  for (const page of ['canvas.md', 'artboard.md', 'design-component.md', 'index.md']) assert.throws(() => reference.parse({ page }))
  await assert.rejects(readArtifactReference('design', 'canvas.md'), /pages:.*format.md/)
})

test('DeepSeek output-first binding is explicit in each business tool contract', () => {
  const model = runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'unit-only' }, 90_000)
  assert.equal(model.publicAnswerTool, 'native-v2')
  assert.equal(model.capabilities.parallelTools, true)
  assert.equal(model.publicTextProtocol, 'purpose-json-v3')
  assert.equal(model.publicTextContinuation, 'typed-message-v1')
  for (const tool of harness.tools) assert.match(tool.description, /public_answer at index 0.*SAME generation/)
})

test('a Design write cannot declare satisfaction without a subsequent successful zero-problem check', () => {
  const ctx = context(), assessment = { status: 'satisfied' as const, checks: [], gaps: [] }
  ctx.executionSteps = [{ id: 'write', kind: 'design__write_files', artifacts: [], requestVersion: 1, input: {}, output: '{}' }]
  assert.ok(policy.validateCompletion('', assessment, ctx))
  ctx.executionSteps.push({ id: 'check', kind: 'design__check', artifacts: [], requestVersion: 1, input: {}, output: JSON.stringify({ receipts: [{ action: 'design.check', result: { ok: true, value: { problems: 2 } } }] }) })
  assert.ok(policy.validateCompletion('', assessment, ctx))
  ctx.executionSteps[1].output = JSON.stringify({ receipts: [{ action: 'design.check', result: { ok: true, value: { problems: 0 } } }] })
  assert.equal(policy.validateCompletion('', assessment, ctx), null)
  ctx.executionSteps.push({ ...ctx.executionSteps[0], id: 'new-write' })
  assert.ok(policy.validateCompletion('', assessment, ctx), 'a check before the newest write is stale')
  assert.equal(policy.validateCompletion('', { ...assessment, status: 'partial' }, ctx), null)
})
