import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { PluginUiPageManager } from '../../plugin-ui/app/pluginUiPageManager'
import { EMPTY_GEN_UI_SNAPSHOT, type GenUiPage } from '../contract'
import type { GenUiPageInput } from './page'

const sandboxPages = new PluginUiPageManager(
  () => () => {},
  () => {},
)
const cores: (GenUiPage & { disposed: number; ready(): void })[] = []
mock.module('@/features/chat/visualize/zcode/plugin-ui/hostPrimitives.js', { namedExports: { sandboxPages } })
mock.module('./page.js', { namedExports: { createGenUiPage: (input: GenUiPageInput) => {
  let snapshot = { ...EMPTY_GEN_UI_SNAPSHOT }
  const listeners = new Set<() => void>()
  let anchors = 0
  const core: GenUiPage & { disposed: number; ready(): void } = {
    disposed: 0,
    ready() {
      snapshot = { ...snapshot, phase: 'ready' }
      for (const listener of listeners) listener()
    },
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    bind() {
      anchors++
      input.onVisibility?.(true)
      return () => { if (!--anchors) input.onVisibility?.(false) }
    },
    preview() {}, focus() {}, setTweaks() {}, previewTweaks() {},
    async copyImage() {}, async sendFollowUp() {}, async submitTweaks() {},
    isBusy: () => snapshot.phase === 'loading',
    async dispose() { core.disposed++ },
  }
  cores.push(core)
  return core
} } })
const observers = new Map<Element, { callback: IntersectionObserverCallback; observer: IntersectionObserver }>()
class FixtureIntersectionObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]
  constructor(private readonly callback: IntersectionObserverCallback) {}
  observe(node: Element) { observers.set(node, { callback: this.callback, observer: this }) }
  unobserve(node: Element) { observers.delete(node) }
  takeRecords(): IntersectionObserverEntry[] { return [] }
  disconnect() { for (const [node, entry] of observers) if (entry.observer === this) observers.delete(node) }
}
Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: FixtureIntersectionObserver })
const { acquireGenUiPage } = await import('./retainedPage')
const flush = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve() }
const node = () => ({ isConnected: true }) as HTMLElement
function intersect(node: HTMLElement, visible: boolean) {
  const rect: DOMRectReadOnly = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }
  const entry: IntersectionObserverEntry = {
    target: node, isIntersecting: visible, intersectionRatio: visible ? 1 : 0,
    time: 0, rootBounds: null, boundingClientRect: rect, intersectionRect: rect,
  }
  const observed = observers.get(node)!
  observed.callback([entry], observed.observer)
}
const unused = (): never => { throw new Error('Retained owner must not call mocked core dependencies') }
const unusedAsync = async () => unused()
const service: GenUiPageInput['state'] = {
  readDocument: unusedAsync, prepareSandbox: unusedAsync, getState: unusedAsync,
  setState: unusedAsync, onStateChanged: unused, validate: unusedAsync,
}
const platform: GenUiPageInput['platform'] = {
  getOwnerWebContentsId: unusedAsync, onPorts: unused, consumeUserGesture: unusedAsync,
  consumeHostUserGesture: unusedAsync, disposeSandbox: unusedAsync, copyImage: unusedAsync,
}
let sequence = 0
async function acquire() {
  return acquireGenUiPage({
    target: { workspaceIdentity: 'school', workspacePath: 'course', sessionId: `room-${++sequence}`, path: '/topology.html', instanceKey: 'card', sourceMessageId: 'source' },
    files: service, state: service, platform, openExternal: unused,
    watchTaskRemoved: () => () => {},
  })
}

test('an unobserved or offscreen first anchor never starts a GenUI guest', async t => {
  const before = cores.length, page = await acquire(), anchor = node()
  t.after(() => page.dispose())
  page.bind(anchor)
  await flush()
  assert.equal(cores.length, before)
  intersect(anchor, false)
  await flush()
  assert.equal(cores.length, before)
  intersect(anchor, true)
  await flush()
  assert.equal(cores.length, before + 1)
})

test('leaving the last loading anchor cancels its startup and returning starts a fresh guest', async t => {
  const before = cores.length, page = await acquire(), anchor = node()
  t.after(() => page.dispose())
  const unbind = page.bind(anchor)
  intersect(anchor, true)
  await flush()
  const abandoned = cores[before]
  assert.equal(abandoned.disposed, 0)
  unbind()
  await flush()
  assert.equal(abandoned.disposed, 1, 'an unmounted loading card must stop preparing resources and SDK initialization')
  assert.equal(page.running(), false)
  page.bind(anchor)
  intersect(anchor, true)
  await flush()
  assert.equal(cores.length, before + 2)
  assert.equal(page.getSnapshot().phase, 'loading')
})

test('a ready guest survives last-anchor navigation and is rebound without another initialization', async t => {
  const before = cores.length, page = await acquire(), anchor = node()
  t.after(() => page.dispose())
  const unbind = page.bind(anchor)
  intersect(anchor, true)
  await flush()
  const retained = cores[before]
  retained.ready()
  unbind()
  await flush()
  assert.equal(retained.disposed, 0)
  page.bind(anchor)
  intersect(anchor, true)
  await flush()
  assert.equal(cores.length, before + 1)
  assert.equal(page.getSnapshot().phase, 'ready')
})

test('a loading guest survives a synchronous anchor replacement and ordinary offscreen scrolling', async t => {
  const before = cores.length, page = await acquire(), anchor = node(), replacement = node()
  t.after(() => page.dispose())
  const unbind = page.bind(anchor)
  intersect(anchor, true)
  await flush()
  const retained = cores[before]
  intersect(anchor, false)
  await flush()
  assert.equal(retained.disposed, 0, 'scrolling past a still-bound card keeps its startup')
  unbind()
  page.bind(replacement)
  await flush()
  intersect(replacement, true)
  await flush()
  assert.equal(retained.disposed, 0, 'layout cleanup/setup in one React commit keeps the same startup')
  assert.equal(cores.length, before + 1)
})
