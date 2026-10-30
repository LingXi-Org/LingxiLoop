import assert from 'node:assert/strict'
import test, { mock } from 'node:test'

// Run the real hook callbacks/lifecycle with deterministic layout measurements.
// This checks event/state behavior, not a browser's layout, paint or anchoring.
let slots: any[] = [], cursor = 0, effects: (() => undefined | (() => void))[] = []
const reactHooks = {
  useRef: (initial: any) => { const i = cursor++; return slots[i] ??= { current: initial } },
  useState: (initial: any) => { const i = cursor++; slots[i] ??= initial; return [slots[i], (v: any) => { slots[i] = v }] },
  useCallback: (callback: any) => callback,
  useEffect: (effect: () => undefined | (() => void)) => { effects.push(effect) },
  useMemo: (compute: () => any) => compute(),
  forwardRef: (render: any) => (props: any) => render(props, null),
}
mock.module('react', { namedExports: reactHooks, defaultExport: reactHooks })
mock.module('react/jsx-runtime', { namedExports: { jsx: (type: unknown, props: unknown) => ({ type, props }) } })
const { useClaudeScrollPinning } = await import('./useClaudeScrollPinning')
const { ScrollFadeContainer } = await import('./ScrollFadeContainer')
let now = 1_000
mock.method(performance, 'now', () => now)
let onResize: () => void = () => {}
globalThis.ResizeObserver = class {
  constructor(callback: () => void) { onResize = callback }
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
globalThis.MutationObserver = class { observe() {} disconnect() {} } as unknown as typeof MutationObserver

function setup() {
  slots = []; cursor = 0; effects = []; now = 1_000
  const hook = useClaudeScrollPinning(['room'])
  const calls: ScrollToOptions[] = []
  const viewport = { scrollTop: 600, scrollHeight: 1_000, clientHeight: 400, firstElementChild: {},
    scrollTo(options: ScrollToOptions) { calls.push(options); this.scrollTop = Math.max(0, Math.min(options.top ?? 0, this.scrollHeight - this.clientHeight)) },
  }
  hook.containerRef.current = viewport as unknown as HTMLDivElement
  const cleanup = effects.map(effect => effect())
  const state = () => { cursor = 0; effects = []; return useClaudeScrollPinning(['room']) }
  calls.length = 0
  return { hook, viewport, calls, state, cleanup: () => cleanup.forEach(fn => { fn?.() }) }
}

test('stream and asynchronous height growth follow immediately; scroll writes stop during history reading', () => {
  const { hook, viewport, calls, cleanup } = setup()
  viewport.scrollHeight += 80; onResize()
  assert.equal(calls.at(-1)?.behavior, 'auto')
  assert.equal(viewport.scrollTop, 680)
  hook.markUserInput(); viewport.scrollTop = 100; hook.handleScroll()
  now += 151; calls.length = 0; viewport.scrollHeight += 200; onResize()
  assert.equal(calls.length, 0)
  cleanup()
})

test('layout scroll before resize observation preserves pinned intent during async card growth', () => {
  const { hook, viewport, state, cleanup } = setup()
  viewport.scrollHeight += 400
  viewport.scrollTop += 20 // native anchoring may move, without reaching the new bottom
  hook.handleScroll()
  assert.equal(state().isPinned, true, 'layout growth is not a reader scrolling away')
  onResize()
  assert.equal(viewport.scrollTop, 1_000)
  hook.markUserInput(); viewport.scrollTop = 100; hook.handleScroll()
  assert.equal(state().isPinned, false, 'real input still releases following')
  viewport.scrollHeight += 100; viewport.scrollTop = 1_100; hook.handleScroll()
  assert.equal(state().isPinned, true, 'manually returning to the new bottom pins its current height')
  now += 200; viewport.scrollTop -= 100; hook.handleScroll()
  assert.equal(state().isPinned, false, 'scrolling away at unchanged height remains possible')
  cleanup()
})

test('40px pinning, 120px jump threshold and 150ms cooling remain distinct', () => {
  const { hook, viewport, calls, state, cleanup } = setup()
  hook.markUserInput(); viewport.scrollTop = 479; hook.handleScroll()
  assert.equal(state().showJumpControl, true)
  viewport.scrollTop = 480; hook.handleScroll()
  assert.equal(state().showJumpControl, false)
  viewport.scrollTop = 559; hook.handleScroll()
  assert.equal(state().isPinned, false)
  viewport.scrollTop = 560; hook.handleScroll()
  assert.equal(state().isPinned, true)
  onResize(); assert.equal(calls.length, 0)
  now += 151; onResize(); assert.equal(calls.length, 1)
  cleanup()
})

test('explicit selection/navigation hold survives resize and scroll; jump restores following', () => {
  const { hook, viewport, calls, cleanup } = setup()
  hook.pauseFollowing(); hook.handleScroll(); now += 200
  viewport.scrollHeight += 20; onResize()
  assert.equal(calls.length, 0)
  hook.scrollToBottom(false); calls.length = 0
  viewport.scrollHeight += 20; onResize()
  assert.equal(calls.length, 1)
  cleanup()
})

test('a gesture already at the bottom resumes after cooldown without requiring a scroll event', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { hook, viewport, calls, state, cleanup } = setup()
  hook.markUserInput()
  viewport.scrollHeight += 80; onResize()
  assert.equal(calls.length, 0, 'growth during cooldown waits without losing the bottom intent')
  now += 151; context.mock.timers.tick(151)
  assert.equal(state().isPinned, true)
  calls.length = 0; viewport.scrollHeight += 80; onResize()
  assert.equal(calls.length, 1)
  hook.pauseFollowing(); now += 151; context.mock.timers.tick(151)
  assert.equal(state().isPinned, false, 'explicit reading hold survives the same cooldown')
  cleanup()
})

test('original nonlinear 28px fade clears each edge within 2px and updates on content resize', () => {
  slots = []; cursor = 0; effects = []
  const render = () => {
    cursor = 0; effects = []
    return (ScrollFadeContainer as any)({ children: null })
  }
  let element = render()
  const viewport = { scrollTop: 0, scrollHeight: 1_000, clientHeight: 400, children: [] }
  element.props.ref(viewport)
  const cleanup = effects.map(effect => effect())
  const check = (top: string, bottom: string) => {
    element = render()
    assert.equal(element.props.style['--cds-scroll-fade-top'], top)
    assert.equal(element.props.style['--cds-scroll-fade-bottom'], bottom)
    assert.match(element.props.style.maskImage, /#0000000d.*0\.15/)
    assert.match(element.props.style.maskImage, /#000000d9.*0\.87/)
    assert.equal(element.props.style.maskImage, element.props.style.WebkitMaskImage)
  }
  check('0px', '28px')
  viewport.scrollTop = 200; element.props.onScroll({}); check('28px', '28px')
  viewport.scrollTop = 598; element.props.onScroll({}); check('28px', '0px')
  viewport.scrollHeight = 400; viewport.scrollTop = 0; onResize(); check('0px', '0px')
  viewport.scrollHeight = 900; onResize(); check('0px', '28px')
  viewport.clientHeight = 900; onResize(); check('0px', '0px')
  cleanup.forEach(fn => { fn?.() })
})
