import {createCanvasContents} from '../../../../shared/artifact-canvas-pages'
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDocument, createNode, createPage } from '../../../../shared/artifact-document'
import { applyOperations, prepareBatch,artifactVersionKey } from '../../../../shared/artifact-operations'
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

test('权限变化前的代码草稿只保存在恢复数据中，重试不绕过授权或自动覆盖',async()=>{
  const h=harness(),read=h.transport.read
  h.transport.read=async()=>({...await read(),write:false})
  await h.session.open()
  const operations=[{type:'node.patch' as const,pageId:'page-one',nodeId:'page-one-text',patch:{attributes:{'data-label':'中文权限草稿'}}}]
  h.session.retainDraft(operations)
  operations[0].patch.attributes['data-label']='不能改写恢复副本'
  assert.equal(h.session.hasRetainedDrafts,true)
  assert.ok(JSON.stringify(h.session.recovery()).includes('中文权限草稿'))
  await h.session.retry();assert.equal(h.ids.length,0)
  h.transport.read=read;await h.session.open()
  assert.equal(h.session.hasRetainedDrafts,true)
  await assert.rejects(h.session.flush())
  assert.equal(h.ids.length,0)
  await h.session.discardAfterRecovery()
  assert.equal(h.session.hasRetainedDrafts,false)
  h.session.dispose()
})

test('组字访问丢失的原始代码由会话保留，恢复读取不自动提交，显式清理才解除草稿',async()=>{
  const h=harness();await h.session.open();const base=h.session.getSnapshot().document!
  h.transport.changed=async()=>{throw Object.assign(new Error('无权读取'),{status:403})}
  await h.session.refresh();assert.equal(h.session.getSnapshot().document,null)
  const raw={pageId:'page-one',nodeIds:['page-one-text'],text:'// 中文组字未结束\nwidth: calc(',before:[{name:'width',value:'320px'}],base}
  h.session.retainCodeDraft(raw)
  raw.text='不能修改已保留副本'
  assert.equal(h.session.hasRetainedDrafts,true)
  assert.equal(h.session.recovery().codeDrafts[0].text,'// 中文组字未结束\nwidth: calc(')
  await h.session.retry()
  assert.equal(h.ids.length,0)
  assert.equal(h.session.getCodeDraft('page-one',['page-one-text'])?.base,base)
  await assert.rejects(h.session.flush())
  h.session.clearCodeDraft('page-one',['page-one-text'])
  assert.equal(h.session.hasRetainedDrafts,false)
  await h.session.flush();assert.equal(h.ids.length,0);h.session.dispose()
})

test('显式保留副本后重载推进代码草稿代次，旧控件清理可识别已经清除的输入',async()=>{
  const h=harness();await h.session.open();const base=h.session.getSnapshot().document!
  assert.equal(h.session.codeDraftGeneration,0)
  h.session.retainCodeDraft({pageId:'page-one',nodeIds:['page-one-text'],text:'@data-label: 中文恢复草稿',before:[],base})
  const observed=h.session.codeDraftGeneration
  await h.session.discardAfterRecovery()
  assert.equal(h.session.codeDraftGeneration,observed+1)
  assert.equal(h.session.getCodeDraft('page-one',['page-one-text']),undefined)
  assert.equal(h.session.hasRetainedDrafts,false)
  assert.equal(h.ids.length,0);h.session.dispose()
})

test('geometry read dependencies reject a peer transform arriving after the client snapshot',async()=>{
  let document=fixture()
  const receipt=():DocumentReceipt=>({document,write:true,history:{version:0,undo:null,redo:null}})
  const transport:NativeTransport={read:async()=>receipt(),all:async()=>receipt(),page:async id=>({page:document.pages[id],version:String(document.seq)}),changed:async()=>false,history:async()=>receipt(),commit:async batch=>{try{document=applyOperations(document,batch).document;return receipt()}catch(error){throw Object.assign(error as Error,{status:409})}}}
  const session=new NativeDocumentSession(transport);await session.open();const base=session.getSnapshot().document!
  document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{rotation:90}}])).document
  const readKey=artifactVersionKey.node('page-one','page-one-text','field/rotation')
  session.dispatch([{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{width:450}}],base,[readKey])
  await assert.rejects(session.flush())
  assert.equal(session.getSnapshot().conflict,true);assert.equal(document.pages['page-one'].nodes['page-one-text'].rotation,90);assert.equal(document.pages['page-one'].nodes['page-one-text'].width,320)
  assert.equal(session.recovery().operations[0].expectedVersions[readKey],0)
  assert.equal(base.pages['page-one'].nodes['page-one-text'].rotation,0);session.dispose()
})

test('geometry read dependencies allow an unrelated peer color to merge',async()=>{
  let document=fixture()
  const receipt=():DocumentReceipt=>({document,write:true,history:{version:0,undo:null,redo:null}})
  const transport:NativeTransport={read:async()=>receipt(),all:async()=>receipt(),page:async id=>({page:document.pages[id],version:String(document.seq)}),changed:async()=>false,history:async()=>receipt(),commit:async batch=>{document=applyOperations(document,batch).document;return receipt()}}
  const session=new NativeDocumentSession(transport);await session.open();const base=session.getSnapshot().document!
  document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{style:{color:'#ff0000'}}}])).document
  session.dispatch([{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{width:450}}],base,[artifactVersionKey.node('page-one','page-one-text','field/rotation')])
  await session.flush();assert.equal(document.pages['page-one'].nodes['page-one-text'].width,450);assert.equal(document.pages['page-one'].nodes['page-one-text'].style.color,'#ff0000');session.dispose()
})

test('控制点坐标依赖随自己的旋转确认版本转换，仍拒绝后来的远程旋转',async()=>{
  for(const remoteAfter of [false,true]){
    let document=fixture(),unblock!:()=>void,calls=0
    const gate=new Promise<void>(resolve=>{unblock=resolve}),readKey=artifactVersionKey.node('page-one','page-one-text','field/rotation'),expected:number[]=[]
    const receipt=():DocumentReceipt=>({document,write:true,history:{version:document.seq,undo:null,redo:null}})
    const transport:NativeTransport={read:async()=>receipt(),all:async()=>receipt(),page:async id=>({page:document.pages[id],version:String(document.seq)}),changed:async()=>false,history:async()=>receipt(),commit:async batch=>{
      if(++calls===1)await gate
      expected.push(batch.expectedVersions[readKey])
      try{document=applyOperations(document,batch).document}catch(error){throw Object.assign(error as Error,{status:409})}
      const committedSeq=document.seq
      if(calls===1&&remoteAfter)document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{rotation:180}}])).document
      return{...receipt(),committedSeq}
    }}
    const session=new NativeDocumentSession(transport);await session.open()
    session.dispatch([{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{rotation:90}}])
    const base=session.getSnapshot().document!;assert.equal(base.versions[readKey],1)
    session.dispatch([{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{width:450}}],base,[readKey])
    document=applyOperations(document,prepareBatch(document,[{type:'node.patch',pageId:'page-one',nodeId:'page-one-text',patch:{style:{color:'#ff0000'}}}])).document
    unblock()
    if(remoteAfter){await assert.rejects(session.flush());assert.equal(session.getSnapshot().conflict,true);assert.equal(document.pages['page-one'].nodes['page-one-text'].rotation,180);assert.equal(document.pages['page-one'].nodes['page-one-text'].width,320)}
    else{await session.flush();assert.deepEqual(expected,[0,2]);assert.equal(document.pages['page-one'].nodes['page-one-text'].width,450);assert.equal(session.getSnapshot().conflict,false)}
    assert.equal(document.pages['page-one'].nodes['page-one-text'].style.color,'#ff0000');session.dispose()
  }
})

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

test('写入被拒绝后重读文档仍须显示未保存状态，恢复权限后复用原操作提交',async()=>{
 let document=fixture(),write=true,denied=true;const ids:string[]=[]
 const receipt=():DocumentReceipt=>({document,write,history:{version:document.seq,undo:null,redo:null}})
 const transport:NativeTransport={read:async()=>receipt(),all:async()=>receipt(),page:async id=>({page:document.pages[id],version:String(document.seq)}),changed:async()=>false,history:async()=>receipt(),commit:async batch=>{ids.push(batch.operationId);if(denied)throw Object.assign(new Error('写入已拒绝'),{status:403});document=applyOperations(document,batch).document;return receipt()}}
 const session=new NativeDocumentSession(transport);await session.open();session.dispatch([{type:'page.patch',pageId:'page-one',patch:{notes:'拒绝后保留的本地备注'}}]);await assert.rejects(session.flush());write=false;await session.retry()
 assert.equal(session.getSnapshot().write,false);assert.equal(session.getSnapshot().pending,1);assert.match(session.getSnapshot().error,/尚未保存/);assert.equal(session.getSnapshot().document?.pages['page-one'].notes,'拒绝后保留的本地备注');assert.equal(document.pages['page-one'].notes,'')
 write=true;denied=false;await session.open();await session.retry();assert.equal(document.pages['page-one'].notes,'拒绝后保留的本地备注');assert.equal(session.getSnapshot().pending,0);assert.equal(session.getSnapshot().error,'');assert.equal(new Set(ids).size,1);session.dispose()
})

 test('派生排版摘要随文档收据更新，缺失摘要不复用旧版本',async()=>{
  const h=harness(),read=h.transport.read,census={'page-two':[{size:48,roles:{Body:1},families:{Arial:1}}]};let include=true
  h.transport.read=async signal=>({...await read(signal),...(include?{typography:census}:{})})
  await h.session.open();assert.deepEqual(h.session.getSnapshot().typography,census)
  include=false;await h.session.open();assert.equal(h.session.getSnapshot().typography,undefined);h.session.dispose()
 })

test('字体声明摘要跟随新收据，缺失时清除，避免未加载页面沿用旧字体',async()=>{
 const h=harness(),read=h.transport.read,fontFamilies={'page-two':{first:['Georgia'],display:['Georgia']}};let include=true
 h.transport.read=async signal=>({...await read(signal),...(include?{fontFamilies}:{})})
 await h.session.open();assert.deepEqual(h.session.getSnapshot().fontFamilies,fontFamilies)
 include=false;await h.session.open();assert.equal(h.session.getSnapshot().fontFamilies,undefined);h.session.dispose()
})
