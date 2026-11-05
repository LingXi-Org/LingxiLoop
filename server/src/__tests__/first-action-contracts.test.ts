import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleHarness, executionSnapshot, skillIndex, type TurnContext } from '@lyyzka/lingxios'
import { createProductHarness } from '../agent-runtime/harness.js'
import { DESIGN_INCOMPLETE_NOTICE, ProductRuntimePolicy } from '../agent-runtime/context.js'
import { productSkills } from '../agent-runtime/system-skills.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { artifactReferencePages, readArtifactReference } from '../modules/artifacts/skills.js'
import { runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { designExplanationRules } from '../agent-runtime/skill-context.js'
import { decideScaffold } from '../modules/learning/teaching-scaffold.js'

const tools = createProductTools(() => { throw new Error('not used') }).filter(tool => tool.action !== 'memory.summary')
const harness = assembleHarness(createProductHarness(tools))
function context(): TurnContext {
  return { work: { id: 'run', tenantId: 'tenant', principalId: 'human', kind: 'turn', meta: { mode: 'execute' } },
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

test('the first directory survives runtime exposure narrowing without the retired workflow', () => {
  const ctx = context(), snapshot = executionSnapshot(ctx, policy)
  ctx.tools = snapshot.tools
  const rules = policy.productRules({} as never, ctx)
  assert.ok(rules.includes(skillIndex(productSkills.find(skill => skill.name === 'claude-design')!).hash))
  assert.match(rules, /"selectionAction":"skills.load"/)
  assert.doesNotMatch(rules, /"name":"visualize"|visualize\./)
  assert.equal(productSkills.some(skill => skill.name === 'visualize'), false)
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
test('Design file encoding guidance round-trips literal quotes, backslashes and newlines without changing Slides', () => {
  const content = '<div title="QK" data-demo="a\\b">\nQK\n</div>'
  const design = tools.find(tool => tool.action === 'design.write_files')!
  const slides = tools.find(tool => tool.action === 'slides.write_files')!
  const encoded = JSON.stringify({ content })
  assert.ok(design.description.includes(encoded))
  assert.equal(slides.description.includes(encoded), false)
  const input = JSON.parse(JSON.stringify({ files: { 'project/Example.dc.html': { content, ifMatch: null } } }))
  assert.deepEqual(design.parse(input), input)
})

test('semantic Design guidance selects the exact skill without a keyword-based generic forced load', () => {
  const ctx = context()
  ctx.work.triggerRef = 'request'
  ctx.messages = [{ ref: 'request', authorId: 'human', authorName: 'Human', authorKind: 'human', body: '为我在画板中讲解flashattention', createdAt: '2026-10-31T00:00:00Z' }]
  const index = skillIndex(productSkills.find(skill => skill.name === 'claude-design')!)
  for (const question of ['为我在画板中讲解flashattention', '我零基础，想理解概率分布', '解释一下DNS请求的全过程', '比较自建数据库和托管服务', '你好', '只要文字解释注意力机制']) {
    ctx.messages[0].body = question
    const rules = designExplanationRules(ctx)
    assert.ok(rules.includes(JSON.stringify({ name: index.name, version: index.version, hash: index.hash })))
    assert.match(rules, /meaning and complexity/)
    assert.match(rules, /greetings and direct factual answers/)
    assert.match(rules, /text-only request/)
    assert.equal(policy.requiredTool(ctx), 'design__plan_explanation')
  }
  selected(ctx, false); assert.match(designExplanationRules(ctx), /skills.load with exactly/)
  selected(ctx, true); assert.match(designExplanationRules(ctx), /already successfully loaded/)
  assert.doesNotMatch(designExplanationRules(ctx), /skills.load with exactly/)
  ctx.executionSteps = []
  const other = skillIndex(productSkills.find(skill => skill.name === 'research-evidence')!)
  ctx.executionSteps = [{ id: 'other', kind: 'skills__load', artifacts: [], requestVersion: 1, input: { arguments: JSON.stringify({name:other.name,version:other.version,hash:other.hash}) }, output: JSON.stringify({receipts:[{action:'skills.load',result:{ok:true}}]}) }]
  assert.match(designExplanationRules(ctx), /skills.load with exactly/)
  assert.equal(permits(ctx, 'design.write_files'), false)
  ctx.grants = ctx.grants!.filter(grant => grant.name !== 'design')
  assert.match(designExplanationRules(ctx), /Design is unavailable/)
  assert.doesNotMatch(designExplanationRules(ctx), /skills.load with exactly/)
  ctx.work.conversation = { internal: true } as typeof ctx.work.conversation
  assert.equal(designExplanationRules(ctx), '')
})

test('semantic planning is scoped, bounded, and selects only the exact current Design guidance', () => {
  const ctx = context()
  const planned = (delivery: string, ok = true) => {
    ctx.executionSteps = [{id:'plan',kind:'design__plan_explanation',requestVersion:1,artifacts:[],input:{arguments:JSON.stringify({delivery})},
      output:JSON.stringify({receipts:[{action:'design.plan_explanation',result:{ok,value:{delivery}}}]})}]
  }
  assert.equal(policy.requiredTool(ctx), 'design__plan_explanation')
  planned('text'); assert.equal(policy.requiredTool(ctx), undefined)
  assert.equal(permits(ctx,'design.available_agents'),false,'a text response does not start unrelated canvas collaboration')
  assert.equal(permits(ctx,'design.plan_explanation'),false,'an attempted planning call leaves the model catalog for this request')
  planned('other'); assert.equal(policy.requiredTool(ctx), undefined)
  planned('canvas'); assert.equal(policy.requiredTool(ctx), 'skills__load')
  assert.match(policy.validateCompletion('', {status:'satisfied',checks:[],gaps:[]},ctx)!, /actual saved and checked/)
  ctx.executionSteps!.push({...ctx.executionSteps![0],id:'changed-plan',input:{arguments:JSON.stringify({delivery:'text'})},
    output:JSON.stringify({receipts:[{action:'design.plan_explanation',result:{ok:true,value:{delivery:'text'}}}]})})
  assert.match(policy.validateCompletion('', {status:'satisfied',checks:[],gaps:[]},ctx)!, /actual saved and checked/, 'later decisions cannot erase the first confirmed canvas requirement')
  ctx.executionSteps!.push({id:'wrong',kind:'skills__load',requestVersion:1,artifacts:[],input:{arguments:'{}'},output:'{}'})
  assert.equal(policy.requiredTool(ctx), undefined, 'wrong or failed load is never forced in a loop')
  assert.equal(permits(ctx,'design.write_files'),false)
  planned('canvas',false); assert.equal(policy.requiredTool(ctx),undefined,'failed planning is bounded')
  ctx.executionSteps![0].requestVersion = 0
  assert.equal(policy.requiredTool(ctx),'design__plan_explanation','previous request cannot select this surface')
  ctx.work.conversation = {internal:true} as typeof ctx.work.conversation
  assert.equal(policy.requiredTool(ctx),undefined)
})

test('a semantic canvas decision follows confirmed prerequisites through a bounded native save/check path', () => {
  const ctx = context()
  selected(ctx,true)
  const receipt = (action:string,args:object,value:unknown={},ok=true) => ctx.executionSteps!.push({id:action,kind:action.replace('.','__'),requestVersion:1,artifacts:[],
    input:{arguments:JSON.stringify(args)},output:JSON.stringify({receipts:[{action,result:{ok,value}}]})})
  receipt('design.plan_explanation',{delivery:'canvas'},{delivery:'canvas'})
  assert.equal(policy.requiredTool(ctx),'design__read_reference')
  receipt('design.read_reference',{page:'format.md'},{})
  ctx.executionSteps!.at(-1)!.output = JSON.stringify({truncated:true,observations:[{actionKey:'native-reference',sha256:'a'.repeat(64)}],preview:'untrusted text'})
  assert.equal(policy.requiredTool(ctx),'design__current')
  receipt('design.current',{},null)
  assert.equal(policy.requiredTool(ctx),'design__ensure')
  receipt('design.ensure',{}, {artifactId:'canvas',result:{files:{'project/canvas.json':{},'project/ds/slides-builtin/tokens.json':{}}}})
  assert.equal(policy.requiredTool(ctx),'design__read_file')
  receipt('design.read_file',{path:'project/canvas.json'})
  assert.equal(policy.requiredTool(ctx),'design__read_file')
  receipt('design.read_file',{path:'project/ds/slides-builtin/tokens.json'})
  assert.equal(policy.requiredTool(ctx),'design__write_files')
  receipt('design.write_files',{}, {},false)
  assert.equal(policy.requiredTool(ctx),undefined,'failed native stages are not forced indefinitely')
  receipt('design.write_files',{files:{'project/Example.dc.html':{content:'<x-dc><h1>A saved explanation</h1></x-dc>'}}})
  assert.equal(policy.requiredTool(ctx),'design__check')
  receipt('design.check',{}, {problems:1})
  assert.equal(policy.requiredTool(ctx),'design__write_files')
  receipt('design.write_files',{})
  receipt('design.check',{}, {problems:1})
  assert.equal(policy.requiredTool(ctx),undefined,'three writes bound automatic checker repair')
  receipt('design.check',{}, {problems:0})
  assert.equal(policy.requiredTool(ctx),undefined)
  assert.ok(policy.validateCompletion('',{status:'satisfied',checks:[],gaps:[]},ctx),'zero-problem empty index does not deliver an explanatory artboard')
  ctx.executionSteps!.at(-1)!.output = JSON.stringify({receipts:[{action:'design.check',result:{ok:true,value:{problems:0,boardCount:1,checkedBoardPaths:['project/Example.dc.html']}}}]})
  assert.equal(policy.validateCompletion('',{status:'satisfied',checks:[],gaps:[]},ctx),null)
})

test('existing canvases without design-system files skip absent prerequisites and index-only edits cannot deliver an explanation', () => {
  const ctx = context()
  selected(ctx,true)
  const receipt = (action:string,args:object,value:unknown={}) => ctx.executionSteps!.push({id:action,kind:action.replace('.','__'),requestVersion:1,artifacts:[],
    input:{arguments:JSON.stringify(args)},output:JSON.stringify({receipts:[{action,result:{ok:true,value}}]})})
  receipt('design.plan_explanation',{delivery:'canvas'},{delivery:'canvas'})
  receipt('design.read_reference',{page:'format.md'})
  receipt('design.current',{}, {files:{'project/canvas.json':{},'project/Old.dc.html':{}}})
  receipt('design.read_file',{path:'project/canvas.json'})
  assert.equal(policy.requiredTool(ctx),'design__write_files','never invent a tokens file absent from the actual listing')
  receipt('design.write_files',{files:{'project/canvas.json':{content:'{"title":"New topic"}'}}})
  receipt('design.check',{}, {problems:0,boardCount:1,checkedBoardPaths:['project/Old.dc.html']})
  assert.match(policy.validateCompletion('',{status:'satisfied',checks:[],gaps:[]},ctx)!,/artboard content has not been saved/)
  receipt('design.write_files',{files:{'project/New.dc.html':{content:'<x-dc>A new explanation</x-dc>'}}})
  receipt('design.write_files',{files:{'project/New.dc.html':{delete:true},'project/canvas.json':{content:'{"boards":{"Old.dc.html":{}}}'}}})
  receipt('design.check',{paths:['project/New.dc.html']},{problems:0,boardCount:1,checkedBoardPaths:[]})
  assert.match(policy.validateCompletion('',{status:'satisfied',checks:[],gaps:[]},ctx)!,/subsequently deleted/)
  receipt('design.edit_file',{path:'project/Old.dc.html',newString:'<p>The actual requested explanation</p>'})
  receipt('design.check',{}, {problems:0,boardCount:1,checkedBoardPaths:['project/Old.dc.html']})
  assert.equal(policy.validateCompletion('',{status:'satisfied',checks:[],gaps:[]},ctx),null)
})

test('DeepSeek uses the explicitly qualified formal20 native-v3 binding', () => {
  const model = runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', baseUrl: 'https://api.siliconflow.cn/v1', apiKey: 'unit-only' }, 90_000)
  assert.equal(model.publicAnswerTool, 'native-v3')
  assert.equal(model.maxOutputTokens, 16_384)
  assert.equal(model.capabilities.parallelTools, true)
  assert.equal(model.publicTextProtocol, 'purpose-json-v3')
  assert.equal(model.publicTextContinuation, 'typed-message-v1')
})

test('a Design write cannot declare satisfaction without a subsequent successful zero-problem check', () => {
  const ctx = context(), assessment = { status: 'satisfied' as const, checks: [], gaps: [] }
  ctx.executionSteps = [{ id: 'write', kind: 'design__write_files', artifacts: [], requestVersion: 1, input: {}, output: JSON.stringify({receipts:[{action:'design.write_files',result:{ok:true}}]}) }]
  assert.ok(policy.validateCompletion('', assessment, ctx))
  ctx.executionSteps.push({ id: 'check', kind: 'design__check', artifacts: [], requestVersion: 1, input: {}, output: JSON.stringify({ receipts: [{ action: 'design.check', result: { ok: true, value: { problems: 2 } } }] }) })
  assert.ok(policy.validateCompletion('', assessment, ctx))
  ctx.executionSteps[1].output = JSON.stringify({ receipts: [{ action: 'design.check', result: { ok: true, value: { problems: 0 } } }] })
  assert.equal(policy.validateCompletion('', assessment, ctx), null)
  assert.equal(policy.validateAssistantText('讲解画板已经保存，可以打开 Design 查看。',ctx),null)
  assert.equal(policy.publicTextSafety({text:'画板已完成。',isFinal:false,approvedThrough:0},ctx).safeThrough,6)
  for (const output of [undefined, '{}', JSON.stringify({receipts:[{action:'design.write_files',result:{ok:false}}]}), JSON.stringify({receipts:[{action:'design.write_files',result:{ok:true,executionState:'unknown'}}]})]) {
    const original = ctx.executionSteps[0].output
    ctx.executionSteps[0].output = output
    assert.match(policy.validateCompletion('', assessment, ctx)!, /save was not confirmed/)
    assert.match(policy.validateAssistantText('讲解画板已经保存，可以打开 Design 查看。',ctx)!, /No finished canvas/)
    assert.equal(policy.publicTextSafety({text:'画板已完成。',isFinal:false,approvedThrough:0},ctx).safeThrough,0)
    assert.equal(policy.validateAssistantText(DESIGN_INCOMPLETE_NOTICE+'保存失败，先解释方法。',ctx),null)
    ctx.executionSteps[0].output = original
  }
  ctx.executionSteps.push({ ...ctx.executionSteps[0], id: 'new-write' })
  assert.ok(policy.validateCompletion('', assessment, ctx), 'a check before the newest write is stale')
  assert.equal(policy.validateCompletion('', { ...assessment, status: 'partial' }, ctx), null)
})


test('global, Design and teaching publication constraints compose without releasing rejected content', () => {
  const ctx = context()
  const scaffold = decideScaffold({ messages: [{ id: 'learner', text: '请帮我理解概念之间的关系' }], assessment: 'unknown' },
    { goal: 'reasoning', goalQuote: '概念之间的关系', intent: 'check', attempts: [], fullDemonstrationQuote: '' })
  ctx.dynamic = { teachingScaffold: scaffold }
  ctx.executionSteps = [{ id: 'plan', kind: 'design__plan_explanation', artifacts: [], requestVersion: 1,
    input: { arguments: JSON.stringify({ delivery: 'canvas' }) },
    output: JSON.stringify({ receipts: [{ action: 'design.plan_explanation', result: { ok: true, value: { delivery: 'canvas' } } }] }) }]
  const premature = policy.publicTextSafety({ text: '画板已经完成。', isFinal: true, approvedThrough: 0 }, ctx)
  assert.equal(premature.safeThrough, 0)
  assert.equal(premature.reject, 'unsupported_content', 'teaching withholding must not clear the Design rejection')
  const fallback = `${DESIGN_INCOMPLETE_NOTICE}先区分这两个概念。\n\n${scaffold.nextStep}`
  assert.equal(policy.publicTextSafety({ text: fallback, isFinal: false, approvedThrough: 0 }, ctx).safeThrough, 0)
  assert.equal(policy.publicTextSafety({ text: fallback, isFinal: true, approvedThrough: 0 }, ctx).safeThrough, fallback.length)
  const incompleteTeaching = `${DESIGN_INCOMPLETE_NOTICE}先区分这两个概念。`
  assert.equal(policy.publicTextSafety({ text: incompleteTeaching, isFinal: true, approvedThrough: 0 }, ctx).safeThrough, 0,
    'a truthful Design notice cannot bypass the independent teaching action')
  const internal = `${DESIGN_INCOMPLETE_NOTICE}<analysis>private model planning</analysis>`
  assert.ok(policy.publicTextSafety({ text: internal, isFinal: true, approvedThrough: 0 }, ctx).reject,
    'neither local surface may clear the global publication reject')
})
