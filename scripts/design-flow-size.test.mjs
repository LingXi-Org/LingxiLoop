import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { adaptDesignLayout } from './build-design-layout.mjs'
import { build } from 'esbuild'
const compiled = await build({ stdin: { contents: "export {resizeFlowManifest,hasViewportHeightDependency} from './shared/design-flow-size'", resolveDir: process.cwd() },
  bundle: true, format: 'esm', platform: 'node', write: false })
const { resizeFlowManifest: resize, hasViewportHeightDependency } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`)
const resizeFlowManifest = (manifest, file, size) => resize(manifest, file, size, (item, x, y) => ({ ...item, x, y }))

test('viewport sizing admission checks descendants and inherited author values before computed px hide their units', () => {
  const previous = globalThis.document
  globalThis.document = { styleSheets: [] }
  const element = (values, children = [], parentElement = null) => ({
    style: { [Symbol.iterator]: function* () { yield* Object.keys(values) }, getPropertyValue: property => values[property] },
    querySelectorAll: () => children, closest: () => null, parentElement,
  })
  try {
    assert.equal(hasViewportHeightDependency(element({ 'min-height': '100vh' })), true)
    for (const value of ['100dvh', '100svh', '100lvh', '100vb', '100vmin', '100vmax', 'calc(100vh - 12px)', '100%']) {
      assert.equal(hasViewportHeightDependency(element({ 'min-height': '200px' }, [element({ height: value })])), true, value)
    }
    assert.equal(hasViewportHeightDependency(element({ 'min-height': '200px' }, [], element({ '--screen': 'calc(100svh - 1px)' }))), true)
    assert.equal(hasViewportHeightDependency(element({ 'min-height': 'calc(100px + 100px)' }, [element({ height: 'calc(50vw - 20px)' })])), false)
    assert.equal(hasViewportHeightDependency(element({ 'min-height': '200px' }, [element({ 'line-height': '100%' })])), false)
  } finally {
    if (previous === undefined) delete globalThis.document
    else globalThis.document = previous
  }
})

test('content height updates the model and moves later rows together, preserving pages and source objects', () => {
  const first = { file: 'one', x: 0, y: 0, w: 1280, h: 1180 }
  const next = { file: 'two', x: 0, y: 1300, w: 500, h: 300 }
  const side = { file: 'side', x: 1400, y: 0, w: 400, h: 500 }
  const other = { file: 'other', page: 'other', x: 0, y: 1300, w: 500, h: 300 }
  const note = { id: 'note', x: 0, y: 1260, text: 'keep me' }
  const manifest = { artboards: [first, next, side, other], annotations: [note], title: 'keep' }
  const grown = resizeFlowManifest(manifest, 'one', { w: 1280, h: 1715 })
  assert.equal(grown.artboards[0].h, 1715)
  assert.equal(grown.artboards[1].y, 1835)
  assert.equal(grown.annotations[0].y, 1795)
  assert.equal(grown.artboards[2], side)
  assert.equal(grown.artboards[3], other)
  assert.equal(first.h, 1180)
  assert.equal(next.y, 1300)
  assert.equal(note.y, 1260)
  assert.equal(grown.title, 'keep')
  const shorter = resizeFlowManifest(grown, 'one', { w: 1280, h: 1400 })
  assert.equal(shorter.artboards[0].h, 1400)
  assert.equal(shorter.artboards[1].y, 1835, 'shrinking never pulls authored later rows upward')
  const repeated = resizeFlowManifest(shorter, 'one', { w: 1280, h: 1715 })
  assert.equal(repeated.artboards[1].y, 1835, 'repeated content growth reuses spare space without row drift')
  assert.equal(repeated.annotations[0].y, 1795)
  assert.equal(resizeFlowManifest(grown, 'one', { w: 1280, h: 1715 }), grown, 'settled reports do no work')
})

test('rejects invalid/stale measurements, fixed interactions and existing layered compositions', () => {
  const one = { file: 'one', x: 0, y: 0, w: 1280, h: 1180 }
  for (const size of [{ w: 1270, h: 1700 }, { w: 1280, h: NaN }, { w: 1280, h: 8001 }, { w: 1280, h: -1 }]) {
    const m = { artboards: [one] }
    assert.equal(resizeFlowManifest(m, 'one', size), m)
  }
  for (const extra of [{ is_interactive: true }, { frameless: true }]) {
    const m = { artboards: [{ ...one, ...extra }] }
    assert.equal(resizeFlowManifest(m, 'one', { w: 1280, h: 1700 }), m)
  }
  const layered = { artboards: [one, { file: 'inset', x: 100, y: 1000, w: 400, h: 400 }] }
  assert.equal(resizeFlowManifest(layered, 'one', { w: 1280, h: 1700 }), layered)
})

test('the pinned hook keeps the native message-source owner, read-only guard, throttle and model/CAS persistence', async () => {
  const original = await readFile('third_party/baoyu-design/upstream/claude-design/scripts/editor/assets/index-CYLuwRoc.js', 'utf8')
  const adapted = adaptDesignLayout(original, '')
  assert.ok(adapted.includes('(0,e.isPreviewMessage)(Ot,Ct.current)'))
  assert.ok(adapted.includes('if(!Vl.current||(!ft&&!xe.flow))'))
  assert.ok(adapted.includes('Sr.h<40||Sr.h>8000'))
  assert.ok(adapted.includes('frameless:l=!1,') && adapted.includes('expanded:d=!1,') && adapted.includes('playing:i=!1,') && adapted.includes('box:r,'))
  assert.ok(adapted.includes('l||d||i||!r'))
  assert.ok(adapted.includes('Te.set(ae,setTimeout($e,400))'))
  assert.ok(adapted.includes('serializeCanvasMetadata)(Lt),{auto:!0}'))
  assert.throws(() => adaptDesignLayout('unexpected source', ''), /pinned Design flow hook changed/)
})
