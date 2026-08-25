import assert from 'node:assert/strict'
import test from 'node:test'
import { actionForKeyboardEvent } from './commands'

const keyboard = (patch: Partial<KeyboardEvent>) => ({ key: '', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null, ...patch }) as KeyboardEvent

test('maps global command shortcuts', () => {
  assert.deepEqual(actionForKeyboardEvent(keyboard({ key: 'k', ctrlKey: true })), { id: 'palette' })
  assert.deepEqual(actionForKeyboardEvent(keyboard({ key: 'F', metaKey: true })), { id: 'find-chat' })
  assert.deepEqual(actionForKeyboardEvent(keyboard({ key: 'ArrowDown', altKey: true })), { id: 'next-conversation' })
  assert.deepEqual(actionForKeyboardEvent(keyboard({ key: '3', ctrlKey: true })), { id: 'conversation-index', index: 2 })
})
