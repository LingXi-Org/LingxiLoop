import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { RunEvent, RunState } from '@lyyzka/lingxios/ui'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { RunStreamProjection, assistantRunResponse } from '../agent-runtime/assistant-transport.js'
import { publicRunEvent } from '../agent-runtime/public-events.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
const fixture = JSON.parse(readFileSync(new URL('../../../docs/evidence/issue-533/worker-native-v2.json', import.meta.url),'utf8')) as {
  events: RunEvent[]; finalState: RunState; final: {body:string}; modelCalls:number; maxConcurrentReads:number
}
const initial: RunState = { ...fixture.finalState, run: { ...fixture.finalState.run, status:'leased', resultId:null, resultFence:null, goalOutcome:null }, message:null, delivery:null }

test('persisted mixed Worker events project useful text before tools, stage result before write, and replay once', () => {
  assert.equal(fixture.modelCalls,3);assert.equal(fixture.maxConcurrentReads,2)
  const projection = new RunStreamProjection(initial.run.id,false)
  projection.advance({type:'state',state:initial})
  const tools: string[] = []
  let preToolBody = '', stageBody = ''
  for(const event of fixture.events) {
    if(event.kind==='tool.started') {
      const name=String(event.data.name);tools.push(name)
      const snapshot=projection.snapshot
      const body=nativeText(snapshot.message)
      if(tools.length===1) {preToolBody=body;assert.match(body,/Gather collects/)}
      if(name==='probe.save') {
        stageBody=body;assert.match(body,/Both independent reads returned/)
        const latest=snapshot.message.content.filter(part=>part.type==='text'&&activityAnnotation(part)?.kind==='commentary').at(-1)
        assert.equal(latest?.type==='text'&&latest.text,'Both observations were received; I will save the synthetic record.')
      }
    }
    projection.advance({type:'event',event:publicRunEvent(event)})
  }
  assert.equal(tools.length,3);assert.ok(preToolBody.length<stageBody.length)
  projection.advance({type:'state',state:fixture.finalState})
  assert.equal(nativeText(projection.snapshot.message),fixture.final.body)
  const bodyParts=projection.snapshot.message.content.filter(part=>part.type==='text'&&activityAnnotation(part)?.purpose==='result')
  assert.ok(bodyParts.length>0)
  for(const text of ['Gather collects','Both independent reads returned','The synthetic artifact is saved.'])assert.equal(nativeText(projection.snapshot.message).split(text).length-1,1)
  const stable=projection.snapshot
  for(const event of fixture.events)projection.advance({type:'event',event:publicRunEvent(event)})
  assert.deepEqual(projection.snapshot,stable)
  const restored=new RunStreamProjection(initial.run.id,false)
  restored.advance({type:'state',state:initial})
  for(const event of fixture.events)restored.advance({type:'event',event:publicRunEvent(event)})
  restored.advance({type:'state',state:fixture.finalState})
  assert.deepEqual(restored.snapshot,stable)
})


test('persisted Worker events round-trip through native SSE, product encoder and actual client decoder', async () => {
  const inputs = [{type:'state',state:initial},...fixture.events.map(event=>({type:'event',event:publicRunEvent(event)})),{type:'state',state:fixture.finalState}]
  const bytes=new TextEncoder().encode(inputs.map(item=>`data: ${JSON.stringify(item)}\n\n`).join(''))
  const upstream=new ReadableStream<Uint8Array>({start(controller){
    controller.enqueue(bytes.slice(0,137));controller.enqueue(bytes.slice(137));controller.close()
  }})
  const response=assistantRunResponse(upstream,new RunStreamProjection(initial.run.id,false))
  assert.match(response.headers.get('content-type')??'',/^text\/event-stream/)
  const state=new AssistantTransportDeltaTracker(), bodies:string[]=[]
  for await(const chunk of AssistantStream.fromResponse(response,new AssistantTransportDecoder())){
    assert.equal(chunk.type,'update-state')
    if(chunk.type!=='update-state')continue
    state.append(chunk.operations)
    const snapshot=state.state as unknown as {message:Parameters<typeof nativeText>[0]}
    bodies.push(nativeText(snapshot.message))
  }
  assert.ok(bodies.some(body=>body.includes('Gather collects')&&!body.includes('Both independent reads returned')))
  assert.ok(bodies.some(body=>body.includes('Both independent reads returned')&&!body.includes('The synthetic artifact is saved.')))
  assert.equal(bodies.at(-1),fixture.final.body)
})
