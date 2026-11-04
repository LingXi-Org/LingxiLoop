import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { useSidebarWidth } from './useSidebarWidth'

function Probe() {
  const { width } = useSidebarWidth()
  return <output>{width}</output>
}
function withStorage(read: () => string | null) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: { getItem: read } } })
  try { return renderToStaticMarkup(<Probe />) }
  finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

test('missing storage restores the existing default pixel width', () => {
  assert.equal(withStorage(() => null), '<output>280</output>')
})
test('a saved width keeps pixels and clamps both native Panel bounds', () => {
  assert.equal(withStorage(() => '340'), '<output>340</output>')
  assert.equal(withStorage(() => '100'), '<output>260</output>')
  assert.equal(withStorage(() => '900'), '<output>360</output>')
})
test('non-finite persisted widths cannot enter the native layout', () => {
  for (const value of ['NaN', 'Infinity', '-Infinity', 'not-a-number']) assert.equal(withStorage(() => value), '<output>280</output>')
})
test('denied storage does not prevent the shell from opening', () => {
  assert.equal(withStorage(() => { throw new Error('storage denied') }), '<output>280</output>')
})
