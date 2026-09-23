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
    chatLatency.painted('run', node); chatLatency.clear(); assert.equal(frames.size, 0)
  } finally {
    chatLatency.clear()
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
