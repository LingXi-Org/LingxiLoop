import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createNativeMessage, deserializeMessage } from '@/lib/nativeMessage'
import { activityHistoryContext, beginActivityHistoryRequest, failActivityHistoryRequest, finishActivityHistoryRequest, initialActivityHistory, parseActivityPage } from './runActivityHistory'
import { createRunView } from '@lyyzka/lingxios/ui'

mock.module('@/api/transport', { namedExports: { lingxiApiFetch: () => { throw new Error('unexpected transport') } } })
mock.module('@/stores/auth', { namedExports: { getActiveCompanyId: () => 'company' } })
mock.module('@/lib/workspaceSession', { namedExports: { getWorkspaceSession: () => ({ companyId: 'company',projectId: 'project' }) } })

let httpRequest: (path: string, init: RequestInit) => Promise<unknown> = async () => { throw new Error('unexpected request') }
mock.module('@/api/core/http', { namedExports: { API: '/api', http: (path: string, init: RequestInit) => { init.signal?.throwIfAborted(); return httpRequest(path,init) } } })

// Failure cases: activity reads bypass thread scope/cancellation or accept a
// different run's page; stale control metadata must never become a live read.
test('activity pages use the existing scoped HTTP read and validate native identity and bounds', async () => {
  const target = { conversationId: 'room with space',agentId: 'agent',runId: 'run',threadId: 'thread with space' }
  let invalid = false
  const controller = new AbortController()
  httpRequest = async (path: string,init: RequestInit) => {
    assert.match(path,/channels\/room%20with%20space\/agents\/agent\/runs\/run\?/)
    const query = new URLSearchParams(path.split('?')[1])
    assert.equal(query.get('threadId'),'thread with space')
    assert.equal(query.get('activityOffset'),'0')
    assert.equal(query.has('attentionOnly'),false)
    assert.ok(init.signal)
    assert.equal(init.signal.aborted,false)
    return { message: createNativeMessage({ id: invalid ? 'run-other' : 'run-run',role: 'assistant',content: [{type:'text',text:'公开过程',
      providerMetadata:{lingxiloop:{activity:{version:1,id:'public-1',kind:'commentary',label:'公开过程'}}}}],
      custom:{runId:'run',harness:{...createRunView('run'),artifacts:[]}} }),total:1,nextOffset:null }
  }
  const { harnessApi } = await import('./harness-api')
  assert.equal((await harnessApi.activity(target,0,false,controller.signal)).message.content.length,1)
  invalid = true
  await assert.rejects(harnessApi.activity(target,0,false,controller.signal))
})

// A hanging read must leave the loading state without losing the previously
// loaded page; cancelling the owning component must stay distinct from timeout.
test('activity timeout preserves records/cursor and permits an explicit retry', async () => {
  const target = { conversationId:'room',agentId:'agent',runId:'run' }
  const snapshot = createNativeMessage({ id:'run-run',role:'assistant',content:[],custom:{runId:'run',activityHistory:{total:2,attention:0},harness:{...createRunView('run'),artifacts:[]}} })
  const response = (id: string, nextOffset: number | null) => ({message:{...snapshot,content:[{type:'text',text:id,
    providerMetadata:{lingxiloop:{activity:{version:1,id,kind:'commentary',label:id}}}}]},total:2,nextOffset})
  const ctx = activityHistoryContext(target,deserializeMessage(snapshot))!
  let state = beginActivityHistoryRequest(initialActivityHistory(ctx),ctx,Symbol())
  state = finishActivityHistoryRequest(state,ctx,state.request!,parseActivityPage(response('one',1),target,0))
  state = beginActivityHistoryRequest(state,ctx,Symbol())
  const request = state.request!, caller = new AbortController(), deadlines: AbortController[] = []
  const timeout = mock.method(AbortSignal,'timeout',(milliseconds: number) => {
    assert.equal(milliseconds,30_000)
    const deadline = new AbortController()
    deadlines.push(deadline)
    return deadline.signal
  })
  try {
    httpRequest = async (path,init) => {
      assert.equal(new URLSearchParams(path.split('?')[1]).get('activityOffset'),'1')
      const signal = init.signal!
      return new Promise((_,reject) => signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
    }
    const { harnessApi } = await import('./harness-api')
    const outcome = harnessApi.activity(target,request.offset,false,caller.signal).then(()=>null,error=>error)
    assert.equal(timeout.mock.callCount(),1,'every history page must have a bounded read')
    deadlines[0].abort(new DOMException('Deadline exceeded','TimeoutError'))
    assert.equal((await outcome)?.name,'TimeoutError')
    assert.equal(caller.signal.aborted,false,'timeout must reach the hook error branch, not its caller-abort guard')
    state = failActivityHistoryRequest(state,ctx,request)
    assert.equal(state.records.length,1)
    assert.equal(state.nextOffset,1)
    assert.equal(state.request,null)
    assert.ok(state.error)
    state = beginActivityHistoryRequest(state,ctx,Symbol())
    assert.equal(state.request?.offset,1)
    httpRequest = async () => response('two',null)
    const page = await harnessApi.activity(target,1,false,caller.signal)
    state = finishActivityHistoryRequest(state,ctx,state.request!,page)
    assert.equal(state.records.length,2)
    assert.equal(state.nextOffset,null)
    assert.equal(state.error,null)
  } finally { caller.abort(); timeout.mock.restore() }
})

test('caller cancellation still aborts activity reads independently of their deadline', async () => {
  const deadline = new AbortController(), caller = new AbortController()
  const timeout = mock.method(AbortSignal,'timeout',()=>deadline.signal)
  try {
    httpRequest = async (_path,init) => new Promise((_,reject) => init.signal!.addEventListener('abort',()=>reject(init.signal!.reason),{once:true}))
    const { harnessApi } = await import('./harness-api')
    const outcome = harnessApi.activity({conversationId:'room',agentId:'agent',runId:'run'},0,false,caller.signal).then(()=>null,error=>error)
    caller.abort()
    assert.equal((await outcome)?.name,'AbortError')
    assert.equal(caller.signal.aborted,true,'the existing hook suppresses owner/scope/unmount cancellation')
    assert.equal(deadline.signal.aborted,false)
  } finally { timeout.mock.restore() }
})

test('terminal trace reads pin feedback/request/fence and cannot substitute another attempt',async()=>{
  const { harnessApi }=await import('./harness-api')
  const target={conversationId:'room',agentId:'agent',runId:'run',threadId:'thread'}
  const reference={version:1 as const,runId:'run',requestVersion:2,fence:3,feedbackId:'feedback'}
  let wrong=false
  httpRequest=async(path,init)=>{
    const query=new URLSearchParams(path.split('?')[1]);assert.equal(query.get('threadId'),'thread')
    assert.equal(query.get('terminalFeedbackId'),'feedback');assert.equal(query.get('traceRequestVersion'),'2');assert.equal(query.get('traceFence'),'3');assert.ok(init.signal)
    return {message:createNativeMessage({id:'run-run',role:'assistant',content:[],custom:{runId:'run',
      harness:{...createRunView('run'),requestVersion:wrong?3:2,fence:3,artifacts:[]},
      terminalFeedback:{id:'feedback',requestVersion:2}}})}
  }
  await harnessApi.readTerminalTrace(target,reference)
  wrong=true;await assert.rejects(harnessApi.readTerminalTrace(target,reference),/运行记录已更新/)
  await assert.rejects(harnessApi.readTerminalTrace({...target,runId:'other'},reference),/运行身份不一致/)
})
