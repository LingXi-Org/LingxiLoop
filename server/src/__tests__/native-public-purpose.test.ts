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

test('native purpose keeps a same-attempt tool answer visible through actual transport decoding and supersedes by identity',async()=>{
  const frames=[{type:'state',state},{type:'event',event:delta(1,'commentary','任意公开过程 A')},{type:'event',event:delta(2,'answer','I will explain why this answer is correct.')},
    {type:'event',event:{...delta(3,'answer',''),kind:'public.text.ended',stage:'completed',data:{version:2,requestVersion:1,fence:1,attemptId:'attempt',partId:'answer',partIndex:1,purpose:'answer',chunkCount:1,reason:'tool'}}},
    {type:'event',event:{runId:'run',seq:4,kind:'tool.started',stage:'started',visibility:'user',data:{requestVersion:1,fence:1,attemptId:'attempt',toolCallId:'probe',name:'documents.read'}}},
    {type:'event',event:{runId:'run',seq:5,kind:'tool.completed',stage:'completed',visibility:'user',data:{requestVersion:1,fence:1,attemptId:'attempt',toolCallId:'probe',result:{ok:true}}}}]
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
  for(const frame of frames)if('event' in frame)replay=consumeRunEvent(replay,frame.event as RunEvent) as typeof replay
  assert.deepEqual(runMessageParts(replay,[]).filter(part=>part.type==='text').map(activityAnnotation),last.message.content.filter(part=>part.type==='text').map(activityAnnotation))
  const next=delta(6,'answer','The final corrected answer.')
  replay=consumeRunEvent(replay,{...next,data:{...next.data,attemptId:'final-attempt',partId:'final-answer'}}) as typeof replay
  assert.deepEqual(runMessageParts(replay,[]).filter(part=>part.type==='text').map(part=>[part.text,activityAnnotation(part)?.kind]),[
    ['任意公开过程 A','commentary'],['I will explain why this answer is correct.','commentary'],['The final corrected answer.','answer'],
  ])
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


test('first declared commentary and successive answer chunks stay correctly visible before stream EOF',{timeout:3000},async()=>{
  let source!:ReadableStreamDefaultController<Uint8Array>
  const input=new ReadableStream<Uint8Array>({start(controller){source=controller}})
  const response=assistantRunResponse(input,new RunStreamProjection('run',true))
  const reader=AssistantStream.fromResponse(response,new AssistantTransportDecoder()).getReader()
  const tracker=new AssistantTransportDeltaTracker()
  const send=(frame:object)=>source.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(frame)}\n\n`))
  const untilText=async(text:string)=>{
    while(true){
      const next=await reader.read()
      assert.equal(next.done,false,'the requested text must arrive before EOF')
      if(next.value!.type!=='update-state')continue
      tracker.append(next.value!.operations)
      const snapshot=structuredClone(tracker.state) as unknown as AgentRunSnapshot
      if(snapshot.message.content.some(part=>part.type==='text'&&part.text===text))return snapshot.message
    }
  }
  try{
    send({type:'state',state})
    send({type:'event',event:delta(1,'commentary','The observed step is pending.')})
    const first=await untilText('The observed step is pending.')
    assert.equal(first.status?.type,'running')
    assert.equal(activityAnnotation(first.content.find(part=>part.type==='text'&&part.text==='The observed step is pending.')!)?.kind,'commentary')
    assert.equal(first.content.some(part=>activityAnnotation(part)?.kind==='answer'),false)
    send({type:'event',event:delta(2,'answer','First substantive result.')})
    const answer=await untilText('First substantive result.')
    const firstAnswer=answer.content.find(part=>part.type==='text'&&part.text==='First substantive result.')!
    assert.equal(activityAnnotation(firstAnswer)?.kind,'answer')
    const continuation=delta(3,'answer',' Additional supporting detail.')
    send({type:'event',event:{...continuation,data:{...continuation.data,chunkIndex:1}}})
    const continued=await untilText('First substantive result. Additional supporting detail.')
    const answerPart=continued.content.find(part=>part.type==='text'&&part.text==='First substantive result. Additional supporting detail.')!
    assert.equal(continued.status?.type,'running')
    assert.equal(activityAnnotation(answerPart)?.kind,'answer')
    assert.equal(activityAnnotation(answerPart)?.id,activityAnnotation(firstAnswer)?.id)
    assert.equal(continued.content.filter(part=>activityAnnotation(part)?.kind==='answer').length,1)
  }finally{source.close();await reader.cancel();reader.releaseLock()}
})
