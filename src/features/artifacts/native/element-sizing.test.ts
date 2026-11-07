import assert from 'node:assert/strict'
import test from 'node:test'
import {createNode,createPage,createDocument,validateArtifactDocument} from '../../../../shared/artifact-document'
import {applyOperations,prepareBatch,ArtifactOperationConflict} from '../../../../shared/artifact-operations'
import {duplicateNodes} from '../../../../shared/artifact-editor-actions'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'
import {elementSizingPatch,elementSizingValue} from './element-sizing'

test('尺寸输入归一像素且保留其他声明，包裹和填充不回退旧尺寸',()=>{
  const page=createPage('page'),node={...createNode('text','text'),width:1152,height:76,css:{width:'50%',filter:'blur(1px)'}}
  const before=JSON.stringify(node)
  const fixed=elementSizingPatch(node,page,{width:'800'})
  assert.equal(fixed.patch.width,800);assert.deepEqual(fixed.patch.css,{filter:'blur(1px)'})
  assert.equal(elementSizingPatch(node,page,{width:null}).patch.css?.width,'auto')
  assert.equal(elementSizingPatch(node,page,{width:null}).patch.implicitWidth,true)
  assert.equal(elementSizingPatch(node,page,{width:'100%'}).patch.css?.width,'100%')
  assert.equal(elementSizingValue(node,page,'width'),'50%');assert.equal(JSON.stringify(node),before)
})

test('清除宽度与作者输入auto分别持久化，重复自适应没有历史',()=>{
  const page=createPage('page'),node={...createNode('text','text'),css:{width:'auto'},implicitWidth:true}
  assert.equal(elementSizingValue(node,page,'width'),'')
  assert.deepEqual(elementSizingPatch(node,page,{width:null}),{patch:{},unset:[]})
  const explicit=elementSizingPatch(node,page,{width:'auto'})
  assert.ok(explicit.unset.includes('implicitWidth'))
  const next={...node,implicitWidth:undefined}
  assert.equal(elementSizingValue(next,page,'width'),'auto')
})

test('普通位置移除偏移，其他位置模式保留偏移并通过现有校验',()=>{
  const page=createPage('page'),node={...createNode('text','text'),x:64,y:40}
  const inline=elementSizingPatch(node,page,{position:'static'})
  assert.deepEqual(inline.patch.css,{position:'static',left:'auto',top:'auto'})
  for(const position of ['relative','absolute','fixed','sticky']){
    const result=elementSizingPatch(node,page,{position})
    assert.equal(result.patch.css?.position,position==='absolute'?undefined:position)
    assert.equal(result.patch.x,undefined);assert.equal(result.patch.y,undefined)
  }
  assert.throws(()=>elementSizingPatch(node,page,{'min-width':'1px;position:fixed'}))
})


test('可选尺寸标记支持校验重开、复制、共享历史，几何及代码编辑恢复显式尺寸',()=>{
  const document=createDocument('design','sizing-doc'),page=createPage('page'),node={...createNode('text','text'),width:1152,height:76}
  page.nodes[node.id]=node;page.nodeOrder=[node.id];document.pages[page.id]=page;document.pageOrder=[page.id]
  const old=JSON.stringify(document),change=elementSizingPatch(node,page,{width:null})
  const first=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:page.id,nodeId:node.id,...change}],'implicit-width'))
  const reopened=validateArtifactDocument(JSON.parse(JSON.stringify(first.document))),implicit=reopened.pages.page!.nodes.text!
  assert.equal(implicit.implicitWidth,true);assert.equal(implicit.css?.width,'auto');assert.ok(!nodeCodeEntries(implicit,page).some(entry=>entry.name==='width'))
  assert.equal(duplicateNodes([implicit],()=> 'copy')[0].implicitWidth,true)
  const resized=applyOperations(reopened,prepareBatch(reopened,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{width:800}}],'resize'))
  assert.equal(resized.document.pages.page!.nodes.text!.implicitWidth,undefined);assert.equal(resized.document.pages.page!.nodes.text!.css?.width,'800px')
  const undone=applyOperations(resized.document,prepareBatch(resized.document,resized.inverse,'undo-resize'))
  assert.equal(undone.document.pages.page!.nodes.text!.implicitWidth,true);assert.equal(undone.document.pages.page!.nodes.text!.css?.width,'auto')
  const original=applyOperations(undone.document,prepareBatch(undone.document,first.inverse,'undo-implicit'))
  assert.deepEqual(original.document.pages.page!.nodes.text,node);assert.equal(JSON.stringify(document),old)
  const code=nodeCodePatch(implicit,nodeCodeEntries(implicit,page),[...nodeCodeEntries(implicit,page),{name:'width',value:'auto'}])
  assert.ok(code.unset.includes('implicitWidth'))
  const stale=prepareBatch(reopened,[{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{implicitWidth:true}}],'stale-mode')
  assert.throws(()=>applyOperations(resized.document,stale),ArtifactOperationConflict)
})
