import assert from 'node:assert/strict'
import test from 'node:test'
import { sanitizeCoverSvg, parseCoverProposal, CaseCoverGenerationError } from './cover-validation.js'
import { buildCoverPresentation } from './cover-presentation.js'
import { createCaseCoverGenerator } from './cover-generation.js'

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 320"><path class="sil" d="M10 10L90 10L90 90Z"/></svg>'
test('SVG sanitizer preserves geometry and applies trusted readable paint', () => {
  const output = sanitizeCoverSvg(svg)
  assert.match(output, /viewBox="0 0 400 320"/)
  assert.match(output, /stroke=/)
  assert.doesNotMatch(output, /class=/)
})
test('SVG rejects active/external content, entity tricks, empty and excessive geometry', () => {
  for (const content of ['<script>alert(1)</script>', '<foreignObject/>', '<image href="https://example.com/a"/>',
    '<path onload="alert(1)"/>', '<path fill="url(https://example.com/a)"/>', '<style>path{fill:red}</style>']) {
    assert.throws(() => sanitizeCoverSvg(svg.replace(/<path[^>]*\/>/, content)), CaseCoverGenerationError)
  }
  for (const content of ['<!DOCTYPE svg [<!ENTITY x "bad">]>'+svg, svg.replace('0 0 400 320','0 0 1 1'), '<svg viewBox="0 0 400 320"/>', svg.replace('M10 10L90 10L90 90Z','MNaN Infinity'), svg.repeat(2000)]) {
    assert.throws(() => sanitizeCoverSvg(content), CaseCoverGenerationError)
  }
})
test('proposal rejects code breakout, oversized output and missing Chinese accessibility', () => {
  const proposal = { objectName:'抽屉柜',rationale:'用于收纳知识',altText:'等距抽屉柜，指针移入时抽屉拉开。',figure:'hairline({})' }
  assert.equal(parseCoverProposal(JSON.stringify(proposal)).objectName,'抽屉柜')
  for (const patch of [{figure:'</script><script>alert(1)</script>'},{figure:'x'.repeat(65_537)},{altText:'drawer'}, {objectName:''}]) {
    assert.throws(() => parseCoverProposal(JSON.stringify({...proposal,...patch})),CaseCoverGenerationError)
  }
})
test('presentation carries strict V2 VM data, not an executable HTML document', () => {
  const value = JSON.parse(buildCoverPresentation({kernel:'var HL = {};',figure:'hairline({});',altText:'抽屉柜'}))
  assert.deepEqual(value, {version:2, engine:'quickjs-wasm', kernel:'var HL = {};', figure:'hairline({});'})
})
test('renderer preflight fails before model billing, with no successful placeholder', async () => {
  let calls = 0
  const generate = createCaseCoverGenerator({
    model: async () => { calls++; return '' },
    renderer: { assertAvailable: async () => { throw new CaseCoverGenerationError('renderer_unavailable') },render: async () => { throw new Error('unreachable') } },
  })
  await assert.rejects(generate({organizationId:'o',caseId:'c',jobId:'j',fingerprint:'f',generation:1,requestedBy:'u',
    snapshot:{title:'网络',summary:'',category:'',tags:[],content:'路由协议'},signal:new AbortController().signal}),/renderer_unavailable/)
  assert.equal(calls,0)
})

test('kernel reflection keeps only local mask/gradient references and preserves paint', () => {
  const masked = '<svg viewBox="0 0 400 320"><defs><linearGradient id="fade"><stop offset="0" stop-color="#fff" stop-opacity="0.7"/></linearGradient><mask id="reflection"><rect width="400" height="320" fill="url(#fade)"/></mask></defs><g class="ghost" mask="url(#reflection)"><path d="M1 1L2 2"/></g></svg>'
  const cleaned = sanitizeCoverSvg(masked)
  assert.match(cleaned,/fill="url\(#fade\)"/)
  assert.match(cleaned,/<path[^>]+fill="none"/)
  assert.throws(()=>sanitizeCoverSvg(masked.replace('url(#fade)','url(#missing)')),CaseCoverGenerationError)
})
test('bounded repair uses original snapshot data, does not retry renderer preflight or bill indefinitely', async () => {
  let calls=0, renders=0
  const { readHairlineResources } = await import('./cover-upstream.js')
  const resources = await readHairlineResources() // data reads only; no upstream script executed
  const input = {organizationId:'o',caseId:'c',jobId:'j',fingerprint:'f',generation:1,requestedBy:'u',
    snapshot:{title:'知识整理',summary:'概览',category:'学习',tags:['笔记'],content:'文章正文'.repeat(10_000)},signal:new AbortController().signal}
  const generate=createCaseCoverGenerator({
    model:async ({user,attempt}) => { calls++; assert.ok(user.length<30_000); assert.match(user,/知识整理/); return attempt===1?'bad json':JSON.stringify({objectName:'抽屉柜',rationale:'知识分层存储',altText:'抽屉柜，悬停抽屉展开。',figure:'hairline({});'}) },
    resources:async()=>resources,assemble:async()=>'<validated-original/>',
    renderer:{assertAvailable:async()=>{},render:async()=>{renders++;return svg}},
  })
  const result=await generate(input)
  assert.equal(calls,2);assert.equal(renders,1)
  assert.equal(result.metadata.originalTemplateValidated,true)
  assert.equal(result.metadata.presentationIsOriginalTemplate,false)
  assert.equal(result.metadata.validatedOriginalHtml,'<validated-original/>')
  assert.equal(JSON.parse(result.html).version,2)
  assert.doesNotMatch(result.html,/script-src 'unsafe-inline'/)
})
test('two malformed proposals end with a classified failure instead of returning an old/static placeholder',async()=>{
  let calls=0
  const {readHairlineResources}=await import('./cover-upstream.js')
  const generate=createCaseCoverGenerator({model:async()=>{calls++;return '{}'},resources:readHairlineResources,
    renderer:{assertAvailable:async()=>{},render:async()=>svg}})
  await assert.rejects(generate({organizationId:'o',caseId:'c',jobId:'j',fingerprint:'f',generation:1,requestedBy:'u',
    snapshot:{title:'test',summary:'',category:'',tags:[],content:'body'},signal:new AbortController().signal}),/invalid_model_output/)
  assert.equal(calls,2)
})
test('first-frame Worker has fixed V8 heap and stack budgets',async()=>{
  const {COVER_WORKER_LIMITS}=await import('./cover-renderer.js')
  assert.deepEqual(COVER_WORKER_LIMITS,{maxOldGenerationSizeMb:32,maxYoungGenerationSizeMb:8,stackSizeMb:2})
})
