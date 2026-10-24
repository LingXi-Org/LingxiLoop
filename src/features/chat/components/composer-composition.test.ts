import assert from 'node:assert/strict'
import test from 'node:test'
import { installComposerCompositionGuard } from './composer-composition'

function key(key: string, values: { isComposing?: boolean; keyCode?: number } = {}) {
  const event = new Event('keydown', { cancelable: true })
  Object.assign(event, { key, isComposing: false, keyCode: 13 }, values)
  return event
}

test('IME confirmation cannot reach submit, Escape or trigger menu handlers', async () => {
  const root = new EventTarget()
  let editorComposing = false
  const cleanup = installComposerCompositionGuard(root, () => editorComposing)
  const handled: string[] = []
  root.addEventListener('keydown', event => handled.push((event as KeyboardEvent).key))
  root.dispatchEvent(key('Enter', { isComposing: true }))
  root.dispatchEvent(key('Enter', { keyCode: 229 }))
  root.dispatchEvent(new Event('compositionstart'))
  for (const candidate of ['Enter', 'Escape', 'ArrowDown', 'ArrowUp', 'Tab']) root.dispatchEvent(key(candidate))
  root.dispatchEvent(new Event('compositionend'))
  const trailingConfirmation = key('Enter')
  root.dispatchEvent(trailingConfirmation)
  assert.deepEqual(handled, [])
  assert.equal(trailingConfirmation.defaultPrevented, false, 'native IME commit is not cancelled')
  root.dispatchEvent(new Event('keyup'))
  root.dispatchEvent(key('Enter'))
  assert.deepEqual(handled, ['Enter'], 'the next intentional Enter is immediate after key release')
  editorComposing = true
  root.dispatchEvent(key('Enter'))
  assert.deepEqual(handled, ['Enter'], 'Lexical composition state protects dropped browser flags')
  editorComposing = false
  root.dispatchEvent(new Event('compositionend'))
  await new Promise(resolve => setTimeout(resolve, 1))
  root.dispatchEvent(key('Enter'))
  assert.deepEqual(handled, ['Enter', 'Enter'], 'compositionend never imposes a typing debounce')
  cleanup()
})

test('ordinary Enter, Shift+Enter, Escape and menu keys still reach the owning primitive', () => {
  const root = new EventTarget()
  const cleanup = installComposerCompositionGuard(root, () => false)
  let handled = 0
  root.addEventListener('keydown', () => handled++)
  for (const candidate of ['Enter', 'Escape', 'ArrowDown', 'Tab']) root.dispatchEvent(key(candidate))
  cleanup()
  root.dispatchEvent(new Event('compositionstart'))
  root.dispatchEvent(key('Enter'))
  assert.equal(handled, 5)
})
