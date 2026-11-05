import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage, validateArtifactDocument } from './artifact-document.js'
import { applyOperations, ArtifactOperationConflict, prepareBatch } from './artifact-operations.js'
import { canvasPages, canvasPageOf, createCanvasPage, renameCanvasPage, deleteCanvasPage, moveCanvasArtboards } from './artifact-canvas-pages.js'

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
