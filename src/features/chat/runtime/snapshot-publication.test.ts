import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { createRunView } from '@lyyzka/lingxios/ui'
import { createNativeMessage, nativeMessageSchema, nativeText } from '@/lib/nativeMessage'
import type { AgentRunSnapshot, RunDisplayState } from '@/lib/agentRunSnapshot'
import { createSnapshotPublisher, decodeRunSnapshot, snapshotDisplay } from './snapshot-publication'

const target = { conversationId: 'room', agentId: 'agent', runId: 'run' }
function snapshot(text: string, seq = 0): AgentRunSnapshot {
  return { message: createNativeMessage({ id: 'run-run', role: 'assistant', createdAt: '2026-01-01T00:00:00Z', content: [{ type: 'text', text }],
    status: { type: 'running' }, custom: { runId: 'run', harnessControl: true,
      harness: { ...createRunView('run'), lifecycle: 'leased', lastSeq: seq, artifacts: [] } } }) }
}
function harness(value: AgentRunSnapshot) { return value.message.metadata.custom.harness as unknown as RunDisplayState }
function setup() {
  const controller = new AbortController(), received: AgentRunSnapshot[] = [], callbacks: (() => void)[] = []
  let pending = 0, maxPending = 0
  const publisher = createSnapshotPublisher(value => received.push(value), controller.signal, error => { throw error }, publish => {
    callbacks.push(publish); pending++; maxPending = Math.max(maxPending, pending)
    return () => { pending-- }
  })
  return { controller, received, callbacks, publisher, maximum: () => maxPending,
    push(value: AgentRunSnapshot) { publisher.push(decodeRunSnapshot(value, target)) } }
}

test('one pending publication keeps ordered complete text, first body and final tail', () => {
  const s = setup()
  s.push(snapshot(''))
  s.push(snapshot('正文', 1))
  assert.deepEqual(s.received.map(item => nativeText(item.message)), ['', '正文'])
  for (let i = 2; i <= 1000; i++) s.push(snapshot('正文' + '字'.repeat(i - 1), i))
  assert.equal(s.received.length, 2)
  assert.equal(s.maximum(), 1)
  s.publisher.flush()
  assert.equal(nativeText(s.received.at(-1)!.message), '正文' + '字'.repeat(999))
  assert.equal(harness(s.received.at(-1)!).lastSeq, 1000)
  s.publisher.dispose()
})

test('structure, replacement, permission, identity and terminal transitions flush immediately', () => {
  const mutations: Array<(s: AgentRunSnapshot) => void> = [
    s => { s.message = { ...s.message, role: 'assistant', status: { type: 'running' }, content: [{ type: 'text', text: '替换' }] } as typeof s.message }, // same length, not append
    s => { s.message.metadata.custom.harnessControl = false },
    s => { harness(s).requestVersion++ },
    s => { harness(s).fence++ },
    s => { harness(s).messageFence++ },
    s => { harness(s).lifecycle = 'cancelled' },
    s => { harness(s).lifecycle = 'failed'; s.message.metadata.custom.harnessError = 'failed' },
    s => { harness(s).delivery = 'delivered'; harness(s).resultId = 'result' },
    s => { if (s.message.role === 'assistant') s.message = { ...s.message, status: { type: 'requires-action', reason: 'interrupt' } } },
    s => { s.message = { ...s.message, role: 'assistant', status: { type: 'running' }, content: [...s.message.content, { type: 'tool-call', toolCallId: 't', toolName: 'read', args: {}, argsText: '{}' }] } as typeof s.message },
  ]
  for (const mutate of mutations) {
    const s = setup()
    s.push(snapshot('A', 1)); s.push(snapshot('AB', 2))
    const next = snapshot('AB', 3); mutate(next); s.push(next)
    assert.equal(s.received.length, 3)
    assert.equal(nativeText(s.received[1].message), 'AB')
    assert.deepEqual(s.received[2].message, next.message)
    s.publisher.dispose()
    s.callbacks.forEach(callback => { callback() })
    assert.equal(s.received.length, 3)
  }
})

test('abort drops pending publication and stale clock callbacks cannot restore it', () => {
  const s = setup(); s.push(snapshot('A', 1)); s.push(snapshot('AB', 2))
  s.controller.abort(); s.callbacks.forEach(callback => { callback() }); s.publisher.flush(); s.push(snapshot('ABC', 3))
  assert.deepEqual(s.received.map(item => nativeText(item.message)), ['A'])
})

test('visible resume publishes the latest snapshot rather than queued animation frames', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const document = Object.assign(new EventTarget(), { visibilityState: 'hidden' })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document })
  try {
    const s = setup(); s.push(snapshot('A')); s.push(snapshot('AB', 1)); s.push(snapshot('ABC', 2))
    document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange'))
    assert.deepEqual(s.received.map(item => nativeText(item.message)), ['A', 'ABC'])
    s.publisher.dispose()
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original)
    else Reflect.deleteProperty(globalThis, 'document')
  }
})

test('decoded internal display reuses validation; untrusted clones still parse and private nested data stays stripped', () => {
  const raw = snapshot('A')
  raw.message.metadata.custom.memory = { private: 'fixture-secret' }
  if (raw.message.role !== 'assistant') throw new Error('assistant fixture required')
  raw.message.content.push({ type: 'tool-call', toolCallId: 'memory', toolName: 'memory.read', args: { private: 'fixture-secret' }, argsText: 'fixture-secret',
    result: { status: 'completed', private: 'fixture-secret' }, messages: [createNativeMessage({ id: 'child', role: 'assistant',
      content: [{ type: 'text', text: 'child' }], custom: { memory: { private: 'fixture-secret' } } })] })
  const spy = mock.method(nativeMessageSchema, 'parse')
  try {
    const decoded = decodeRunSnapshot(raw, target), display = snapshotDisplay(decoded)
    assert.equal(spy.mock.callCount(), 1)
    assert.equal(snapshotDisplay(decoded), display)
    assert.doesNotMatch(JSON.stringify(display), /fixture-secret/)
    assert.deepEqual(snapshotDisplay({ ...decoded }), display)
    assert.equal(spy.mock.callCount(), 2)
    raw.message.content[0] = { type: 'text', text: 'external mutation' }
    assert.equal(nativeText(display), 'A')
  } finally { spy.mock.restore() }
  assert.throws(() => decodeRunSnapshot(snapshot('A'), { ...target, runId: 'other' }), /身份/)
  assert.throws(() => decodeRunSnapshot({ message: { ...snapshot('A').message, content: [{ type: 'text', text: 'x'.repeat(1_000_001) }] } }, target))
})

test('a pending visible animation frame switches to the bounded hidden-tab timer', context => {
  const names = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'] as const
  const originals = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name))
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  let frame: (() => void) | undefined, cancelled = 0
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: document },
    requestAnimationFrame: { configurable: true, value: (callback: () => void) => { frame = callback; return 1 } },
    cancelAnimationFrame: { configurable: true, value: () => { frame = undefined; cancelled++ } },
  })
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const received: AgentRunSnapshot[] = []
  const publisher = createSnapshotPublisher(value => received.push(value), new AbortController().signal, error => { throw error })
  try {
    publisher.push(decodeRunSnapshot(snapshot('A'), target))
    publisher.push(decodeRunSnapshot(snapshot('AB', 1), target))
    assert.ok(frame)
    const staleFrame = frame
    document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'))
    assert.equal(frame, undefined); assert.equal(cancelled, 1)
    staleFrame()
    assert.equal(received.length, 1, 'a cancelled frame cannot publish the new pending timer state')
    context.mock.timers.tick(249)
    assert.equal(received.length, 1)
    context.mock.timers.tick(1)
    assert.deepEqual(received.map(item => nativeText(item.message)), ['A', 'AB'])
  } finally {
    publisher.dispose(); context.mock.timers.reset()
    names.forEach((name, index) => {
      if (originals[index]) Object.defineProperty(globalThis, name, originals[index]!)
      else Reflect.deleteProperty(globalThis, name)
    })
  }
})
