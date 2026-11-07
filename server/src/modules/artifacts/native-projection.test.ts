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
