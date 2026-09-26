import assert from 'node:assert/strict'
import test from 'node:test'
import { chatLatency } from './latency'

test('measures real visible text on the browser clock, coalesces paints and cancels discarded samples', () => {
  const names = ['performance', 'document', 'innerHeight', 'requestAnimationFrame', 'cancelAnimationFrame']
  const previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]))
  let now = 10, frame = 0
  const frames = new Map<number, () => void>(), timings: Record<string, unknown>[] = []
  const globals = { performance: { now: () => now, measure: (_name: string, options: { detail: Record<string, unknown> }) => timings.push(options.detail), clearMeasures() {} },
    document: { visibilityState: 'visible' }, innerHeight: 800,
    requestAnimationFrame: (callback: () => void) => { frames.set(++frame, callback); return frame },
    cancelAnimationFrame: (id: number) => frames.delete(id) }
  for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value })
  const paint = () => { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback() }
  const node = { isConnected: true, textContent: '真实正文', getBoundingClientRect: () => ({ top: 10, bottom: 100, width: 100 }) } as HTMLElement
  try {
    chatLatency.send('request'); now = 20; chatLatency.submitted('request')
    chatLatency.bind('run', 'request'); now = 40; chatLatency.preview('run', 1, 4)
    chatLatency.painted('run', node); chatLatency.painted('run', node)
    assert.equal(frames.size, 1)
    paint(); now = 56; paint()
    assert.deepEqual(timings.filter(item => item.stage === 'first_body_visible').map(item => item.sinceSendMs), [46])
    assert.deepEqual(timings.filter(item => item.stage === 'body_painted').map(item => item.durationMs), [16])
    node.textContent = ''; chatLatency.painted('empty', node); paint(); paint()
    assert.equal(timings.filter(item => item.stage === 'first_body_visible').length, 1)
    assert.ok(!JSON.stringify(timings).includes('真实正文'))
    now = 100; chatLatency.opened('room')
    now = 105; chatLatency.ready('room', 'composer_ready', node)
    paint(); now = 120; paint()
    node.textContent = '消息正文不可进入指标'
    chatLatency.ready('room', 'history_visible', node)
    chatLatency.ready('room', 'history_visible', node)
    paint(); now = 140; paint()
    assert.deepEqual(timings.filter(item => item.stage === 'composer_ready' || item.stage === 'history_visible'), [
      { stage: 'composer_ready', durationMs: 120 }, { stage: 'history_visible', durationMs: 140 },
    ])
    assert.ok(!JSON.stringify(timings).includes('消息正文不可进入指标'))
    chatLatency.opened('next')
    chatLatency.ready('room', 'history_visible', node)
    assert.equal(frames.size, 0, 'a previous conversation cannot complete the current timing')
    chatLatency.ready('next', 'history_visible', node)
    chatLatency.opened(null)
    assert.equal(frames.size, 0, 'navigation cancels pending paint samples')
    chatLatency.opened('hidden')
    chatLatency.ready('hidden', 'composer_ready', node)
    globals.document.visibilityState = 'hidden'
    paint(); paint()
    assert.equal(timings.filter(item => item.stage === 'composer_ready').length, 1)
    globals.document.visibilityState = 'visible'
    now = 200; chatLatency.opened('later')
    chatLatency.ready('later', 'composer_ready', node)
    paint(); now = 220; paint()
    assert.equal(timings.at(-1)?.durationMs, 20, 'later switches start at the selection, not document navigation')
    chatLatency.painted('run', node); chatLatency.clear(); assert.equal(frames.size, 0)
    now = 300; chatLatency.opened('new-login')
    chatLatency.ready('new-login', 'composer_ready', node)
    paint(); now = 325; paint()
    assert.equal(timings.at(-1)?.durationMs, 25, 'a later login must not reuse the original navigation timing')
  } finally {
    chatLatency.clear()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
