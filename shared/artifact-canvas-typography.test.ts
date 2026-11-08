import assert from 'node:assert/strict'
import test from 'node:test'
import {canvasTextMetrics,createCanvasText,canvasFontPatch} from './artifact-canvas-typography.js'
import {createDocument,createPage,validateArtifactDocument} from './artifact-document.js'
import {applyOperations,prepareBatch,ArtifactOperationConflict} from './artifact-operations.js'
import {importCanvasAnnotations} from './artifact-canvas-import.js'

test('canvas text defaults match source metrics while old documents retain fixed text sizing',()=>{
  assert.deepEqual(canvasTextMetrics(24),{lineHeight:1.39,paddingX:14,paddingY:11,letterSpacing:0,minHeight:55})
  const large=canvasTextMetrics(72);assert.ok(Math.abs(large.lineHeight-1.102)<1e-12)
  assert.deepEqual({...large,lineHeight:1.102},{lineHeight:1.102,paddingX:24,paddingY:16,letterSpacing:-1.44,minHeight:111})
  const title=createCanvasText('title','text'),note=createCanvasText('note','note')
  assert.equal(title.textSizing,'content');assert.equal(title.width,2000);assert.equal(title.style.fontSize,24);assert.equal(title.style.fontWeight,400)
  assert.equal(note.width,240);assert.equal(note.style.fill,'#fef3a2');assert.equal(note.style.fontSize,14)
  const old={...title};delete old.textSizing
  const doc=createDocument('design','d'),page=createPage('p');page.nodes={title:old};page.nodeOrder=['title'];doc.pages={p:page};doc.pageOrder=['p']
  assert.equal(validateArtifactDocument(JSON.parse(JSON.stringify(doc))).pages.p!.nodes.title!.textSizing,undefined)
})

test('canvas typography persists and shares undo without rewriting old snapshots',()=>{
  const doc=createDocument('design','d'),page=createPage('p'),node=createCanvasText('title','text');page.nodes={title:node};page.nodeOrder=['title'];doc.pages={p:page};doc.pageOrder=['p']
  const original=JSON.stringify(doc),patch=canvasFontPatch(node,{fontSize:72}),batch=prepareBatch(doc,[{type:'node.patch',pageId:'p',nodeId:'title',patch:{style:patch}}],'size')
  const changed=applyOperations(doc,batch),reopened=validateArtifactDocument(JSON.parse(JSON.stringify(changed.document)))
  assert.equal(reopened.pages.p!.nodes.title!.style.paddingX,24);assert.equal(reopened.pages.p!.nodes.title!.textSizing,'content')
  assert.equal(applyOperations(changed.document,prepareBatch(changed.document,changed.inverse,'undo')).document.pages.p!.nodes.title!.style.paddingX,14)
  assert.equal(JSON.stringify(doc),original)
  assert.equal(canvasFontPatch({...node,style:{...node.style,lineHeight:2}},{fontSize:40}).lineHeight,undefined,'custom line height is preserved')
})

test('content sizing and independent padding copy, unset, undo and reject a stale change',()=>{
  const doc=createDocument('design','d'),page=createPage('p'),node=createCanvasText('title','text');page.nodes={title:node};page.nodeOrder=['title'];doc.pages={p:page};doc.pageOrder=['p']
  const stale=prepareBatch(doc,[{type:'node.patch',pageId:'p',nodeId:'title',patch:{style:{paddingX:20}}}],'stale')
  const current=applyOperations(doc,prepareBatch(doc,[{type:'node.patch',pageId:'p',nodeId:'title',patch:{style:{paddingX:18}}}],'current')).document
  assert.throws(()=>applyOperations(current,stale),ArtifactOperationConflict)
  const copied={...structuredClone(node),id:'copy'},inserted=applyOperations(current,prepareBatch(current,[{type:'node.insert',pageId:'p',node:copied}],'copy')).document
  assert.equal(validateArtifactDocument(JSON.parse(JSON.stringify(inserted))).pages.p!.nodes.copy!.style.paddingX,14)
  const removed=applyOperations(inserted,prepareBatch(inserted,[{type:'node.patch',pageId:'p',nodeId:'copy',patch:{},unset:['textSizing','style.paddingX','style.paddingY']}],'unset'))
  assert.equal(removed.document.pages.p!.nodes.copy!.textSizing,undefined)
  const undo=applyOperations(removed.document,prepareBatch(removed.document,removed.inverse,'restore')).document
  assert.deepEqual(undo.pages.p!.nodes.copy,copied)
})

test('source legacy titles retain their defaults while explicit source text stays a sticky note',()=>{
  const doc=createDocument('design','d'),warnings:string[]=[]
  importCanvasAnnotations(doc,{old:{kind:'title1',text:'旧版标题'},modern:{kind:'title1',size:24,bold:false,text:'画布中文标题',w:240},bounded:{kind:'title1',size:24,maxW:300,text:'中文标题'.repeat(50)},wide:{kind:'title1',size:24,maxW:4000,text:'中文标题'.repeat(200)},note:{kind:'text',size:72,text:'便签文字'}},warnings)
  const nodes=Object.values(Object.values(doc.pages)[0]!.nodes)
  assert.equal(nodes.find(node=>node.id==='old')!.style.fontSize,72)
  assert.equal(nodes.find(node=>node.id==='old')!.style.fontWeight,700)
  assert.equal(nodes.find(node=>node.id==='modern')!.style.fontWeight,400)
  assert.equal(nodes.find(node=>node.id==='modern')!.width,2000)
  assert.equal(nodes.find(node=>node.id==='bounded')!.width,300)
  assert.equal(nodes.find(node=>node.id==='wide')!.width,4000)
  assert.equal(nodes.find(node=>node.id==='note')!.type,'note')
  assert.deepEqual(warnings,[])
})

test('explicit uniform padding remains custom even when an axis equals a source default',()=>{
  for(const padding of [11,14]){
    const node=createCanvasText('t','text');node.style={...node.style,padding,paddingX:padding,paddingY:padding}
    const patch=canvasFontPatch(node,{fontSize:72})
    assert.equal(patch.paddingX,undefined);assert.equal(patch.paddingY,undefined)
    const changed={...node.style,...patch};assert.equal(changed.paddingX,padding);assert.equal(changed.paddingY,padding)
  }
})
