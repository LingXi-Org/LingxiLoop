import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunEvent } from '@lyyzka/lingxios/ui'
import { priorToolNames, publicRunEvent, publicRunStream, publicToolValue } from '../agent-runtime/public-events.js'

test('public tool transport strips private values before SSE and preserves fragmented body previews', async () => {
  const event: RunEvent = { runId:'run',seq:2,kind:'tool.completed',stage:'completed',visibility:'user',data:{toolCallId:'host:calendar',result:{status:'completed',value:{id:'event',title:'Study',startAt:'2026-09-26T10:00:00Z',allDay:false,privateNotes:'PRIVATE'}}} }
  const projected=publicRunEvent(event,'calendar.get')
  assert.doesNotMatch(JSON.stringify(projected),/PRIVATE|privateNotes/)
  assert.equal((projected.data.result as {value:{title:string}}).value.title,'Study')
  const frames = 'event: preview\ndata: '+JSON.stringify({type:'preview',preview:{delta:'正文'}})+'\n\nid: 2\nevent: event\ndata: '+JSON.stringify({type:'event',event})+'\n\n'
  const bytes = new TextEncoder().encode(frames)
  const stream=new ReadableStream<Uint8Array>({start(c){ for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close() }})
  let output=''
  for await(const chunk of publicRunStream(stream,async()=> 'calendar.get')) output+=chunk
  assert.match(output,/正文/)
  assert.match(output,/id: 2/)
  assert.doesNotMatch(output,/PRIVATE|privateNotes/)
  assert.equal(publicToolValue('files.read',{text:'PRIVATE'}),undefined)
  assert.equal(publicToolValue('email.show',{body:'PRIVATE'}),undefined)
  assert.deepEqual(publicToolValue('memory.apply',{documents:[{id:'m',description:'Preference',status:'active',body:'PRIVATE'}],deleted:[]}),{documents:[{id:'m',description:'Preference',status:'active'}],deleted:[]})
  await assert.rejects(async()=>{for await(const _ of publicRunStream(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {'));c.close()}}),async()=>undefined)){}},/inside a frame/)
})

 test('reconnect recovers tool identity from paginated public history without exposing other calls', async()=>{
  const event: RunEvent={runId:'run',seq:101,kind:'tool.started',stage:'started',visibility:'user',data:{toolCallId:'wanted',name:'calendar.get'}}
  const cursors:number[]=[]
  const names=await priorToolNames(async after=>{cursors.push(after);return after===0?{events:Array.from({length:100},(_,i)=>({...event,seq:i+1,data:{toolCallId:'other',name:'files.read'}})),nextSeq:100}:{events:[event],nextSeq:101}},new Set(['wanted']))
  assert.deepEqual([...names],[['wanted','calendar.get']]);assert.deepEqual(cursors,[0,100])
})
