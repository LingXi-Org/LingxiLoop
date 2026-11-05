import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'
import { NativeCompute } from './compute'
import type { ComputeMessage, ComputeResponse } from './compute-protocol'

class TestWorker {
  static current: TestWorker
  sent: ComputeMessage[] = []
  onmessage: ((event: { data: ComputeResponse }) => void) | null = null
  onerror: (() => void) | null = null
  terminated = false
  constructor() { TestWorker.current = this }
  postMessage(message: ComputeMessage) { this.sent.push(message) }
  terminate() { this.terminated = true }
  reply(data: ComputeResponse) { this.onmessage?.({ data }) }
}

function installWorker(t: TestContext) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Worker')
  Object.defineProperty(globalThis, 'Worker', { configurable: true, writable: true, value: TestWorker })
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'Worker', descriptor)
    else Reflect.deleteProperty(globalThis, 'Worker')
  })
}

test('revision changes reject old calculations and discard their late worker replies', async t => {
  installWorker(t)
  const compute = new NativeCompute()
  const old = compute.math('x', false, 1)
  const oldRejected = assert.rejects(old, { name: 'AbortError' })
  const next = compute.math('x+1', false, 2)
  TestWorker.current.reply({ id: 1, revision: 1, value: { html: 'stale' } })
  TestWorker.current.reply({ id: 2, revision: 2, value: { html: 'current' } })
  await oldRejected
  assert.deepEqual(await next, { html: 'current' })
  assert.ok(TestWorker.current.sent.some(message => 'cancel' in message && message.cancel === 1))
  compute.dispose()
})

test('unmount cancellation releases pending request and dispose terminates worker', async t => {
  installWorker(t)
  const compute = new NativeCompute()
  const controller = new AbortController()
  const pending = compute.math('x', false, 3, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  compute.dispose()
  assert.equal(TestWorker.current.terminated, true)
  await assert.rejects(compute.visible({ x: 0, y: 0, width: 1, height: 1 }, 3), { name: 'AbortError' })
})
