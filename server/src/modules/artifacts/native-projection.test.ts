import {createCanvasText} from '../../../../shared/artifact-canvas-typography.js'
import {createCanvasContents} from '../../../../shared/artifact-canvas-pages.js'
import {applyOperations,prepareBatch} from '../../../../shared/artifact-operations.js'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document.js'
import { projectNativeSnapshot } from './native-projection.js'

test('read-only legacy conversion retains all pages without writing immutable page state', () => {
  const document = createDocument('slides', 'readonly')
  for (const id of ['one', 'two']) {
    const page = createPage(id), node = createNode('text', 'text')
    node.text = id; page.nodes.text = node; page.nodeOrder = ['text']
    document.pages[id] = page; document.pageOrder.push(id)
  }
  const snapshot = { document, history: { version: 0, undo: null, redo: null }, pageVersions: {}, original: { version: 'legacy', files: {}, warnings: [] } }
  const projected = projectNativeSnapshot(snapshot, ['one'])
  assert.deepEqual(projected.loadedPageIds, ['one', 'two'])
  assert.equal(projected.document.pages.two.nodes.text.text, 'two')
  const stored = projectNativeSnapshot({ ...snapshot, pageVersions: { one: 'hash1', two: 'hash2' } }, ['one'])
  assert.deepEqual(stored.loadedPageIds, ['one'])
  assert.deepEqual(stored.document.pages.two.nodes, {})
  assert.equal(stored.document.pages.two.title, document.pages.two.title)
})


test('independent canvas bodies retain their identity in compact reads and all data in ephemeral conversion',()=>{
  const base=createDocument('design','canvas'),body='contents'
  const doc=applyOperations(base,prepareBatch(base,[...createCanvasContents(base,'canvas-page-1',body),{type:'node.insert',pageId:body,node:{...createNode('note','note'),text:'画布便签'}}])).document
  const snapshot={document:doc,history:{version:0,undo:null,redo:null},pageVersions:{contents:'hash'},original:{version:'old',files:{},warnings:[]}}
  const partial=projectNativeSnapshot(snapshot,[])
  assert.deepEqual(partial.loadedPageIds,[])
  assert.equal(partial.document.canvasPages?.[0].contentId,body)
  assert.deepEqual(partial.document.pages.contents.nodes,{})
  const full=projectNativeSnapshot({...snapshot,pageVersions:{}},[])
  assert.deepEqual(full.loadedPageIds,[body])
  assert.equal(full.document.pages.contents.nodes.note.text,'画布便签')
})


test('lazy native projection retains content text and independent padding in loaded bodies',()=>{
  const document=createDocument('design','d'),page=createPage('p'),node=createCanvasText('t','text');page.nodes={t:node};page.nodeOrder=['t'];document.pages={p:page};document.pageOrder=['p']
  const snapshot={document,history:{version:0,undo:null,redo:null},pageVersions:{p:'hash'},original:{version:'old',files:{},warnings:[]}}
  const loaded=projectNativeSnapshot(snapshot,['p'])
  assert.deepEqual(loaded.document.pages.p.nodes.t,node)
  assert.equal(loaded.document.pages.p.nodes.t.style.paddingX,14)
  assert.equal(loaded.document.pages.p.nodes.t.textSizing,'content')
  assert.deepEqual(projectNativeSnapshot(snapshot,[]).document.pages.p.nodes,{})
})

test('画板圆角随未加载页元数据返回，不要求读取完整页体',()=>{
  const document=createDocument('design','radius-projection'),page=createPage('p');page.radius=[10,20,30,40]
  page.nodes.t={...createNode('text','t'),text:'未加载的正文'};page.nodeOrder=['t'];document.pages.p=page;document.pageOrder=['p']
  const snapshot={document,history:{version:0,undo:null,redo:null},pageVersions:{p:'immutable-radius-hash'},original:{version:'old',files:{},warnings:[]}}
  const projection=projectNativeSnapshot(snapshot,[])
  assert.deepEqual(projection.document.pages.p.radius,[10,20,30,40]);assert.deepEqual(projection.document.pages.p.nodes,{})
  assert.equal(projection.pageVersions.p,'immutable-radius-hash');assert.equal(document.pages.p.nodes.t.text,'未加载的正文')
})

test('打印设置随未加载页元数据返回，保持画板增长字段独立',()=>{
  const document=createDocument('design','print-projection'),page={...createPage('p'),print:'flow' as const,paper:'A4' as const,sizing:'fixed' as const};document.pages.p=page;document.pageOrder=['p']
  const projection=projectNativeSnapshot({document,history:{version:0,undo:null,redo:null},pageVersions:{p:'immutable-print-hash'},original:{version:'old',files:{},warnings:[]}},[])
  assert.equal(projection.document.pages.p.print,'flow');assert.equal(projection.document.pages.p.paper,'A4');assert.equal(projection.document.pages.p.sizing,'fixed');assert.deepEqual(projection.document.pages.p.nodes,{})
})

test('文字样式摘要覆盖未加载画板，保持节点裁剪及不可变版本',()=>{
 const document=createDocument('design','typography-projection'),page=createPage('p'),node=createNode('text','t');node.style={fontSize:48,fontFamily:'Arial'};node.text='不应传入字号摘要的正文';page.nodes.t=node;page.nodeOrder=['t'];document.pages.p=page;document.pageOrder=['p']
 const before=JSON.stringify(document),projection=projectNativeSnapshot({document,history:{version:0,undo:null,redo:null},pageVersions:{p:'immutable-typography-hash'}},[])
 assert.deepEqual(projection.document.pages.p.nodes,{})
 assert.deepEqual(projection.typography,{p:[{size:48,roles:{Body:1},families:{Arial:1}}]})
 assert.equal(projection.pageVersions.p,'immutable-typography-hash');assert.equal(JSON.stringify(document),before)
})

test('独立字体摘要保留无字号分组声明，不加载页体或改变页面哈希',()=>{
 const document=createDocument('design','font-projection'),page=createPage('page'),group=createNode('group','group');group.style={fontFamily:'Georgia'};page.nodes.group=group;page.nodeOrder=['group'];document.pages.page=page;document.pageOrder=['page']
 const before=JSON.stringify(document),projection=projectNativeSnapshot({document,history:{version:0,undo:null,redo:null},pageVersions:{page:'immutable-font-hash'}},[])
 assert.deepEqual(projection.fontFamilies,{page:{first:['Georgia'],display:['Georgia']}});assert.deepEqual(projection.document.pages.page.nodes,{})
 assert.equal(projection.pageVersions.page,'immutable-font-hash');assert.equal(JSON.stringify(document),before)
})
