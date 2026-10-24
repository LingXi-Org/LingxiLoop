import assert from 'node:assert/strict'
import test from 'node:test'
import { createCoverGuest } from './guest'
import { COVER_VM_LIMITS, createCoverSvgSink, parseCoverFrame } from './protocol'
import { createCoverClock } from './virtual-clock'

const frame = (attrs: Record<string, string> = {}, tag = 'path') => JSON.stringify({ version: 1, sequence: 0, root: {
  id: 1, tag: 'svg', attrs: { viewBox: '0 0 400 320' }, children: [{ id: 2, tag, attrs, children: [] }],
} })
test('classList add/remove admit only the closed palette and update atomically', () => {
  const guest = createCoverGuest()
  const path = guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'path')
  guest.svg.appendChild(path)
  path.setAttribute('class', 'nf lo')
  path.classList.add('hi', 'hi')
  assert.equal(path.attrs.class, 'nf lo hi')
  path.classList.remove('lo')
  assert.equal(path.attrs.class, 'nf hi')
  for (const invalid of ['external', 'hi lo', '', 'hi\n']) {
    assert.throws(() => path.classList.add('dot', invalid))
    assert.equal(path.attrs.class, 'nf hi')
    assert.throws(() => path.classList.remove(invalid))
  }
  guest.dispose()
  assert.throws(() => path.classList.add('hi'))
  assert.throws(() => path.classList.remove('hi'))
})
test('terrain marker after() keeps painter order without granting host DOM access', () => {
  const guest = createCoverGuest(), other = createCoverGuest()
  const mk = () => guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'g')
  const back = mk(), front = mk(), marker = mk(), detached = mk()
  guest.svg.appendChild(back); guest.svg.appendChild(front); guest.svg.appendChild(marker)
  back.after(marker)
  assert.deepEqual(guest.svg.children, [back, marker, front])
  front.after(marker)
  assert.deepEqual(guest.svg.children, [back, front, marker])
  marker.after(marker)
  assert.deepEqual(guest.svg.children, [back, front, marker])
  const group = mk(); guest.svg.appendChild(group); group.appendChild(detached)
  back.after(detached)
  assert.deepEqual(guest.svg.children, [back, detached, front, marker, group])
  assert.equal(group.children.length, 0)
  assert.throws(() => back.after(guest.svg))
  assert.throws(() => back.after(other.svg))
  assert.equal(parseCoverFrame(guest.snapshot()).root.children[1].id, detached.id)
  guest.dispose(); other.dispose()
  assert.throws(() => back.after(marker))
})
test('snapshot rejects native execution, navigation, CSS and external resources', () => {
  for (const tag of ['script', 'foreignObject', 'image', 'a', 'animate', 'use', 'style', 'iframe', 'svg']) assert.throws(() => parseCoverFrame(frame({}, tag)))
  const invalidAttributes: Record<string, string>[] = [ { onclick: 'alert(1)' }, { href: 'https://invalid.test' }, { style: 'fill:red' }, { fill: 'url(https://invalid.test)' }, { fill: 'url(data:image/svg+xml,x)' }, { class: 'application-secret' }, { id: '__proto__' }, { transform: 'translate(1)' }, { d: 'M0 0\u0000' } ]
  for (const attrs of invalidAttributes) assert.throws(() => parseCoverFrame(frame(attrs)))
})
test('complete snapshot resolves only its own typed local paint references', () => {
  const value = JSON.parse(frame({ fill: 'url(#hl-fd1g)' }))
  assert.throws(() => parseCoverFrame(JSON.stringify(value)))
  value.root.children.push({ id: 3, tag: 'linearGradient', attrs: { id: 'hl-fd1g', gradientUnits: 'userSpaceOnUse' }, children: [] })
  assert.equal(parseCoverFrame(JSON.stringify(value)).root.children.length, 2)
  value.root.children[1].tag = 'g'
  assert.throws(() => parseCoverFrame(JSON.stringify(value)))
})
test('strict schema, duplicate identity, output size and nesting are bounded', () => {
  const value = JSON.parse(frame())
  value.extra = 1; assert.throws(() => parseCoverFrame(JSON.stringify(value))); delete value.extra
  value.root.children[0].id = 1; assert.throws(() => parseCoverFrame(JSON.stringify(value)))
  assert.throws(() => parseCoverFrame(' '.repeat(COVER_VM_LIMITS.bytes + 1)))
  const nested = JSON.parse(frame()); let node = nested.root.children[0]
  for (let i = 0; i < 17; i++) { node.children = [{ id: i + 3, tag: 'g', attrs: {}, children: [] }]; node = node.children[0] }
  assert.throws(() => parseCoverFrame(JSON.stringify(nested)))
  assert.throws(() => parseCoverFrame(frame(JSON.parse('{"__proto__":"x"}'))))
})
test('sink validates entire frame before DOM mutation and fences stale output/disposal', () => {
  let mutations = 0
  const created: string[] = []
  const stage = {
    ownerDocument: { createElementNS: (_ns: string, tag: string) => {
      created.push(tag); return { setAttribute() {}, appendChild() {} }
    } },
    replaceChildren() { mutations++ },
  } as unknown as Element
  const sink = createCoverSvgSink(stage)
  assert.throws(() => sink.accept(frame({ onload: 'bad' })))
  assert.equal(mutations, 0); assert.equal(created.length, 0)
  assert.equal(sink.accept(frame({ d: 'M0 0L20 10' })), true)
  assert.equal(sink.accept(frame()), false)
  assert.equal(mutations, 1)
  sink.dispose(); assert.equal(sink.accept(frame()), false); assert.equal(mutations, 2)
})
test('virtual clock has bounded queues, elapsed time and recursive callback work', () => {
  const clock = createCoverClock(); let calls = 0
  const loop = () => { calls++; clock.setTimeout(loop) }
  clock.setTimeout(loop); clock.advance(16); assert.equal(calls, 1)
  clock.advance(16); assert.equal(calls, 2)
  assert.throws(() => clock.advance(Infinity)); assert.throws(() => clock.advance(51))
  for (let i = 0; i < COVER_VM_LIMITS.callbacks - 1; i++) clock.requestAnimationFrame(() => {})
  assert.throws(() => clock.requestAnimationFrame(() => {}))
  clock.dispose(); clock.advance(16); assert.equal(calls, 2); assert.equal(clock.pending, 0)
})
test('cancelling a queued callback or disposing during a tick skips remaining callbacks', () => {
  const clock = createCoverClock(); let calls = 0
  const id = clock.requestAnimationFrame(() => { calls++ }); clock.cancelAnimationFrame(id)
  clock.requestAnimationFrame(() => clock.dispose()); clock.setTimeout(() => { calls++ })
  clock.advance(16); assert.equal(calls, 0)
})
test('trusted synthetic part receives scalar pointer hit and changes only its geometry', () => {
  const guest = createCoverGuest()
  const path = guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M0 0L10 10'); guest.svg.appendChild(path)
  let events = 0
  guest.stage.addEventListener('pointermove', event => {
    assert.deepEqual(Object.keys(event).sort(), ['clientX', 'clientY', 'pointerId', 'pointerType'])
    if (Number(event.clientX) >= 190 && Number(event.clientX) <= 210) path.setAttribute('d', 'M0 0L10 30')
    events++
  })
  guest.pointer('pointermove', 200, 160, 'mouse')
  assert.equal(parseCoverFrame(guest.snapshot()).root.children[0].attrs.d, 'M0 0L10 30')
  guest.environment({ visible: false, reducedMotion: false }); guest.pointer('pointermove', 200, 160, 'mouse')
  guest.environment({ visible: true, reducedMotion: true }); guest.pointer('pointermove', 200, 160, 'mouse')
  assert.equal(events, 1)
  guest.dispose(); guest.pointer('pointermove', 200, 160, 'mouse'); assert.throws(() => guest.snapshot())
})
test('visibility, reduced motion, focus and dispose have local lifecycle only', () => {
  const guest = createCoverGuest(); const visibility: boolean[] = []; let motion = 0, ticks = 0
  const observer = new guest.globals.IntersectionObserver(entries => visibility.push(entries[0].isIntersecting))
  observer.observe(guest.stage)
  guest.globals.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => { motion++ })
  guest.globals.requestAnimationFrame(() => { ticks++ })
  guest.environment({ visible: false, reducedMotion: true }); guest.advance(16)
  assert.equal(ticks, 0)
  guest.environment({ visible: true, reducedMotion: true }); guest.advance(16)
  assert.equal(ticks, 1); assert.equal(motion, 1); assert.deepEqual(visibility, [true, false, true])
  guest.focus(true); assert.equal(guest.stage.ownerDocument.activeElement, guest.stage)
  guest.focus(false); assert.equal(guest.stage.ownerDocument.activeElement, null)
  guest.dispose(); guest.advance(16); assert.equal(ticks, 1)
})
test('guest rejects node cycles, unbounded readout and unsupported document capabilities', () => {
  const guest = createCoverGuest()
  assert.deepEqual(Object.keys(guest.globals.document), ['createElementNS'])
  for (const name of ['fetch', 'RTCPeerConnection', 'localStorage', 'WebSocket', 'Worker', 'location']) assert.equal(name in guest.globals, false)
  assert.throws(() => guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'script'))
  const node = guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'g'); guest.svg.appendChild(node)
  assert.throws(() => node.appendChild(guest.svg))
  assert.throws(() => { guest.read.textContent = 'x'.repeat(513) })
  assert.throws(() => guest.pointer('pointermove', NaN, 0, 'mouse'))
})
test('guest allocation and observer limits include detached objects', () => {
  const guest = createCoverGuest()
  for (let i = 1; i < COVER_VM_LIMITS.nodes; i++) guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'g')
  assert.throws(() => guest.globals.document.createElementNS('http://www.w3.org/2000/svg', 'g'))
  for (let i = 0; i < 8; i++) new guest.globals.IntersectionObserver(() => {})
  assert.throws(() => new guest.globals.IntersectionObserver(() => {}))
  guest.dispose()
  assert.throws(() => guest.globals.requestAnimationFrame(() => {}))
})
