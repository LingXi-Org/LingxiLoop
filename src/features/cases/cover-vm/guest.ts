import { COVER_VM_LIMITS, type CoverSvgNode, invalidCoverData, parseCoverFrame, validateCoverAttribute } from './protocol'
import { createCoverClock } from './virtual-clock'

/** Compile this module INTO the guest bundle. Never hand these host objects to QuickJS.
 * The adapter is a compatibility surface; QuickJS/WASM is the isolation boundary.
 */
export function createCoverGuest() {
  const clock = createCoverClock()
  let nextNode = 1, sequence = 0, disposed = false, visible = true, reducedMotion = false
  type Listener = (event: Record<string, unknown>) => void
  const owned = new Set<Node>()
  class Node {
    readonly id: number
    readonly attrs: Record<string, string> = Object.create(null)
    readonly children: Node[] = []
    parent: Node | null = null
    constructor(readonly tag: string) {
      if (disposed || owned.size >= COVER_VM_LIMITS.nodes) invalidCoverData()
      this.id = nextNode++
      owned.add(this)
    }
    setAttribute(name: string, value: string) {
      if (disposed) invalidCoverData()
      value = String(value)
      validateCoverAttribute(name, value)
      if (!(name in this.attrs) && Object.keys(this.attrs).length >= COVER_VM_LIMITS.attributes) invalidCoverData()
      this.attrs[name] = value
    }
    appendChild(child: Node) {
      if (disposed || !owned.has(child)) invalidCoverData()
      for (let cursor: Node | null = this; cursor; cursor = cursor.parent) if (cursor === child) invalidCoverData()
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
      child.parent = this; this.children.push(child)
      return child
    }
    after(child: Node) {
      if (disposed || !owned.has(child)) invalidCoverData()
      const parent = this.parent
      if (!parent || child === this) return
      for (let cursor: Node | null = parent; cursor; cursor = cursor.parent) if (cursor === child) invalidCoverData()
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
      child.parent = parent
      // Find this node after detaching: moving an earlier sibling shifts indices.
      parent.children.splice(parent.children.indexOf(this) + 1, 0, child)
    }
    replaceChildren() {
      for (const child of this.children) child.parent = null
      this.children.length = 0
    }
    readonly classList = {
      toggle: (name: string, force?: boolean) => {
        const values = new Set((this.attrs.class ?? '').split(/\s+/).filter(Boolean))
        const enabled = force ?? !values.has(name)
        if (enabled) values.add(name); else values.delete(name)
        this.setAttribute('class', [...values].join(' '))
        return enabled
      },
    }
  }
  const listeners = new Map<string, Set<Listener>>()
  const allowedEvents = new Set(['pointermove', 'pointerdown', 'pointerleave', 'focusin', 'focusout'])
  const stage = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 320 }),
    contains: (value: unknown) => value === stage,
    ownerDocument: { activeElement: null as unknown },
    releasePointerCapture: (_id: number) => {},
    addEventListener(type: string, listener: Listener) {
      if (disposed || !allowedEvents.has(type) || typeof listener !== 'function') invalidCoverData()
      let total = 0; for (const set of listeners.values()) total += set.size
      if (total >= COVER_VM_LIMITS.callbacks) invalidCoverData()
      const set = listeners.get(type) ?? new Set<Listener>(); set.add(listener); listeners.set(type, set)
    },
    removeEventListener(type: string, listener: Listener) { listeners.get(type)?.delete(listener) },
  }
  const observers = new Set<Observer>()
  class Observer {
    observing = false
    constructor(readonly callback: (entries: { target: typeof stage; isIntersecting: boolean }[]) => void) {
      if (disposed || typeof callback !== 'function' || observers.size >= 8) invalidCoverData()
      observers.add(this)
    }
    observe(target: unknown) {
      if (disposed || target !== stage) invalidCoverData()
      this.observing = true; this.callback([{ target: stage, isIntersecting: visible }])
    }
    unobserve(target: unknown) { if (target === stage) this.observing = false }
    disconnect() { this.observing = false; observers.delete(this) }
  }
  const motionListeners = new Set<Listener>()
  const media = {
    get matches() { return reducedMotion },
    addEventListener(type: string, listener: Listener) {
      if (disposed || type !== 'change' || typeof listener !== 'function' || motionListeners.size >= 8) invalidCoverData()
      motionListeners.add(listener)
    },
    removeEventListener(type: string, listener: Listener) { if (type === 'change') motionListeners.delete(listener) },
  }
  const svg = new Node('svg'); svg.setAttribute('viewBox', '0 0 400 320')
  let readText = ''
  const read = {
    get textContent() { return readText },
    set textContent(value: string) {
      if (typeof value !== 'string' || value.length > 512) invalidCoverData()
      readText = value
    },
  }
  return {
    stage, svg, read,
    globals: {
      document: {
        createElementNS(namespace: string, tag: string) {
          if (namespace !== 'http://www.w3.org/2000/svg') invalidCoverData()
          // Validate tag before allocation, using the same host snapshot policy.
          parseCoverFrame(JSON.stringify({ version: 1, sequence: 0, root: { id: 1, tag: 'svg', attrs: { viewBox: '0 0 400 320' }, children: [{ id: 2, tag, attrs: {}, children: [] }] } }))
          return new Node(tag)
        },
      },
      performance: { now: clock.now },
      requestAnimationFrame: clock.requestAnimationFrame,
      cancelAnimationFrame: clock.cancelAnimationFrame,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
      window: { setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout },
      IntersectionObserver: Observer,
      matchMedia(query: string) { if (query !== '(prefers-reduced-motion: reduce)') invalidCoverData(); return media },
    },
    environment(input: { visible: boolean; reducedMotion: boolean }) {
      if (disposed) return
      if (typeof input.visible !== 'boolean' || typeof input.reducedMotion !== 'boolean') invalidCoverData()
      if (visible !== input.visible) {
        visible = input.visible
        for (const observer of [...observers]) if (observer.observing) observer.callback([{ target: stage, isIntersecting: visible }])
      }
      if (reducedMotion !== input.reducedMotion) {
        reducedMotion = input.reducedMotion
        for (const listener of [...motionListeners]) listener({ matches: reducedMotion })
      }
    },
    pointer(type: 'pointermove' | 'pointerdown' | 'pointerleave', x: number, y: number, pointerType: 'mouse' | 'touch' | 'pen') {
      if (disposed || !visible || reducedMotion) return
      if (!['pointermove', 'pointerdown', 'pointerleave'].includes(type) || !['mouse', 'touch', 'pen'].includes(pointerType) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 400 || y < 0 || y > 320) invalidCoverData()
      for (const listener of [...(listeners.get(type) ?? [])]) listener({ clientX: x, clientY: y, pointerType, pointerId: 1 })
    },
    focus(focused: boolean) {
      if (disposed) return
      if (typeof focused !== 'boolean') invalidCoverData()
      stage.ownerDocument.activeElement = focused ? stage : null
      for (const listener of [...(listeners.get(focused ? 'focusin' : 'focusout') ?? [])]) listener({ relatedTarget: null })
    },
    advance(delta: number) { if (!disposed && visible) clock.advance(delta) },
    snapshot() {
      if (disposed) invalidCoverData()
      const copy = (node: Node, depth: number): CoverSvgNode => {
        if (depth > COVER_VM_LIMITS.depth) invalidCoverData()
        return { id: node.id, tag: node.tag, attrs: { ...node.attrs }, children: node.children.map(child => copy(child, depth + 1)) }
      }
      const json = JSON.stringify({ version: 1, sequence: sequence++, root: copy(svg, 0) })
      parseCoverFrame(json)
      return json
    },
    dispose() {
      if (disposed) return
      disposed = true; clock.dispose(); listeners.clear(); motionListeners.clear(); observers.clear()
      svg.replaceChildren(); owned.clear(); readText = ''
    },
  }
}
