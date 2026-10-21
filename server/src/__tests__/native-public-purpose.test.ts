import assert from 'node:assert/strict'
import test from 'node:test'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { createRunView, consumeRunEvent, type RunEvent } from '@lyyzka/lingxios/ui'
import { RunStreamProjection, assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import { runMessageParts } from '../agent-runtime/message-projection.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'

const delta=(seq:number,purpose:'commentary'|'answer',text:string):RunEvent=>({runId:'run',seq,kind:'public.text.delta',stage:'delta',visibility:'user',data:{
  version:2,requestVersion:1,fence:1,attemptId:'attempt',partId:purpose,partIndex:purpose==='commentary'?0:1,purpose,chunkIndex:0,text,
}})
const state={run:{id:'run',status:'leased' as const,fence:1,requestVersion:1,resultId:null,resultFence:null,kind:'turn',attempts:1,createdAt:'2026-10-21T00:00:00Z',availableAt:'',heartbeatAt:null,lastProgressAt:null,goalOutcome:null,error:null},message:null,delivery:null}

test('native purpose is effective at the first chunk and survives actual transport decoding',async()=>{
  const frames=[{type:'state',state},{type:'event',event:delta(1,'commentary','任意公开过程 A')},{type:'event',event:delta(2,'answer','I will explain why this answer is correct.')}]
  const projection=new RunStreamProjection('run',true)
  const bytes=new TextEncoder().encode(frames.map(frame=>`event: ${frame.type}\ndata: ${JSON.stringify(frame)}\n\n`).join(''))
  const response=assistantRunResponse(new ReadableStream({start(controller){controller.enqueue(bytes);controller.close()}}),projection)
  const tracker=new AssistantTransportDeltaTracker(),snapshots:AgentRunSnapshot[]=[]
  for await(const chunk of AssistantStream.fromResponse(response,new AssistantTransportDecoder())){
    assert.equal(chunk.type,'update-state')
    if(chunk.type==='update-state'){tracker.append(chunk.operations);snapshots.push(structuredClone(tracker.state) as unknown as AgentRunSnapshot)}
  }
  const withCommentary=snapshots.find(snapshot=>snapshot.message.content.some(part=>part.type==='text'&&part.text==='任意公开过程 A'))!
  assert.ok(withCommentary)
  assert.equal(activityAnnotation(withCommentary.message.content.find(part=>part.type==='text'&&part.text==='任意公开过程 A')!)?.kind,'commentary')
  const last=snapshots.at(-1)!
  assert.deepEqual(last.message.content.filter(part=>part.type==='text').map(part=>[part.text,activityAnnotation(part)?.kind]),[
    ['任意公开过程 A','commentary'],['I will explain why this answer is correct.','answer'],
  ])
  let replay={...createRunView('run'),requestVersion:1,fence:1,lifecycle:'leased' as const}
  for(const event of [delta(1,'commentary','任意公开过程 A'),delta(2,'answer','I will explain why this answer is correct.')])replay=consumeRunEvent(replay,event) as typeof replay
  assert.deepEqual(runMessageParts(replay,[]).map(activityAnnotation),last.message.content.map(activityAnnotation))
})

test('a completed commentary part cannot hide a separate answer preview',()=>{
  let view=consumeRunEvent({...createRunView('run'),requestVersion:1,fence:1,lifecycle:'leased'},delta(1,'commentary','Progress'))
  view=consumeRunEvent(view,{...delta(2,'commentary',''),kind:'public.text.ended',stage:'completed',data:{version:2,requestVersion:1,fence:1,attemptId:'attempt',partId:'commentary',partIndex:0,purpose:'commentary',chunkCount:1,reason:'completed'}})
  const parts=runMessageParts({...view,draft:'A genuine answer preview'},[])
  assert.ok(parts.some(part=>part.type==='text'&&part.text==='A genuine answer preview'&&activityAnnotation(part)?.kind==='answer'))
})

test('explicit failed answer becomes history when the next declared attempt begins',()=>{
  let view=consumeRunEvent({...createRunView('run'),requestVersion:1,fence:1,lifecycle:'leased'},delta(1,'answer','Abandoned answer'))
  view=consumeRunEvent(view,{...delta(2,'answer',''),kind:'public.text.ended',stage:'completed',data:{version:2,requestVersion:1,fence:1,attemptId:'attempt',partId:'answer',partIndex:1,purpose:'answer',chunkCount:1,reason:'failed'}})
  const next=delta(3,'commentary','Retry status')
  view=consumeRunEvent(view,{...next,data:{...next.data,attemptId:'next-attempt',partId:'next-commentary'}})
  assert.deepEqual(runMessageParts(view,[]).map(part=>[part.type==='text'?part.text:part.type,activityAnnotation(part)?.kind]),[
    ['Abandoned answer','commentary'],['Retry status','commentary'],
  ])
})
