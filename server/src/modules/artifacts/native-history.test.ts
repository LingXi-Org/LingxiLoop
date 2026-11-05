import assert from 'node:assert/strict'
import test from 'node:test'
import { advanceNativeHistory, historyView, NativeHistoryConflict } from './native-history.js'

test('shared undo targets the observed step once, including Agent steps', () => {
  const first = advanceNativeHistory({ version: 0, undo: [], redo: [] }, { kind: 'edit', operationId: 'human' })
  const second = advanceNativeHistory(first, { kind: 'edit', operationId: 'agent' })
  const undone = advanceNativeHistory(second, { kind: 'undo', operationId: 'undo-a', targetOperationId: 'agent', expectedHistoryVersion: 2 })
  assert.deepEqual(historyView(undone), { version: 3, undo: 'human', redo: 'agent' })
  assert.throws(() => advanceNativeHistory(undone, { kind: 'undo', operationId: 'undo-b', targetOperationId: 'agent', expectedHistoryVersion: 2 }), NativeHistoryConflict)
  assert.deepEqual(historyView(undone), { version: 3, undo: 'human', redo: 'agent' })
})

test('a new committed edit invalidates the shared redo branch', () => {
  const undone = { version: 4, undo: ['first'], redo: ['agent'] }
  const next = advanceNativeHistory(undone, { kind: 'edit', operationId: 'other-person' })
  assert.deepEqual(historyView(next), { version: 5, undo: 'other-person', redo: null })
  assert.throws(() => advanceNativeHistory(next, { kind: 'redo', operationId: 'redo', targetOperationId: 'agent', expectedHistoryVersion: 4 }), NativeHistoryConflict)
  assert.deepEqual(undone, { version: 4, undo: ['first'], redo: ['agent'] })
})
