import { readFileSync } from 'node:fs'
import { assembleHarness, releaseVersions, toolContractHash } from '@lingxi-org/lingxios'
import { createProductHarness } from '../agent-runtime/harness.js'
import { createProductTools } from '../agent-runtime/tools.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createArtifactTools } from '../modules/artifacts/agent-tools.js'
import { createDocument, createNode, createPage } from '../../../shared/artifact-document.js'
import { prepareBatch } from '../../../shared/artifact-operations.js'

const agentDraft = (...args: Parameters<typeof prepareBatch>) => { const { baseSeq, operations } = prepareBatch(...args); return { baseSeq, operations } }
const control = async () => { throw new Error('schema tests must not access runtime') }
const design = createArtifactTools('design', control), slides = createArtifactTools('slides', control)
const report = { finding: 'Observed finding', evidenceRefs: [{ kind: 'file', id: 'project/pages/main.json' }], confidence: 0.8 }

test('native operation schemas retain self-contained references and admit the same bounded pen data',()=>{
  const document=createDocument('design','canvas'),page=createPage('p');document.pages.p=page;document.pageOrder=['p']
  const node={...createNode('drawing','pen'),path:{d:'M0 0 C10 0 20 30 40 30',width:40,height:30}}
  const batch=agentDraft(document,[{type:'node.insert',pageId:'p',node}],'pen-edit')
  for(const tools of [design,slides]){
    const tool=tools.find(tool=>tool.action.endsWith('.prepare_ops'))!,parameters=tool.parameters as Record<string,unknown>,references:string[]=[]
    let pathDefinitions=0
    const walk=(value:unknown)=>{if(!value||typeof value!=='object')return;const properties=Reflect.get(value,'properties');if(properties&&typeof properties==='object'&&Object.hasOwn(properties,'d')&&Object.hasOwn(properties,'width')&&Object.hasOwn(properties,'height'))pathDefinitions++;for(const[key,item]of Object.entries(value)){if(key==='$ref'&&typeof item==='string')references.push(item);else walk(item)}}
    walk(parameters);assert.ok(references.length>0,'the repeated node schema must not expand separately for every operation')
    assert.equal(pathDefinitions,1,'insert, replace, patch and page operations share the bounded path definition')
    for(const reference of references){assert.ok(reference.startsWith('#/'));let target:unknown=parameters;for(const key of reference.slice(2).split('/'))target=target&&typeof target==='object'?Reflect.get(target,key.replace(/~1/g,'/').replace(/~0/g,'~')):undefined;assert.ok(target&&typeof target==='object',`unresolved local reference: ${reference}`)}
    assert.deepEqual(tool.parse(batch),batch)
    assert.throws(()=>tool.parse({...batch,operations:[{type:'node.insert',pageId:'p',node:{...node,path:{...node.path,d:'M0 0 L-1 2'}}}]}))
    assert.throws(()=>tool.parse({...batch,companyId:'other'}))
  }
})

test('Slides retains common native tools and adds deck creation and real design-system tools', () => {
  const methods = (tools: typeof design) => tools.map(tool => tool.action.split('.')[1])
  assert.deepEqual(methods(slides).filter(method => !['create', 'design_systems', 'install_design_system'].includes(method)), methods(design).filter(method => !['ensure','plan_explanation'].includes(method)))
  assert.ok(methods(slides).includes('create'))
  for (const tool of [...design, ...slides]) assert.equal((tool.parameters as { additionalProperties: boolean }).additionalProperties, false)
})

test('cold Design initialization is an explicit authorized transaction with a strict schema', () => {
  const initialize = design.find(tool => tool.action === 'design.ensure')!
  assert.equal(initialize.effect, 'transaction')
  assert.deepEqual(initialize.parse({}), {})
  assert.throws(() => initialize.parse({ companyId: 'other', conversationId: 'other' }))
  assert.ok(initialize.authorize)
  assert.ok(initialize.verify)
  assert.equal(slides.some(tool => tool.action === 'slides.ensure'), false)
})

test('design-system installation rejects traversal, missing preconditions and unbounded batches', () => {
  const install = slides.find(tool => tool.action === 'slides.install_design_system')!
  const input = { namespace: 'studio', title: 'Studio', source: 'user-provided', ifMatch: 'a'.repeat(64), files: { 'tokens.json': '{}' } }
  assert.deepEqual(install.parse(input), input)
  assert.throws(() => install.parse({ ...input, namespace: '../escape' }))
  assert.throws(() => install.parse({ ...input, ifMatch: undefined }))
  assert.throws(() => install.parse({ ...input, files: { '../escape.json': '{}' } }))
  assert.throws(() => install.parse({ ...input, files: {} }))
})

test('ordinary artifact reports reject verifier fields at native parse admission', () => {
  for (const tools of [design, slides]) {
    const ordinary = tools.find(tool => tool.action.endsWith('.submit_report'))!
    assert.deepEqual(ordinary.parse(report), report)
    for (const extra of [{ verifiesReportId: 'report-1' }, { disconfirmingChecks: ['No contrary artifact found'] }, { verdict: 'supported' }]) {
      assert.throws(() => ordinary.parse({ ...report, ...extra }))
    }
    assert.throws(() => ordinary.parse({ ...report, evidenceRefs: [{ kind: 'frame', id: 'frame-1' }] }))
  }
})

test('independent verification has a strict required role-specific public contract', () => {
  const verification = slides.find(tool => tool.action === 'slides.submit_verification')!
  assert.throws(() => verification.parse(report))
  const input = { ...report, verifiesReportId: 'report-1', disconfirmingChecks: ['Checked the original artifact'], verdict: 'inconclusive' }
  assert.deepEqual(verification.parse(input), input)
  assert.throws(() => verification.parse({ ...input, disconfirmingChecks: [] }))
  assert.throws(() => verification.parse({ ...input, executionRole: 'specialist' }))
  const schema = verification.parameters as { required: string[] }
  for (const field of ['verifiesReportId','disconfirmingChecks','verdict']) assert.ok(schema.required.includes(field))
})

test('human and Agent partial edits use the same strict versioned operation contract', () => {
  const document = createDocument('design', 'canvas'), page = createPage('main')
  const node = createNode('text', 'heading'); page.nodes[node.id] = node; page.nodeOrder = [node.id]
  document.pages[page.id] = page; document.pageOrder = [page.id]
  const batch = agentDraft(document, [{ type: 'node.patch', pageId: page.id, nodeId: node.id, patch: { text: 'Updated with CAS' } }], 'agent-edit')
  for (const tools of [design, slides]) {
    const write = tools.find(tool => tool.action.endsWith('.prepare_ops'))!
    assert.equal(write.effect, 'read'); assert.ok(write.authorize)
    assert.deepEqual(write.parse(batch), batch)
    assert.throws(() => write.parse({ ...batch, baseSeq: undefined }))
    assert.throws(() => write.parse({ ...batch, operations: undefined }))
    assert.throws(() => write.parse({ ...batch, operations: [] }))
    assert.throws(() => write.parse({ ...batch, companyId: 'other-tenant' }))
    assert.throws(() => write.parse({ ...batch, operations: [{ type: 'node.patch', pageId: '../escape', nodeId: 'heading', patch: { text: 'bad' } }] }))
    assert.throws(() => write.parse({ ...batch, operations: [{ type: 'node.patch', pageId: 'main', nodeId: 'heading', patch: { onClick: 'execute()' } }] }))
  }
})

test('native document and immutable page reads cannot select another tenant or arbitrary file', () => {
  for (const tools of [design, slides]) {
    const document = tools.find(tool => tool.action.endsWith('.read_document'))!, page = tools.find(tool => tool.action.endsWith('.read_page'))!
    assert.equal(document.effect, 'read'); assert.equal(page.effect, 'read')
    assert.deepEqual(document.parse({}), {})
    assert.deepEqual(page.parse({ pageId: 'main', version: 'a'.repeat(64) }), { pageId: 'main', version: 'a'.repeat(64) })
    assert.throws(() => page.parse({ pageId: 'main', version: 'wrong-version' }))
    assert.throws(() => page.parse({ path: 'project/canvas.json' }))
    assert.throws(() => document.parse({ companyId: 'another-tenant' }))
  }
})

// Native operation tools intentionally replace the old authoring contract.
// Keep its receipt unchanged: deploy compares actual image assemblies and
// drains all nonterminal work before replacing a different pinned harness.
test('native artifact tools declare a new organization runtime harness and use the enforced cutover boundary', () => {
  const source = JSON.parse(readFileSync(new URL('../../../perf/issue-683/harness-main-1bd9e539.json', import.meta.url), 'utf8'))
  const actual = assembleHarness(createProductHarness(createProductTools(control), control))
  assert.equal(source.hash, '2cd6afd4037eb4596c6ef9b3ee1fdc6d00540d5fa3e05ee0820ba79f5e92e2cb', 'never rewrite the admitted-work baseline')
  assert.equal(source.runtime, '3.8.25')
  assert.equal(releaseVersions.runtime, '4.0.0')
  assert.equal(actual.context.version, '4.0.0-native-artifacts-2')
  assert.notEqual(actual.context.hash, source.hash)
  for (const kind of ['design', 'slides']) for (const method of ['read_document', 'read_page', 'prepare_ops', 'apply_ops']) {
    const tool = actual.tools.find(tool => tool.action === `${kind}.${method}`)
    assert.ok(tool, 'shared data operations must be in the actual admitted harness')
    assert.match(toolContractHash(tool), /^[a-f0-9]{64}$/)
  }
  const deploy = readFileSync(new URL('../../../deploy/cli.mjs', import.meta.url), 'utf8')
  assert.match(deploy, /if \(nativeHarness && stacks\.includes\('app-a'\)\)/)
  assert.match(deploy, /await convergeHarnessCutover\(/)
  assert.match(deploy, /barrier: \(\) => harnessTargetEntry\(ssh, images, 'barrier'\)/)
})


test('原生Agent工具接受四角圆角并拒绝错误长度和越界值',()=>{
  const document=createDocument('design','radius-tool'),page=createPage('p');document.pages.p=page;document.pageOrder=['p']
  const batch=agentDraft(document,[{type:'page.patch',pageId:'p',patch:{radius:[10,20,30,40]}}],'radius-tool')
  for(const tools of [design,slides]){
    const tool=tools.find(tool=>tool.action.endsWith('.prepare_ops'))!
    assert.deepEqual(tool.parse(batch),batch)
    for(const radius of [[1,2,3],[1,2,3,4,5],[1,2,-1,4],[1,2,4001,4]])assert.throws(()=>tool.parse({...batch,operations:[{type:'page.patch',pageId:'p',patch:{radius}}]}))
  }
})

test('原生Agent工具承载独立打印模式且拒绝未知模式',()=>{
  const document=createDocument('design','print-tool'),page=createPage('p');document.pages.p=page;document.pageOrder=['p']
  const batch=agentDraft(document,[{type:'page.patch',pageId:'p',patch:{print:'flow',sizing:'fixed',paper:'A4'}}],'print-tool')
  for(const tools of [design,slides]){
    const tool=tools.find(tool=>tool.action.endsWith('.prepare_ops'))!
    assert.deepEqual(tool.parse(batch),batch)
    assert.throws(()=>tool.parse({...batch,operations:[{type:'page.patch',pageId:'p',patch:{print:'unknown'}}]}))
  }
})

// 只有版本化操作可写稿件，旧整文件写入不再作为可调用工具暴露。
test('原生稿件只注册操作写入接口', () => {
  for (const kind of ['design', 'slides'] as const) {
    const tools = createArtifactTools(kind, control)
    assert.ok(tools.some(tool => tool.action === `${kind}.apply_ops`))
    for (const method of ['write_files', 'edit_file'])
      assert.equal(tools.some(tool => tool.action === `${kind}.${method}`), false)
  }
})

test('Agent prepares pinned native operations before committing an immutable plan', () => {
  for (const tools of [design, slides]) {
    const prepare = tools.find(tool => tool.action.endsWith('.prepare_ops'))
    assert.ok(prepare, 'the model must not invent per-field CAS counters')
    const page = createPage('prepared-page'), input = { baseSeq: 0, operations: [{ type: 'page.insert', page }] }
    assert.deepEqual(prepare.parse(input), input)
    assert.throws(() => prepare.parse({ ...input, expectedVersions: {} }))
    const apply = tools.find(tool => tool.action.endsWith('.apply_ops'))!
    assert.deepEqual(apply.parse({ planId: 'prepared-action' }), { planId: 'prepared-action' })
    assert.throws(() => apply.parse({ ...input, operationId: 'manual', expectedVersions: {} }))
    assert.equal(prepare.effect, 'read'); assert.equal(apply.effect, 'transaction')
  }
})
