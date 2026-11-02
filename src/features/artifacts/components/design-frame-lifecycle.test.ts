import assert from 'node:assert/strict'
import test from 'node:test'
import { subscribeDesignFrameReveal } from './design-frame-lifecycle'

test('only the current visible editor receives the pinned reveal handshake; folding and teardown retain ownership', () => {
  const windowEvents = new EventTarget(), documentEvents = new EventTarget()
  const sent: unknown[] = []
  let connected = true, visible = true, width = 800, tabVisible = true
  let resize: () => void = () => {}
  let disconnected = false, initialized = 0, failed = 0
  const guest = { postMessage: (...message: unknown[]) => sent.push(message) }
  const frame = { contentWindow: guest, get isConnected() { return connected },
    checkVisibility: () => visible, getBoundingClientRect: () => ({ width, height: 600 }) } as unknown as HTMLIFrameElement
  const previous = Object.fromEntries(['window', 'document', 'ResizeObserver'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: windowEvents },
    document: { configurable: true, value: Object.defineProperty(documentEvents, 'visibilityState', { get: () => tabVisible ? 'visible' : 'hidden' }) },
    ResizeObserver: { configurable: true, value: class { constructor(callback: () => void) { resize = callback } observe() {} disconnect() { disconnected = true } } },
  })
  const message = (source: unknown, origin: string, data: unknown) => {
    const event = new Event('message'); Object.assign(event, { source, origin, data }); windowEvents.dispatchEvent(event)
  }
  const origin = 'https://grant-artifact.example'
  try {
    const stop = subscribeDesignFrameReveal(frame, `${origin}/artifact-editor/design/grant/`, { initialized: () => initialized++, failed: () => failed++ })
    resize(); assert.equal(sent.length, 0, 'do not race the editor listener')
    message({}, origin, { __frame_reveal_hold: true })
    message({}, origin, { __lingxi_design_resource_error: true })
    message(guest, 'https://another.example', { __frame_reveal_hold: true })
    message(guest, origin, { __frame_reveal_hold: false })
    assert.equal(sent.length, 0)
    assert.equal(initialized, 0); assert.equal(failed, 0)
    visible = false
    message(guest, origin, { __frame_reveal_hold: true })
    assert.equal(sent.length, 0, 'a folded editor is not displayed')
    assert.equal(initialized, 1)
    visible = true; width = 0; resize(); assert.equal(sent.length, 0)
    width = 800; tabVisible = false; resize(); assert.equal(sent.length, 0)
    tabVisible = true; documentEvents.dispatchEvent(new Event('visibilitychange'))
    assert.deepEqual(sent, [[{ __frame_revealed: true }, origin]])
    resize(); message(guest, origin, { __frame_reveal_ready: true })
    assert.equal(sent.length, 1, 'one reveal per mounted document')
    assert.equal(initialized, 1)
    message(guest, origin, { __lingxi_design_resource_error: true }); assert.equal(failed, 1)
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
