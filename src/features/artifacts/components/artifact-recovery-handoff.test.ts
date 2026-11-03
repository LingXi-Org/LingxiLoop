import assert from 'node:assert/strict'
import test from 'node:test'
import { requestArtifactRecovery } from './artifact-recovery-handoff'
import '../../../../shared/artifact-recovery.test'

function fixture(t: { after(fn: () => void): void }) {
  const events = new EventTarget(), sent: unknown[][] = []
  const source = { postMessage: (...args: unknown[]) => sent.push(args) }
  const frame = { contentWindow: source } as unknown as HTMLIFrameElement
  const previous = Object.fromEntries(['window', 'location'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  Object.defineProperties(globalThis, { window: { configurable: true, value: events }, location: { configurable: true, value: { href: 'https://app.test/', origin: 'https://app.test' } } })
  t.after(() => { for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor);else Reflect.deleteProperty(globalThis, key) } })
  const reply = (data: unknown, origin = 'https://one-artifact.test', sender: unknown = source) => {
    const event = new Event('message');Object.assign(event, { source: sender, origin, data });events.dispatchEvent(event)
  }
  return { frame, source, sent, reply }
}

test('a recovery package requires the current frame, grant origin, nonce, request id and bounded valid payload', async t => {
  const f = fixture(t), controller = new AbortController()
  t.after(() => controller.abort())
  let resolved = false
  const pending = requestArtifactRecovery(f.frame, 'https://one-artifact.test/artifact-editor/slides/grant/', 'slides', 'nonce', 'snapshot', controller.signal)
  void pending.then(() => { resolved = true })
  const request = f.sent[0][0] as { requestId: string }
  const bytes = new TextEncoder().encode(JSON.stringify({ format: 'lingxi-editor-recovery-v1', kind: 'slides', id: 'copy', baseSha: null, state: { title: 'Native', content: { slides: {} } } })).buffer
  const valid = { type: 'artifact:recovery-response', requestId: request.requestId, nonce: 'nonce', result: 'snapshot', bytes }
  f.reply(valid, 'https://one-artifact.test', {})
  f.reply(valid, 'https://another-artifact.test')
  f.reply({ ...valid, nonce: 'another' });f.reply({ ...valid, requestId: 'stale' })
  f.reply({ ...valid, bytes: new TextEncoder().encode('{}').buffer })
  await Promise.resolve();assert.equal(resolved, false)
  f.reply(valid)
  const received = await pending
  assert.equal(received.id, 'copy');assert.equal(received.bytes, bytes)
  assert.equal(f.sent[0][1], 'https://one-artifact.test')
})

test('opaque legacy frames may export their own data but never receive private restoration bytes through wildcard targeting', async t => {
  const f = fixture(t), controller = new AbortController()
  const pending = requestArtifactRecovery(f.frame, 'https://app.test/artifact-editor/slides/grant/', 'slides', 'nonce', 'snapshot', controller.signal)
  const request = f.sent[0][0] as { requestId: string }
  f.reply({ type: 'artifact:recovery-response', requestId: request.requestId, nonce: 'nonce', result: 'clean' }, 'null')
  assert.equal((await pending).result, 'clean')
  await assert.rejects(requestArtifactRecovery(f.frame, 'https://app.test/artifact-editor/slides/grant/', 'slides', 'nonce', 'restore', controller.signal, new ArrayBuffer(8)), /旧版/)
  assert.equal(f.sent.length, 1)
})

test('scope cancellation rejects and ignores a late child reply', async t => {
  const f = fixture(t), controller = new AbortController()
  const pending = requestArtifactRecovery(f.frame, 'https://one-artifact.test/', 'slides', 'nonce', 'snapshot', controller.signal)
  const request = f.sent[0][0] as { requestId: string }
  controller.abort()
  f.reply({ type: 'artifact:recovery-response', requestId: request.requestId, nonce: 'nonce', result: 'clean' })
  await assert.rejects(pending)
})
