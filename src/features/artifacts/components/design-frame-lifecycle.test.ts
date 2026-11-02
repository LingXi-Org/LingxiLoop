import assert from 'node:assert/strict'
import test from 'node:test'
import { subscribeDesignFrameReveal } from './design-frame-lifecycle'

test('only the current visible editor receives the pinned reveal handshake; folding and teardown retain ownership', () => {
  const windowEvents = new EventTarget(), documentEvents = new EventTarget()
  const sent: unknown[] = []
  let connected = true, visible = true, width = 800, tabVisible = true
  let resize: () => void = () => {}
  let disconnected = false
  const guest = { postMessage: (...message: unknown[]) => sent.push(message) }
  const frame = { contentWindow: guest, get isConnected() { return connected },
    checkVisibility: () => visible, getBoundingClientRect: () => ({ width, height: 600 }) } as unknown as HTMLIFrameElement
  const previous = Object.fromEntries(['window', 'document', 'ResizeObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: windowEvents },
    document: { configurable: true, value: Object.assign(documentEvents, { get visibilityState() { return tabVisible ? 'visible' : 'hidden' } }) },
    ResizeObserver: { configurable: true, value: class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() { disconnected = true } } },
  })
  const message = (source: unknown, origin: string, data: unknown) => {
    const event = new Event('message'); Object.assign(event, { source, origin, data }); windowEvents.dispatchEvent(event)
  }
  const origin = 'https://grant-artifact.example'
  try {
    const stop = subscribeDesignFrameReveal(frame, `${origin}/artifact-editor/design/grant/`)
    resize(); assert.equal(sent.length, 0, 'do not race the editor listener')
    message({}, origin, { __frame_reveal_hold: true })
    message(guest, 'https://another.example', { __frame_reveal_hold: true })
    message(guest, origin, { __frame_reveal_hold: false })
    assert.equal(sent.length, 0)
    visible = false
    message(guest, origin, { __frame_reveal_hold: true })
    assert.equal(sent.length, 0, 'a folded editor is not displayed')
    visible = true; width = 0; resize(); assert.equal(sent.length, 0)
    width = 800; resize()
    assert.deepEqual(sent, [[{ __frame_revealed: true }, origin]])
    resize(); message(guest, origin, { __frame_reveal_ready: true })
    assert.equal(sent.length, 1, 'one reveal per mounted document')
    stop(); assert.equal(disconnected, true)
    connected = false; tabVisible = false; resize()
    message(guest, origin, { __frame_reveal_hold: true })
    assert.equal(sent.length, 1)
  } finally {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
