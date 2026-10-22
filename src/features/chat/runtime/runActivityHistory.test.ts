import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ThreadMessage } from '@assistant-ui/react'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'
import { createRunView } from '@lyyzka/lingxios/ui'
import { activityHistoryContext, initialActivityHistory, syncActivityHistory, beginActivityHistoryRequest,
  finishActivityHistoryRequest, failActivityHistoryRequest, parseActivityPage } from './runActivityHistory'

const target = { conversationId: 'room', agentId: 'agent', runId: 'run', threadId: 'thread' }
function part(id: string, order = Number(id), approved?: boolean) {
  return { type: 'tool-call' as const, toolCallId: id, toolName: 'fixture', args: {}, argsText: '{}',
    ...(approved !== undefined ? { approval: { id: `approval-${id}`, approved } } : {}),
    providerMetadata: { lingxiloop: { activity: { version: 1, id, kind: 'tool', label: id, order, revision: order, requestVersion: 1 } } } }
}
function message(seq = 120, parts = [part('119'), part('120')], custom: Record<string, unknown> = {}) {
  return createNativeMessage({ id: 'run-run', role: 'assistant', content: parts, status: { type: 'running' }, custom: {
    runId: 'run', harnessControl: true, activityHistory: { total: 120, attention: 0 },
    harness: { ...createRunView('run'), requestVersion: 1, fence: 2, messageFence: 2, lastSeq: seq, artifacts: [] }, ...custom,
  } })
}
const live = (seq = 120, parts?: ReturnType<typeof part>[], custom?: Record<string, unknown>) => deserializeMessage(message(seq, parts, custom))
const context = (seq = 120, parts?: ReturnType<typeof part>[], custom?: Record<string, unknown>) => activityHistoryContext(target, live(seq, parts, custom))!
const page = (start: number, count = 40, seq = 120, total = 120) => parseActivityPage({ message: message(seq, Array.from({length: count}, (_,i) => part(String(start+i)))), total,
  nextOffset: start + count < total ? start + count : null },target,start)
function load(state: ReturnType<typeof initialActivityHistory>, ctx = context(), offset = state.nextOffset!) {
  const started = beginActivityHistoryRequest(state, ctx, Symbol())
  assert.ok(started.request)
  return finishActivityHistoryRequest(started, ctx, started.request!, page(offset))
}

test('over 80 activities load in bounded pages, stay ordered and never duplicate live identities', () => {
  const ctx = context()
  let state = initialActivityHistory(ctx)
  state = load(state); state = load(state); state = load(state)
  assert.equal(state.records.length, 120)
  assert.equal(state.nextOffset, null)
  assert.deepEqual(state.records.map(e => e.id), Array.from({length:120}, (_,i) => String(i)))
  assert.equal(beginActivityHistoryRequest(state,ctx,Symbol()),state)
  assert.equal(state.records[0].message.metadata.custom.harnessControl,false)
  assert.equal(state.records[0].message.content.length,1)
  assert.equal(state.records[0].readOnly,true)
})

test('old responses cannot cross run/requestVersion/fence/messageFence/sequence scopes', () => {
  for (const changed of [
    activityHistoryContext({...target,runId:'other'},live()),
    ...['requestVersion','fence','messageFence'].map(key => activityHistoryContext(target,live(120,undefined,{
      harness: {...createRunView('run'),requestVersion:1,fence:2,messageFence:2,lastSeq:120,artifacts:[],[key]:9},
    }))),
  ]) {
    const ctx = context(), started = beginActivityHistoryRequest(initialActivityHistory(ctx),ctx,Symbol())
    const next = syncActivityHistory(started,changed)
    assert.equal(finishActivityHistoryRequest(next,changed,started.request!,page(0)),next)
    assert.equal(failActivityHistoryRequest(next,changed,started.request!),next)
  }
})

test('live append preserves forward paging; retries keep loaded records and reject stale request tokens', () => {
  let state = load(initialActivityHistory(context()))
  const appended = context(121, [part('120'),part('121')], {activityHistory:{total:121,attention:0}})
  state = syncActivityHistory(state, appended)
  assert.equal(state.nextOffset,40)
  assert.equal(state.records.length,40)
  const started = beginActivityHistoryRequest(state,appended,Symbol())
  assert.equal(beginActivityHistoryRequest(started,appended,Symbol()),started)
  const failed = failActivityHistoryRequest(started,appended,started.request!)
  assert.equal(failed.records.length,40)
  assert.ok(failed.error)
  const retried = beginActivityHistoryRequest(failed,appended,Symbol())
  assert.equal(finishActivityHistoryRequest(retried,appended,started.request!,page(0)),retried)
  const completed = finishActivityHistoryRequest(retried,appended,retried.request!,page(40,40,121,121))
  assert.equal(completed.records.length,80)
  assert.equal(completed.nextOffset,80)
  assert.equal(completed.error,null)
})

test('current live approval wins even when an old page has the same id and revision', () => {
  const ctx = context(120,[part('1',1,true)])
  const started = beginActivityHistoryRequest(initialActivityHistory(ctx),ctx,Symbol())
  const completed = finishActivityHistoryRequest(started,ctx,started.request!,page(0))
  const one = completed.records.find(e=>e.id==='1')!.part
  assert.equal(one.type==='tool-call' && one.approval?.approved,true)
  assert.equal(completed.records.find(e=>e.id==='1')!.message.metadata.custom.harnessControl,false)
  const reconnected = syncActivityHistory(completed, context(121, []))
  assert.equal(reconnected.records.find(e=>e.id==='1')!.part,one)
})

test('page input rejects wrong identity, authority scope, malformed cursors, unbounded and duplicate records', () => {
  const valid = {message:message(),total:2,nextOffset:null}
  assert.equal(parseActivityPage(valid,target,0).message.id,'run-run')
  for (const bad of [
    {...valid,message:{...valid.message,id:'other'}},
    {...valid,message:message(120,undefined,{harness:{...createRunView('other'),requestVersion:1,fence:2,messageFence:2,lastSeq:120}})},
    {...valid,message:message(120,undefined,{harness:{...createRunView('run'),requestVersion:-1,fence:2,messageFence:2,lastSeq:120}})},
    {...valid,total:NaN}, {...valid,nextOffset:1}, {...valid,total:3},
    {...valid,message:message(120,Array.from({length:41},(_,i)=>part(String(i)))),total:41},
    {...valid,message:message(120,[part('1'),part('1')])},
  ]) assert.throws(()=>parseActivityPage(bad,target,0))
})

test('page watermark cannot precede the request; a same-scope response may finish after live advances', () => {
  const ctx=context(), started=beginActivityHistoryRequest(initialActivityHistory(ctx),ctx,Symbol())
  const rejected=finishActivityHistoryRequest(started,ctx,started.request!,page(0,40,119))
  assert.equal(rejected.records.length,0)
  assert.equal(rejected.nextOffset,0)
  assert.ok(rejected.error)
  const newer=context(121,[part('1',1,true)])
  const updated=syncActivityHistory(started,newer)
  const accepted=finishActivityHistoryRequest(updated,newer,started.request!,page(0))
  assert.equal(accepted.records.length,40)
  assert.equal(accepted.nextOffset,40)
  assert.equal(accepted.records[1].part.type==='tool-call' && accepted.records[1].part.approval?.approved,true)
})

test('continuous live events still permit forward pages, then an explicit stable pass finds archived insertions', () => {
  let ctx=context(), state=initialActivityHistory(ctx)
  for (let offset=0;offset<120;offset+=40) {
    const started=beginActivityHistoryRequest(state,ctx,Symbol())
    ctx=context(ctx.sequence+1)
    state=finishActivityHistoryRequest(syncActivityHistory(started,ctx),ctx,started.request!,page(offset,40,started.request!.sequence))
    assert.equal(state.records.length,offset+40)
  }
  assert.equal(state.nextOffset,0,'a new explicit pass must fill possible snapshot insertion gaps')
  const archive=part('archive-prefix',0)
  const all=[...Array.from({length:120},(_,i)=>part(String(i))),archive].sort((a,b)=>a.providerMetadata.lingxiloop.activity.order-b.providerMetadata.lingxiloop.activity.order)
  ctx=context(ctx.sequence,undefined,{activityHistory:{total:121,attention:0}})
  state=syncActivityHistory(state,ctx)
  while(state.nextOffset!==null) {
    const offset=state.nextOffset, started=beginActivityHistoryRequest(state,ctx,Symbol())
    const count=Math.min(40,all.length-offset)
    const current=parseActivityPage({message:message(ctx.sequence,all.slice(offset,offset+count)),total:121,nextOffset:offset+count<121?offset+count:null},target,offset)
    state=finishActivityHistoryRequest(started,ctx,started.request!,current)
  }
  assert.equal(state.records.length,121)
  assert.deepEqual(state.records.slice(0,3).map(e=>e.id),['0','archive-prefix','1'])
})

test('no history metadata or mismatching message identity offers no paging capability', () => {
  assert.equal(activityHistoryContext(target,{...live(),id:'other'} as ThreadMessage),null)
  assert.equal(activityHistoryContext(target,{...live(),metadata:{...live().metadata,custom:{...live().metadata.custom,activityHistory:null}}} as ThreadMessage),null)
})

// Optional legacy revision metadata must not downgrade a known, newer approval receipt.
test('a legacy page cannot erase a known revision after the live approval leaves the bounded window', () => {
  const approved = part('1',1,true)
  approved.providerMetadata.lingxiloop.activity.revision = 123
  let state = initialActivityHistory(context(120,[]))
  state = load(state,context(120,[])); state = load(state,context(120,[])); state = load(state,context(120,[]))
  state = syncActivityHistory(state,context(123,[approved]))
  const ctx = context(124,[])
  state = syncActivityHistory(state,ctx)
  const started = beginActivityHistoryRequest(state,ctx,Symbol())
  const older = part('1')
  Reflect.deleteProperty(older.providerMetadata.lingxiloop.activity,'revision')
  const response = parseActivityPage({message:message(124,[part('0'),older]),total:2,nextOffset:null},target,0)
  const finished = finishActivityHistoryRequest(started,ctx,started.request!,response)
  const receipt = finished.records.find(record=>record.id==='1')!.part
  assert.equal(receipt.type==='tool-call' && receipt.approval?.approved,true)
})

test('delivery-purpose records are not accepted as archived process pages', () => {
  const delivery = part('1')
  Reflect.set(delivery.providerMetadata.lingxiloop.activity,'purpose','result')
  assert.throws(()=>parseActivityPage({message:message(120,[delivery]),total:1,nextOffset:null},target,0))
})

// A REST page may be newer than a lagging stream without the dataset changing.
// The first validated page, not the live stream, must anchor this pagination pass.
test('stable API watermarks ahead of live complete single and multi-page history without looping', () => {
  for (const total of [1,85]) {
    const ctx = context(120,[],{activityHistory:{total,attention:0}})
    let state = initialActivityHistory(ctx), requests = 0
    for (let offset = 0; offset < total; offset += 40) {
      const started = beginActivityHistoryRequest(syncActivityHistory(state,ctx),ctx,Symbol())
      assert.equal(started.request?.offset,offset)
      state = finishActivityHistoryRequest(started,ctx,started.request!,page(offset,Math.min(40,total-offset),121,total))
      requests++
      assert.equal(state.passSequence,121)
    }
    assert.equal(state.records.length,total)
    assert.equal(state.nextOffset,null)
    assert.equal(state.refreshNeeded,false)
    const rendered = syncActivityHistory(state,ctx)
    assert.equal(beginActivityHistoryRequest(rendered,ctx,Symbol()),rendered)
    assert.equal(requests,Math.ceil(total/40))
    assert.equal(ctx.sequence,120,'read-only REST pages must not advance live controls')
  }
})

test('an API watermark change during a pass schedules one explicit stable pass to recover insertions', () => {
  const ctx = context(120,[],{activityHistory:{total:85,attention:0}})
  let state = initialActivityHistory(ctx)
  const initial = beginActivityHistoryRequest(state,ctx,Symbol())
  state = finishActivityHistoryRequest(initial,ctx,initial.request!,page(0,40,121,85))
  const all = [part('archive-prefix',0),...Array.from({length:85},(_,i)=>part(String(i)))]
  const currentPage = (offset: number) => parseActivityPage({message:message(122,all.slice(offset,offset+40)),total:all.length,
    nextOffset:offset+40<all.length?offset+40:null},target,offset)
  for (const offset of [40,80]) {
    const started = beginActivityHistoryRequest(state,ctx,Symbol())
    assert.equal(started.request?.offset,offset)
    state = finishActivityHistoryRequest(started,ctx,started.request!,currentPage(offset))
  }
  assert.equal(state.nextOffset,0)
  assert.equal(state.refreshNeeded,true)
  assert.equal(state.records.some(record=>record.id==='archive-prefix'),false)
  for (const offset of [0,40,80]) {
    const started = beginActivityHistoryRequest(state,ctx,Symbol())
    assert.equal(started.request?.offset,offset)
    state = finishActivityHistoryRequest(started,ctx,started.request!,currentPage(offset))
  }
  assert.equal(state.records.length,86)
  assert.equal(state.records.some(record=>record.id==='archive-prefix'),true)
  assert.equal(state.nextOffset,null)
  assert.equal(state.refreshNeeded,false)
})
