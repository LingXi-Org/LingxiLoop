import assert from 'node:assert/strict'
import test from 'node:test'
import {readFileSync} from 'node:fs'
import {fitCanvasPen} from './artifact-pen.js'

const reference=JSON.parse(readFileSync(new URL('../scripts/fixtures/native-editors/source-design-pen.json',import.meta.url),'utf8')) as {cases:Array<{name:string;points:Array<{x:number;y:number}>;tolerance:number;result:{x:number;y:number;w:number;h:number;d:string}}>}
for(const sample of reference.cases)test(`freehand geometry matches fixed source: ${sample.name}`,()=>{
  const original=JSON.stringify(sample.points)
  assert.deepEqual(fitCanvasPen(sample.points,sample.tolerance),sample.result)
  assert.equal(JSON.stringify(sample.points),original)
})

import {isArtifactPenPath} from './artifact-path.js'
import {createDocument,createPage,createNode,validateArtifactDocument} from './artifact-document.js'
import {applyOperations,prepareBatch,ArtifactOperationConflict} from './artifact-operations.js'
import {importCanvasAnnotations} from './artifact-canvas-import.js'
import {resizeSelection,duplicatePages,appendCanvasPenPoint} from './artifact-editor-actions.js'

test('pen sampling uses screen distance and decimates the appended point with the source parity',()=>{
  const first=[{x:0,y:0}]
  assert.equal(appendCanvasPenPoint(first,{x:3,y:0},.5),first)
  assert.deepEqual(appendCanvasPenPoint(first,{x:4,y:0},.5),[{x:0,y:0},{x:4,y:0}])
  const full=Array.from({length:3000},(_,x)=>({x:x*2,y:0})),next={x:6000,y:0}
  assert.deepEqual(appendCanvasPenPoint(full,next,1),[...full,next].filter((_,i)=>i%2===0))
  assert.equal(full.length,3000)
})

test('bounded native paths survive persistence, copy, resizing and shared undo',()=>{
  const geometry=reference.cases[0].result,doc=createDocument('design','d'),page=createPage('p'),node={...createNode('drawing','pen'),x:geometry.x,y:geometry.y,width:geometry.w,height:geometry.h,path:{d:geometry.d,width:geometry.w,height:geometry.h}}
  doc.pages={p:page};doc.pageOrder=['p'];const initial=JSON.stringify(doc),inserted=applyOperations(doc,prepareBatch(doc,[{type:'node.insert',pageId:'p',node}],'insert'))
  const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(inserted.document)))
  assert.deepEqual(reopened.pages.p!.nodes.pen!.path,node.path)
  assert.deepEqual(resizeSelection([node],'se',100,100)[0].path,node.path,'logical path coordinates stay immutable while its box scales')
  let sequence=0;const copied=applyOperations(reopened,prepareBatch(reopened,duplicatePages(reopened,['p'],()=>`copy-${++sequence}`),'copy')).document
  assert.deepEqual(copied.pages['copy-1']!.nodes['copy-2']!.path,node.path)
  assert.deepEqual(applyOperations(inserted.document,prepareBatch(inserted.document,inserted.inverse,'undo')).document.pages.p!.nodes,{})
  assert.equal(JSON.stringify(doc),initial)
})

test('pen path validation accepts source commands and rejects executable or unbounded input',()=>{
  for(const sample of reference.cases)assert.equal(isArtifactPenPath(sample.result.d),true)
  for(const source of ['','M0 0','M0 0 C1 2','M0 0 L1,,2','M0 0 L-1 2','M0 0 L8001 2','M0 0 L1e3 2','<path d="M0 0"/>','M0 0 L1 2" onload="x','M0 0 LInfinity 0']){
    assert.equal(isArtifactPenPath(source),false,source)
  }
})

test('path updates conflict as one field, merge with text-independent style, and undo removal',()=>{
  const geometry=reference.cases[0].result,doc=createDocument('design','d'),page=createPage('p'),node={...createNode('drawing','pen'),path:{d:geometry.d,width:geometry.w,height:geometry.h}}
  page.nodes.pen=node;page.nodeOrder=['pen'];doc.pages.p=page;doc.pageOrder=['p']
  const remove=prepareBatch(doc,[{type:'node.patch',pageId:'p',nodeId:'pen',patch:{},unset:['path']}],'remove'),style=prepareBatch(doc,[{type:'node.patch',pageId:'p',nodeId:'pen',patch:{style:{stroke:'#ff0000'}}}],'style'),stale=prepareBatch(doc,[{type:'node.patch',pageId:'p',nodeId:'pen',patch:{path:{...node.path,d:'M0 0 L1 2'}}}],'stale')
  const removed=applyOperations(doc,remove),merged=applyOperations(removed.document,style).document
  assert.equal(merged.pages.p!.nodes.pen!.path,undefined);assert.equal(merged.pages.p!.nodes.pen!.style.stroke,'#ff0000')
  assert.throws(()=>applyOperations(merged,stale),ArtifactOperationConflict)
  assert.deepEqual(applyOperations(merged,prepareBatch(merged,removed.inverse,'undo')).document.pages.p!.nodes.pen!.path,node.path)
})

test('fixed-source curves import into independent canvas content without changing source input',()=>{
  const geometry=reference.cases[0].result,source={curve:{kind:'pen',...geometry}},original=JSON.stringify(source),doc=createDocument('design','d'),warnings:string[]=[]
  importCanvasAnnotations(doc,source,warnings)
  const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(doc))),body=reopened.pages[reopened.canvasPages![0]!.contentId!]!,node=body.nodes.curve!
  assert.deepEqual(node.path,{d:geometry.d,width:geometry.w,height:geometry.h});assert.equal(node.x,geometry.x);assert.equal(node.y,geometry.y);assert.deepEqual(warnings,[]);assert.deepEqual(reopened.pageOrder,[]);assert.equal(JSON.stringify(source),original)
})
