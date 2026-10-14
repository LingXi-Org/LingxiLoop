import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunEvent } from '@lyyzka/lingxios/ui'
import { publicRunEvent, nativeRunEvents, publicToolValue } from '../agent-runtime/public-events.js'

test('public tool projection strips private values before transport', async () => {
  const event: RunEvent = { runId:'run',seq:2,kind:'tool.completed',stage:'completed',visibility:'user',data:{toolCallId:'host:calendar',result:{status:'completed',value:{id:'event',title:'Study',startAt:'2026-09-26T10:00:00Z',allDay:false,privateNotes:'PRIVATE'}}} }
  const projected=publicRunEvent(event,'calendar.get')
  assert.doesNotMatch(JSON.stringify(projected),/PRIVATE|privateNotes/)
  assert.deepEqual(projected.data.result,{status:'completed'})
  assert.equal(publicToolValue('files.read',{text:'PRIVATE'}),undefined)
  assert.equal(publicToolValue('email.show',{body:'PRIVATE'}),undefined)
  for (const method of ['list','read','search','apply','history','restore','forget','reflect','doctor']) {
    assert.equal(publicToolValue(`memory.${method}`,{documents:[{id:'m',description:'Preference',status:'active',body:'PRIVATE'}],deleted:[]}),undefined)
  }
  await assert.rejects(async()=>{for await(const _ of nativeRunEvents(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {'));c.close()}}))){}},/inside a frame/)
})
