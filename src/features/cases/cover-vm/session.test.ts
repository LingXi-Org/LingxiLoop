import assert from 'node:assert/strict'
import test from 'node:test'
import { createCoverSession, type CoverWorkerPort } from './session'
import { coverFrameSvg } from './svg'
import { classifyCoverVmFailure, isCoverVmFailureCode, parseCoverProgram, validateCoverEvent } from './program'
const program = JSON.stringify({ version: 2, engine: 'quickjs-wasm', kernel: 'var HL={}', figure: 'hairline({})' })
const frame = (sequence = 0, attrs = { d: 'M0 0L20 20' }) => JSON.stringify({ version: 1, sequence, root: { id: 1, tag: 'svg', attrs: { viewBox: '0 0 400 320' }, children: [{ id: 2, tag: 'path', attrs, children: [] }] } })
test('worker diagnostics export only fixed phase/cause codes', () => {
  assert.equal(classifyCoverVmFailure(new Error('cover_vm_mount_guest_exception'), 'cover_vm_engine_initialization'), 'cover_vm_mount_guest_exception')
  assert.equal(classifyCoverVmFailure(new Error('invalid_cover_vm_data'), 'cover_vm_engine_initialization'), 'cover_vm_invalid_output')
  for (const value of ['private source line', 'cover_vm_mount_guest_exception\nsecret', 'cover_vm_mount_eval']) {
    assert.equal(isCoverVmFailureCode(value), false)
    assert.equal(classifyCoverVmFailure(new Error(value), 'cover_vm_engine_initialization'), 'cover_vm_engine_initialization')
  }
  assert.equal(classifyCoverVmFailure({}, 'arbitrary failure'), 'cover_vm_worker_error')
})
function harness(timeoutMs = 1000) {
  const sent: Record<string, unknown>[] = []
  let ended = 0, failed = 0, frames = 0
  const worker: CoverWorkerPort = { onmessage: null, onerror: null, onmessageerror: null, postMessage: value => sent.push(value as Record<string, unknown>), terminate: () => { ended++ } }
  const session = createCoverSession({ program, scope: 'current', worker, timeoutMs, onFrame: () => { frames++ }, onFailure: () => { failed++ } })
  return { worker, session, sent, stats: () => ({ ended, failed, frames }), reply: (scope = 'current', requestId = 0, json = frame()) => worker.onmessage?.({ data: { type: 'frame', scope, requestId, json } } as MessageEvent) }
}
test('program rejects old HTML, extra capabilities and mismatched versions', () => {
  assert.throws(() => parseCoverProgram('<script>hairline({})</script>'))
  assert.throws(() => parseCoverProgram(program.replace('"version":2', '"version":1')))
  assert.throws(() => parseCoverProgram(program.replace('"version":2', '"url":"https://example.test","version":2')))
  assert.equal(parseCoverProgram(program).engine, 'quickjs-wasm')
  assert.throws(() => validateCoverEvent({ type: 'tick', delta: 51 }))
  assert.throws(() => validateCoverEvent({ type: 'focus', focused: true, source: 'x' }))
})
test('one inflight command coalesces ticks and rejects old scopes before reading output', () => {
  const h = harness()
  for (let i = 0; i < 1000; i++) h.session.send({ type: 'tick', delta: 33 })
  assert.equal(h.sent.length, 1)
  h.reply('old', 0, 'not JSON'); assert.equal(h.stats().frames, 0)
  h.reply(); assert.equal(h.stats().frames, 1); assert.equal(h.sent.length, 2)
  h.reply('current', 1, frame(1)); assert.equal(h.sent.length, 2)
  const late = h.worker.onmessage
  h.session.dispose(); late?.({ data: { type: 'frame', scope: 'current', requestId: 2, json: frame(2) } } as MessageEvent)
  assert.deepEqual(h.stats(), { ended: 1, failed: 0, frames: 2 })
})
test('stale sequences, malformed SVG and worker errors terminate before painting', () => {
  for (const bad of [frame(0), frame(1, { d: '<script>' })]) {
    const h = harness(); h.reply(); h.session.send({ type: 'tick', delta: 33 }); h.reply('current', 1, bad)
    assert.deepEqual(h.stats(), { ended: 1, failed: 1, frames: 1 })
  }
  const h = harness(); h.worker.onerror?.(new Event('error')); assert.equal(h.stats().ended, 1)
})
test('uncompleted initialization or tick is killed by an external watchdog', async () => {
  for (const initialized of [false, true]) {
    const h = harness(10)
    if (initialized) { h.reply(); h.session.send({ type: 'tick', delta: 0 }) }
    await new Promise(resolve => setTimeout(resolve, 25))
    assert.equal(h.stats().failed, 1); assert.equal(h.stats().ended, 1)
  }
})
test('SVG export owns palette and admits no HTML, script, CSS or external references', () => {
  assert.match(coverFrameSvg(frame()), /xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.match(coverFrameSvg(frame(), 'dark'), /fill="#08090a"/)
  for (const attrs of [{ d: 'M0 0', href: 'https://example.test' }, { d: 'M0 0', style: 'fill:red' }]) assert.throws(() => coverFrameSvg(frame(0, attrs)))
})
