import {createCanvasContents} from '../../../../shared/artifact-canvas-pages'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document'
import { applyOperations, prepareBatch } from '../../../../shared/artifact-operations'
import { NativeDocumentSession, type DocumentReceipt, type NativeTransport } from './session'

function fixture() {
  const document = createDocument('slides', 'document')
  const one = createPage('page-one'), two = createPage('page-two')
  for (const page of [one, two]) { const node = createNode('text', `${page.id}-text`); page.nodes[node.id] = node; page.nodeOrder = [node.id]; document.pages[page.id] = page; document.pageOrder.push(page.id) }
  return document
}
function harness() {
  let document = fixture()
  let failures = 0
  let block: (() => Promise<void>) | undefined
  const ids: string[] = [], receipts = new Map<string, DocumentReceipt>()
  const receipt = (): DocumentReceipt => ({ document, write: true, history: { version: document.seq, undo: ids.at(-1) ?? null, redo: null } })
  const transport: NativeTransport = {
    read: async () => receipt(), all: async () => receipt(), page: async pageId => ({ page: document.pages[pageId], version: String(document.seq) }), changed: async seq => seq !== document.seq,
    commit: async batch => {
      ids.push(batch.operationId)
      if (block) await block()
      const cached = receipts.get(batch.operationId)
      if (cached) return cached
      document = applyOperations(document, batch).document
      const result = receipt(); receipts.set(batch.operationId, result)
      if (failures-- > 0) throw new Error('ack lost')
      return result
    },
    history: async () => receipt(),
  }
  return { session: new NativeDocumentSession(transport), transport, ids, get document() { return document }, failNext() { failures++ }, blockNext(fn: () => Promise<void>) { block = fn }, remote(text: string) { document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text } }])).document } }
}

test('lost acknowledgment retries original operation id exactly once and keeps draft', async () => {
  const h = harness(); await h.session.open(); h.failNext()
  h.session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'mine' } }])
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(h.session.getSnapshot().pending, 1)
  assert.equal(h.session.getSnapshot().document?.pages['page-one'].nodes['page-one-text'].text, 'mine')
  await h.session.retry()
  assert.equal(h.document.seq, 1)
  assert.deepEqual(h.ids, [h.ids[0], h.ids[0]])
  assert.equal(h.session.getSnapshot().pending, 0)
  h.session.dispose()
})

test('late text draft cannot overwrite same target changed by Agent', async () => {
  const h = harness(); await h.session.open(); const editingBase = h.session.getSnapshot().document!
  h.remote('Agent change'); await h.session.refresh()
  assert.throws(() => h.session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'old human draft' } }], editingBase), /targets changed/)
  assert.equal(h.document.pages['page-one'].nodes['page-one-text'].text, 'Agent change')
  assert.equal((h.session.recovery().operations[0].operations[0] as { patch: { text: string } }).patch.text, 'old human draft')
  h.session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'latest human draft after conflict' } }], editingBase)
  assert.equal((h.session.recovery().drafts[0][0] as { patch: { text: string } }).patch.text, 'latest human draft after conflict')
  h.session.dispose()
})

test('page payloads load on demand and unchanged loaded pages survive partial acknowledgment', async () => {
  const h = harness(); const full = h.document
  const partial = (): DocumentReceipt => ({ document: { ...full, pages: { ...full.pages, 'page-two': { ...full.pages['page-two'], nodeOrder: [], nodes: {} } } }, history: { version: 0, undo: null, redo: null }, write: true, pageVersions: { 'page-one': 'hash-one', 'page-two': 'hash-two' }, loadedPageIds: ['page-one'] })
  h.transport.read = async () => partial()
  h.transport.page = async pageId => ({ page: full.pages[pageId], version: 'hash-two' })
  await h.session.open()
  assert.equal(h.session.getSnapshot().document?.pages['page-two'].nodeOrder.length, 0)
  await h.session.ensurePage('page-two')
  assert.equal(h.session.getSnapshot().document?.pages['page-two'].nodeOrder.length, 1)
  await h.session.open()
  assert.equal(h.session.getSnapshot().document?.pages['page-two'].nodeOrder.length, 1)
  assert.deepEqual(h.session.getSnapshot().loadedPageIds, ['page-one', 'page-two'])
  h.session.dispose()
})

test('dependent unsent edits follow the acknowledged version after unrelated Agent operation', async () => {
  let document = fixture()
  let unblock!: () => void
  const gate = new Promise<void>(resolve => { unblock = resolve })
  let calls = 0
  const sent: string[] = []
  const receipt = (): DocumentReceipt => ({ document, history: { version: document.seq, undo: sent.at(-1) ?? null, redo: null }, write: true })
  const transport: NativeTransport = {
    read: async () => receipt(), all: async () => receipt(), page: async key => ({ page: document.pages[key], version: '' }), changed: async () => false, history: async () => receipt(),
    commit: async batch => {
      if (++calls === 1) await gate
      sent.push(batch.operationId)
      document = applyOperations(document, batch).document
      return { ...receipt(), committedSeq: document.seq }
    },
  }
  const session = new NativeDocumentSession(transport)
  await session.open()
  for (const text of ['a', 'ab', 'abc']) session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text } }])
  document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { x: 999 } }])).document
  unblock(); await session.flush()
  assert.equal(document.pages['page-one'].nodes['page-one-text'].text, 'abc')
  assert.equal(document.pages['page-one'].nodes['page-one-text'].x, 999)
  assert.equal(document.seq, 4)
  assert.equal(session.getSnapshot().conflict, false)
  assert.equal(session.getSnapshot().pending, 0)
  assert.equal(new Set(sent).size, 3)
  session.dispose()
})

test('a remote write after our acknowledgment is not translated into an overwrite', async () => {
  let document = fixture(), unblock!: () => void
  const gate = new Promise<void>(resolve => { unblock = resolve })
  const receipt = (): DocumentReceipt => ({ document, history: { version: document.seq, undo: null, redo: null }, write: true })
  const transport: NativeTransport = {
    read: async () => receipt(), all: async () => receipt(), page: async key => ({ page: document.pages[key], version: '' }), changed: async () => false, history: async () => receipt(),
    commit: async batch => {
      await gate
      document = applyOperations(document, batch).document
      const committedSeq = document.seq
      document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'remote newer' } }])).document
      return { ...receipt(), committedSeq }
    },
  }
  const session = new NativeDocumentSession(transport); await session.open()
  for (const text of ['a', 'ab']) session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text } }])
  unblock(); await assert.rejects(session.flush())
  assert.equal(document.pages['page-one'].nodes['page-one-text'].text, 'remote newer')
  assert.equal(session.getSnapshot().conflict, true)
  assert.equal(session.getSnapshot().pending, 1)
  session.dispose()
})

test('a captured active editor base follows its own ACK but never a later remote target edit', async () => {
  let document = fixture(), unblock!: () => void
  const gate = new Promise<void>(resolve => { unblock = resolve })
  let calls = 0
  const receipt = (): DocumentReceipt => ({ document, history: { version: document.seq, undo: null, redo: null }, write: true })
  const transport: NativeTransport = {
    read: async () => receipt(), all: async () => receipt(), page: async key => ({ page: document.pages[key], version: '' }), changed: async seq => seq !== document.seq, history: async () => receipt(),
    commit: async batch => { if (++calls === 1) await gate; document = applyOperations(document, batch).document; return { ...receipt(), committedSeq: document.seq } },
  }
  const session = new NativeDocumentSession(transport); await session.open()
  session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'a' } }])
  const activeEditorBase = session.getSnapshot().document!
  document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { x: 999 } }])).document
  unblock(); await session.flush()
  session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'ab' } }], activeEditorBase)
  const nextEditorBase = session.getSnapshot().document!
  await session.flush()
  assert.equal(document.pages['page-one'].nodes['page-one-text'].text, 'ab')
  assert.equal(document.pages['page-one'].nodes['page-one-text'].x, 999)
  document = applyOperations(document, prepareBatch(document, [{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'Agent final' } }])).document
  await session.refresh()
  assert.throws(() => session.dispatch([{ type: 'node.patch', pageId: 'page-one', nodeId: 'page-one-text', patch: { text: 'abc' } }], nextEditorBase), /targets changed/)
  assert.equal(document.pages['page-one'].nodes['page-one-text'].text, 'Agent final')
  assert.equal((session.recovery().operations[0].operations[0] as { patch: { text: string } }).patch.text, 'abc')
  session.dispose()
})


test('a loaded canvas body survives an unrelated compact board refresh at the same immutable hash',async()=>{
  const initial=fixture();initial.kind='design'
  let document=applyOperations(initial,prepareBatch(initial,[...createCanvasContents(initial,'canvas-page-1','contents'),{type:'node.insert',pageId:'contents',node:{...createNode('note','free'),text:'保留画布内容'}}])).document
  const receipt=():DocumentReceipt=>({document:{...document,pages:{...document.pages,contents:{...document.pages.contents,nodeOrder:[],nodes:{}}}},pageVersions:{'page-one':'board1','page-two':'board2',contents:'unchanged-body'},loadedPageIds:['page-one'],history:{version:0,undo:null,redo:null},write:true})
  const transport:NativeTransport={read:async()=>receipt(),all:async()=>({...receipt(),document}),page:async()=>({page:document.pages.contents,version:'unchanged-body'}),changed:async()=>true,commit:async()=>receipt(),history:async()=>receipt()}
  const session=new NativeDocumentSession(transport)
  await session.open();await session.ensurePage('contents')
  assert.equal(session.getSnapshot().document!.pages.contents.nodes.free.text,'保留画布内容')
  document=applyOperations(document,prepareBatch(document,[{type:'page.patch',pageId:'page-one',patch:{x:500}}])).document
  await session.refresh()
  assert.equal(session.getSnapshot().document!.pages.contents.nodes.free.text,'保留画布内容')
  assert.ok(session.getSnapshot().loadedPageIds.includes('contents'))
  session.dispose()
})
