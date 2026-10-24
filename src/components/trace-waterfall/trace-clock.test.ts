import assert from 'node:assert/strict'
import test from 'node:test'
import { observeTraceClock } from './trace-clock'

test('closed, offscreen and hidden-page running traces have no periodic clock; reopening catches up and disposal stops it', t => {
  const doc = new EventTarget() as Document
  Object.defineProperty(doc, 'visibilityState', { value: 'visible', writable: true })
  const element = { ownerDocument: doc } as HTMLElement
  let observed: IntersectionObserverCallback | undefined
  let disconnected = 0
  const timers = new Map<number, () => void>()
  let next = 0
  t.mock.method(globalThis, 'setInterval', (callback: () => void) => { timers.set(++next, callback); return next })
  t.mock.method(globalThis, 'clearInterval', (id: number) => { timers.delete(id) })
  const original = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver')
  Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: class {
    constructor(callback: IntersectionObserverCallback) { observed = callback }
    observe() {}
    disconnect() { disconnected++ }
  } })
  t.after(() => { if (original) Object.defineProperty(globalThis, 'IntersectionObserver', original); else Reflect.deleteProperty(globalThis, 'IntersectionObserver') })
  let ticks = 0
  const closed = observeTraceClock(element, false, () => ticks++)
  assert.equal(timers.size, 0, 'closed details must not start a clock')
  assert.equal(ticks, 0)
  closed()
  const dispose = observeTraceClock(element, true, () => ticks++)
  assert.equal(timers.size, 0, 'wait for actual intersection')
  const emptyRect: DOMRectReadOnly = { x: 0, y: 0, width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0, toJSON: () => ({}) }
  const intersection = (visible: boolean) => observed!([{ target: element, isIntersecting: visible,
    intersectionRatio: visible ? 1 : 0, time: 0, rootBounds: null, boundingClientRect: emptyRect, intersectionRect: emptyRect,
  }], {} as IntersectionObserver)
  intersection(true)
  assert.equal(ticks, 1, 'show current elapsed time immediately')
  assert.equal(timers.size, 1)
  intersection(true)
  assert.equal(timers.size, 1, 'one clock per trace')
  timers.values().next().value!()
  assert.equal(ticks, 2)
  intersection(false)
  assert.equal(timers.size, 0)
  Object.defineProperty(doc, 'visibilityState', { value: 'hidden', writable: true })
  intersection(true)
  assert.equal(timers.size, 0)
  Object.defineProperty(doc, 'visibilityState', { value: 'visible', writable: true })
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(timers.size, 1)
  assert.equal(ticks, 3)
  dispose()
  assert.equal(timers.size, 0)
  assert.equal(disconnected, 1)
  intersection(true)
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(timers.size, 0, 'unmounted trace cannot restart')
})
