import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage, validateArtifactDocument } from './artifact-document.js'
import { applyOperations, ArtifactOperationConflict, prepareBatch } from './artifact-operations.js'
import { canvasPages, canvasPageOf, createCanvasPage, renameCanvasPage, deleteCanvasPage, moveCanvasArtboards, createCanvasContents, artifactPageIds } from './artifact-canvas-pages.js'

function fixture() {
  const doc = createDocument('design', 'design')
  const page = createPage('board', '画板')
  const note = {...createNode('note', 'note'), scope: 'canvas' as const, text: '画布便签'}
  page.nodeOrder = [note.id]; page.nodes = {[note.id]:note}
  doc.pageOrder = [page.id]; doc.pages = {[page.id]:page}
  return doc
}
const edit = (doc: ReturnType<typeof fixture>, ops: Parameters<typeof prepareBatch>[1], id = 'edit') => applyOperations(doc, prepareBatch(doc, ops, id))

test('old designs read one implicit Chinese canvas page without mutating their snapshot', () => {
  const doc = fixture(), before = JSON.stringify(doc)
  assert.equal(canvasPages(doc).length, 1)
  assert.equal(canvasPages(doc)[0].name, '页面 1')
  assert.equal(canvasPageOf(doc.pages.board!), canvasPages(doc)[0].id)
  assert.equal(JSON.stringify(doc), before)
})

test('canvas pages persist independently from boards and slide sections; undo restores omitted metadata', () => {
  const doc = fixture(), original = JSON.stringify(doc), first = canvasPages(doc)[0].id
  const added = edit(doc, createCanvasPage(doc, 'second'))
  assert.equal(canvasPages(added.document).length, 2)
  assert.deepEqual(added.document.pageOrder, ['board'])
  assert.equal(added.document.pages.board, doc.pages.board)
  assert.deepEqual(canvasPages(validateArtifactDocument(JSON.parse(JSON.stringify(added.document)))), [{id:first,name:'页面 1'},{id:'second',name:'页面 2'}])
  const renamed = edit(added.document, renameCanvasPage(added.document, 'second', '流程图'))
  assert.equal(canvasPages(renamed.document)[1].name, '流程图')
  assert.equal(renamed.document.pages.board!.section, undefined)
  const undone = edit(added.document, added.inverse).document
  assert.equal(Object.hasOwn(undone, 'canvasPages'), false)
  assert.equal(JSON.stringify(doc), original)
})

test('moving artboards keeps their free objects and styles, supports save/reopen and undo', () => {
  const initial = fixture(), before = edit(initial, createCanvasPage(initial, 'second')).document
  const moved = edit(before, moveCanvasArtboards(before, ['board'], 'second'))
  assert.equal(canvasPageOf(moved.document.pages.board!), 'second')
  assert.deepEqual(moved.document.pages.board!.nodes, before.pages.board!.nodes)
  assert.equal(validateArtifactDocument(JSON.parse(JSON.stringify(moved.document))).pages.board!.canvasPageId, 'second')
  const restored = edit(moved.document, moved.inverse).document
  assert.equal(Object.hasOwn(restored.pages.board!, 'canvasPageId'), false)
  assert.deepEqual(restored.pages.board!.nodes, before.pages.board!.nodes)
})

test('deleting a canvas page atomically removes its boards and objects and undo restores both', () => {
  const initial = fixture(), before = edit(initial, createCanvasPage(initial, 'second')).document
  const first = canvasPages(before)[0].id
  const deleted = edit(before, deleteCanvasPage(before, first))
  assert.equal(canvasPages(deleted.document).length, 1)
  assert.deepEqual(deleted.document.pageOrder, [])
  const restored = edit(deleted.document, deleted.inverse).document
  assert.deepEqual(canvasPages(restored), canvasPages(before))
  assert.deepEqual(restored.pages.board, before.pages.board)
  assert.throws(() => deleteCanvasPage(initial, first), /最后/)
})

test('deleting a canvas page refuses a concurrent new member instead of silently reassigning it', () => {
  const initial = fixture(), doc = edit(initial, createCanvasPage(initial, 'second')).document
  const removal = prepareBatch(doc, deleteCanvasPage(doc, canvasPages(doc)[0].id), 'delete')
  const another = createPage('another', '新画板')
  const current = edit(doc, [{type:'page.insert',page:another}], 'insert').document
  assert.throws(() => applyOperations(current, removal), ArtifactOperationConflict)
  assert.equal(canvasPageOf(current.pages.another!), canvasPages(doc)[0].id)
})

test('independent object edits merge with canvas page renames; same rename conflicts', () => {
  const initial = fixture(), doc = edit(initial, createCanvasPage(initial, 'second')).document
  const rename = prepareBatch(doc, renameCanvasPage(doc, 'second', '新页面'), 'rename')
  const current = edit(doc, [{type:'node.patch',pageId:'board',nodeId:'note',patch:{text:'新的便签'}}]).document
  assert.equal(applyOperations(current, rename).document.pages.board!.nodes.note!.text, '新的便签')
  const other = edit(doc, renameCanvasPage(doc, 'second', '另一个名称')).document
  assert.throws(() => applyOperations(other, rename), ArtifactOperationConflict)
})

test('canvas page references, uniqueness and editor kind are validated at the model boundary', () => {
  const initial = fixture(), doc = edit(initial, createCanvasPage(initial, 'second')).document
  assert.throws(() => validateArtifactDocument({...doc,canvasPages:[]}))
  assert.throws(() => validateArtifactDocument({...doc,canvasPages:[{id:'same',name:'一'},{id:'same',name:'二'}]}))
  assert.throws(() => validateArtifactDocument({...doc,kind:'slides'}))
  assert.throws(() => edit(doc,[{type:'page.patch',pageId:'board',patch:{canvasPageId:'missing'}}]))
})

test('an empty canvas page cannot be deleted after a concurrent board moves into it', () => {
  const initial=fixture(),doc=edit(initial,createCanvasPage(initial,'second')).document
  const removal=prepareBatch(doc,deleteCanvasPage(doc,'second'),'delete-empty')
  const current=edit(doc,moveCanvasArtboards(doc,['board'],'second'),'move-in').document
  assert.throws(()=>applyOperations(current,removal),ArtifactOperationConflict)
  assert.equal(canvasPageOf(current.pages.board!),'second')
})

test('canvas page creation retains the pinned forty-page limit with Chinese feedback',()=>{
  const initial=fixture(),doc={...initial,canvasPages:[...canvasPages(initial),...Array.from({length:39},(_,index)=>({id:`canvas-${index}`,name:`页面 ${index+2}`}))]}
  validateArtifactDocument(doc)
  assert.throws(()=>createCanvasPage(doc,'extra'),/40.*上限/)
  assert.throws(()=>validateArtifactDocument({...doc,canvasPages:[...doc.canvasPages,{id:'extra',name:'额外页面'}]}))
})

test('direct metadata patch or unset cannot orphan an unchanged board',()=>{
  const initial=fixture(),doc=edit(initial,createCanvasPage(initial,'second')).document
  const unchanged=doc.pages.board
  assert.throws(()=>edit(doc,[{type:'document.patch',patch:{canvasPages:[{id:'second',name:'第二页'}]}}]),/页面/)
  const moved=edit(doc,moveCanvasArtboards(doc,['board'],'second')).document
  assert.throws(()=>edit(moved,[{type:'document.patch',patch:{},unset:['canvasPages']}]),/页面/)
  assert.equal(doc.pages.board,unchanged)
  validateArtifactDocument(doc)
})

test('independent canvas objects persist outside board order and survive moving or deleting their neighbor board',()=>{
  const original=fixture(),first=canvasPages(original)[0].id,canvas=createPage('canvas-content','画布内容')
  Object.assign(canvas,{width:0,height:0,background:'transparent',canvasPageId:first});delete canvas.themeBackground
  const note={...createNode('note','canvas-note'),x:688,y:-778,width:240,height:40,text:'画布便签'}
  canvas.nodes={[note.id]:note};canvas.nodeOrder=[note.id]
  const doc=validateArtifactDocument({...original,canvasPages:[{id:first,name:'页面 1',contentId:canvas.id}],pages:{...original.pages,[canvas.id]:canvas}})
  assert.deepEqual(doc.pageOrder,['board'])
  const moved=edit(doc,[{type:'page.patch',pageId:'board',patch:{x:400,y:300}}]).document
  assert.deepEqual(moved.pages[canvas.id],doc.pages[canvas.id])
  const removed=edit(moved,[{type:'page.delete',pageId:'board'}])
  assert.deepEqual(removed.document.pageOrder,[])
  assert.equal(removed.document.pages[canvas.id]!.nodes[note.id]!.y,-778)
  assert.equal(validateArtifactDocument(JSON.parse(JSON.stringify(removed.document))).pages[canvas.id]!.nodes[note.id]!.text,'画布便签')
  const edited=edit(removed.document,[{type:'node.patch',pageId:canvas.id,nodeId:note.id,patch:{text:'独立画布文字'}}])
  assert.equal(edited.document.pages[canvas.id]!.nodes[note.id]!.text,'独立画布文字')
  assert.equal(edit(edited.document,edited.inverse).document.pages[canvas.id]!.nodes[note.id]!.text,'画布便签')
})


test('a lazy canvas body is an immutable file identity, not an extra board, with reversible optional metadata',()=>{
  const doc=fixture(),before=JSON.stringify(doc),first=canvasPages(doc)[0].id
  const result=edit(doc,createCanvasContents(doc,first,'contents'))
  assert.deepEqual(result.document.pageOrder,['board'])
  assert.deepEqual(artifactPageIds(result.document),['board','contents'])
  assert.equal(result.document.pages.board,doc.pages.board)
  assert.equal(result.document.pages.contents!.canvasPageId,first)
  assert.equal(result.document.pages.contents!.width,0)
  assert.deepEqual(createCanvasContents(result.document,first,'unused'),[])
  const restored=edit(result.document,result.inverse).document
  assert.equal(Object.hasOwn(restored,'canvasPages'),false)
  assert.deepEqual(restored.pages,doc.pages)
  assert.equal(JSON.stringify(doc),before)
})

test('canvas deletion includes its free content, supports undo, and conflicts with an edited canvas node',()=>{
  const initial=fixture(),first=canvasPages(initial)[0].id
  const added=edit(initial,createCanvasPage(initial,'second')).document
  const body=edit(added,createCanvasContents(added,first,'contents')).document
  const note={...createNode('note','independent'),text:'画布便签',x:-100,y:-300}
  const doc=edit(body,[{type:'node.insert',pageId:'contents',node:note}]).document
  const batch=prepareBatch(doc,deleteCanvasPage(doc,first),'remove-canvas')
  const current=edit(doc,[{type:'node.patch',pageId:'contents',nodeId:note.id,patch:{text:'保留新内容'}}]).document
  assert.throws(()=>applyOperations(current,batch),ArtifactOperationConflict)
  const deleted=applyOperations(doc,batch)
  assert.deepEqual(artifactPageIds(deleted.document),[])
  const restored=edit(deleted.document,deleted.inverse).document
  assert.deepEqual(restored.pages,doc.pages)
  assert.deepEqual(restored.canvasPages,doc.canvasPages)
  assert.deepEqual(restored.pageOrder,['board'])
})

test('metadata cannot orphan a body, share it between canvases or hide a board as a body',()=>{
  const initial=fixture(),first=canvasPages(initial)[0].id,doc=edit(initial,createCanvasContents(initial,first,'contents')).document
  assert.throws(()=>edit(doc,[{type:'document.patch',patch:{canvasPages:[{id:first,name:'页面 1'}]}}]))
  assert.throws(()=>edit(doc,[{type:'document.patch',patch:{canvasPages:[{id:first,name:'页面 1',contentId:'board'}]}}]))
  assert.throws(()=>edit(doc,[{type:'page.delete',pageId:'contents'}]))
  assert.throws(()=>validateArtifactDocument({...doc,canvasPages:[...doc.canvasPages!,{id:'other',name:'另一页',contentId:'contents'}]}))
  assert.throws(()=>validateArtifactDocument({...doc,pages:{...doc.pages,contents:{...doc.pages.contents!,canvasPageId:'missing'}}}))
  assert.throws(()=>edit(doc,[{type:'page.patch',pageId:'board',patch:{width:0}}]))
  assert.throws(()=>edit(doc,[{type:'pages.reorder',pageIds:['board','contents']}]))
})

test('free-node edits merge with unrelated artboard movement without rewriting either original snapshot',()=>{
  const initial=fixture(),first=canvasPages(initial)[0].id,withBody=edit(initial,createCanvasContents(initial,first,'contents')).document
  const note={...createNode('note','free'),text:'独立便签'}
  const doc=edit(withBody,[{type:'node.insert',pageId:'contents',node:note}]).document
  const saved=JSON.stringify(doc),change=prepareBatch(doc,[{type:'node.patch',pageId:'contents',nodeId:'free',patch:{x:-300}}],'free-edit')
  const board=edit(doc,[{type:'page.patch',pageId:'board',patch:{x:600}}]).document
  const merged=applyOperations(board,change).document
  assert.equal(merged.pages.board!.x,600)
  assert.equal(merged.pages.contents!.nodes.free!.x,-300)
  assert.equal(JSON.stringify(doc),saved)
})


test('canvas body create/delete batches preserve inverse roles in either metadata order',()=>{
  const initial=fixture(),first=canvasPages(initial)[0].id,ops=createCanvasContents(initial,first,'contents')
  const inserted=edit(initial,[...ops].reverse())
  assert.deepEqual(inserted.document.pageOrder,['board'])
  const restored=edit(inserted.document,inserted.inverse).document
  assert.deepEqual(restored.pages,initial.pages)
  assert.equal(restored.canvasPages,undefined)
  const before=inserted.document,without=canvasPages(before).map(({contentId:_content,...sheet})=>sheet)
  const deleted=edit(before,[{type:'document.patch',patch:{canvasPages:without}},{type:'page.delete',pageId:'contents'}])
  assert.deepEqual(deleted.document.pageOrder,['board'])
  const undo=edit(deleted.document,deleted.inverse).document
  assert.deepEqual(undo.pages,before.pages)
  assert.deepEqual(undo.canvasPages,before.canvasPages)
})

test('replacing a board with a same-ID canvas body and shared undo restores the original board role',()=>{
  const initial=fixture(),first=canvasPages(initial)[0].id
  const body={...createPage('board'),width:0,height:0}
  const result=edit(initial,[{type:'document.patch',patch:{canvasPages:[{id:first,name:'页面 1',contentId:'board'}]}},{type:'page.delete',pageId:'board'},{type:'page.insert',page:body}])
  assert.deepEqual(result.document.pageOrder,[])
  const undo=edit(result.document,result.inverse).document
  assert.deepEqual(undo.pageOrder,initial.pageOrder)
  assert.deepEqual(undo.pages,initial.pages)
  assert.equal(undo.canvasPages,undefined)
  const redo=edit(undo,[{type:'document.patch',patch:{canvasPages:[{id:first,name:'页面 1',contentId:'board'}]}},{type:'page.delete',pageId:'board'},{type:'page.insert',page:body}]).document
  assert.deepEqual(redo.pageOrder,[])
})
