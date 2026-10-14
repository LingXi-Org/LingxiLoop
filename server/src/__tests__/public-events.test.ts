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
  await assert.rejects(async()=>{for await(const _ of nativeRunEvents(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('data: {'));c.close()}}))){}},/inside a frame/)
})

// Failure cases: private bodies/scopes/sources escape, failed writes look saved,
// missing versions permit stale deletion, or history produces duplicate chip IDs.
test('memory publishes the official chip shape from successful native receipts only', () => {
  const document = { id: 'm', title: 'Preference', description: 'Use Chinese', version: 1, status: 'active', body: 'PRIVATE', scopeId: 'PRIVATE', sources: ['PRIVATE'] }
  const chip = { id: 'm', text: 'Use Chinese', version: 1, change: 'existing' }
  for (const method of ['list', 'search']) assert.deepEqual(publicToolValue(`memory.${method}`, { items: [document] }), { chips: [chip] })
  assert.deepEqual(publicToolValue('memory.read', { document, body: 'PRIVATE' }), { chips: [chip] })
  assert.deepEqual(publicToolValue('memory.history', { items: [{ snapshot: { ...document, version: 2 } }, { snapshot: document }] }), { chips: [{ ...chip, version: 2 }] })
  assert.deepEqual(publicToolValue('memory.apply', { documents: [document], deleted: [] }), { chips: [{ ...chip, change: 'added' }] })
  assert.deepEqual(publicToolValue('memory.restore', { documents: [{ ...document, version: 3 }], deleted: [] }), { chips: [{ ...chip, version: 3, change: 'updated' }] })
  assert.deepEqual(publicToolValue('memory.apply', { documents: [{ ...document, version: undefined }, { ...document, description: 'Bearer abcdefghijklmnopq' }] }), { chips: [] })
  for (const method of ['forget', 'reflect', 'doctor']) assert.equal(publicToolValue(`memory.${method}`, { documents: [document] }), undefined)
  for (const status of ['failed', 'unknown', 'awaiting-approval', 'cancelled']) {
    const event: RunEvent = { runId: 'run', seq: 2, kind: 'tool.completed', stage: 'completed', visibility: 'user', data: { toolCallId: 'host:m', result: { status, value: { documents: [document] } } } }
    assert.deepEqual(publicRunEvent(event, 'memory.apply').data.result, { status })
  }
})
