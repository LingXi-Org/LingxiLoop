import assert from 'node:assert/strict'
import test from 'node:test'
import type { RunEvent } from '@lyyzka/lingxios/ui'
import { projectRunMemory } from './memory'

const document = (id: string, description = id) => ({ id, description, status: 'active', body: 'PRIVATE BODY', sources: ['PRIVATE SOURCE'] })
function events(seq: number, name = 'memory.apply', value: unknown = { documents: [document('one')], deleted: [] }): RunEvent[] {
  return [
    { runId: 'run', seq, kind: 'tool.started', stage: 'started', visibility: 'user', data: { toolCallId: `host:${seq}`, name } },
    { runId: 'run', seq: seq + 1, kind: 'tool.completed', stage: 'completed', visibility: 'user', data: {
      toolCallId: `host:${seq}`, result: { status: 'completed', value }, isError: false,
    } },
  ]
}

test('memory projection keeps only successful descriptions, merges updates, restores and replays idempotently', () => {
  const history = [...events(1), ...events(3, 'memory.apply', { documents: [document('one', 'updated'), document('two')], deleted: [] }),
    ...events(5, 'memory.restore', { documents: [document('one', 'restored')], deleted: [] })]
  const state = projectRunMemory('run', history)!
  assert.deepEqual(state.chips, [{ id: 'one', text: 'restored' }, { id: 'two', text: 'two' }])
  assert.equal(state.revision, 6)
  assert.equal(projectRunMemory('run', history, state), state)
  assert.doesNotMatch(JSON.stringify(state), /PRIVATE|body|sources|description/)
  const removed = projectRunMemory('run', events(7, 'memory.apply', { documents: [{ ...document('one'), status: 'expired' }], deleted: ['two'] }), state)!
  assert.deepEqual(removed.chips, [])
  assert.deepEqual(state.chips, [{ id: 'one', text: 'restored' }, { id: 'two', text: 'two' }], 'earlier states remain immutable')
})

test('running, failed, pending approval, unknown, read operations and foreign events never claim a saved memory', () => {
  assert.deepEqual(projectRunMemory('run', events(1).slice(0, 1))?.chips, [])
  for (const status of ['failed', 'unknown', 'awaiting-approval']) {
    const history = events(1)
    history[1].data.result = { status, value: { documents: [document('one')], deleted: [] } }
    const state = projectRunMemory('run', history)!
    assert.deepEqual([state.chips, state.revision], [[], 0])
  }
  const error = events(1)
  error[1].data.isError = true
  assert.deepEqual(projectRunMemory('run', error)?.chips, [])
  for (const action of ['memory.read', 'memory.list', 'memory.search', 'remember', 'memory_synthesis.apply']) {
    assert.equal(projectRunMemory('run', events(1, action)), undefined)
  }
  assert.equal(projectRunMemory('other', events(1)), undefined)
  assert.equal(projectRunMemory('run', events(1).map(event => ({ ...event, visibility: 'internal' as RunEvent['visibility'] }))), undefined)
})

test('truncated and invalid successful payloads show unavailable without interpreting previews', () => {
  for (const value of [{ truncated: true, preview: JSON.stringify({ documents: [document('fake')] }) }, null, {},
    { documents: [{ id: 'one', description: '<script>', status: 'unknown' }], deleted: [] }]) {
    const state = projectRunMemory('run', events(1, 'memory.apply', value))!
    assert.deepEqual(state.chips, [])
    assert.equal(state.calls['host:1'].unavailable, true)
    assert.equal(state.revision, 2)
  }
  const split = events(1)
  assert.deepEqual(projectRunMemory('run', split.slice(1), projectRunMemory('run', split.slice(0, 1))), projectRunMemory('run', split))
})
