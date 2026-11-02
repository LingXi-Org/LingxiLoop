import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWebDocument, buildWebShell } from './document.js'

const hashes = Object.fromEntries(['capture.js','kit-tooltip.js','kit-carousel.js','kit-tabs.js','kit-icons.js','vendor/lucide-1.17.0.js','kit.css'].map(name => [name,'a'.repeat(64)]))
const resource = async (name: string) => ({'math.js':'window.fixtureMathLoaded=true;', 'visualize.html':'<!--__INLINE_VISUALIZATION_FRAGMENT__-->', 'gen-ui.js':'window.fixtureSdkLoaded=true;'}[name] ?? '')
const pinnedKit = '42d9c7d924174a23545ad2ffc31ec0692ca589b3999c2ffdc21c1d358f4185bf'

test('a view without math does not download or await the math runtime before becoming usable', async () => {
  const reads: string[] = []
  const doc = await buildWebDocument('<button>Increase</button>', null, async name => {
    reads.push(name)
    return resource(name)
  }, pinnedKit, { ...hashes, 'math.js': 'b'.repeat(64) })
  assert.deepEqual(reads, ['kit.css', 'gen-ui.js'])
  assert.ok(doc.includes('fixtureSdkLoaded'))
  assert.ok(!doc.includes('fixtureMathLoaded'))
  assert.ok(doc.includes('visualize-' + 'b'.repeat(64) + '.js'), 'dynamic math retains a hash-bound loader')
})

test('initial math keeps its awaited renderer for every supported delimiter', async () => {
  for (const formula of ['$$x^2$$', '\\(x^2\\)', '\\[x^2\\]', '\\begin{align}x&=2\\end{align}']) {
    const doc = await buildWebDocument(`<p>${formula}</p>`, null, resource, pinnedKit, { ...hashes, 'math.js': 'b'.repeat(64) })
    assert.ok(doc.includes('fixtureMathLoaded'), formula)
  }
})

test('math runs inside the content document after authored content on both kit paths', async () => {
  for (const kit of [undefined, '42d9c7d924174a23545ad2ffc31ec0692ca589b3999c2ffdc21c1d358f4185bf']) {
    const doc = await buildWebDocument('<div id="attention">\\(x^2\\)</div>',null,resource,kit,hashes)
    assert.ok(doc.indexOf('fixtureMathLoaded') > doc.indexOf('id="attention"'))
    assert.ok(doc.includes("connect-src 'none'"))
    const shell = buildWebShell(doc)
    assert.ok(shell.includes("guest.setAttribute('sandbox','allow-scripts')"))
    assert.ok(!shell.includes('allow-same-origin'))
  }
})

test('unavailable math enhancement keeps the authored source and the SDK usable', async () => {
  const doc = await buildWebDocument('<p>\\(x^2\\)</p>',null,async name => {
    if(name==='math.js') throw new Error('unavailable')
    return resource(name)
  },undefined,hashes)
  assert.ok(doc.includes('<p>\\(x^2\\)</p>'))
  assert.ok(doc.includes('fixtureSdkLoaded'))
})


test('a stalled optional math resource cannot exhaust whole-view initialization', async t => {
  t.mock.timers.enable({apis:['setTimeout']})
  let signal: AbortSignal | undefined
  const pending = buildWebDocument('<p>\\(x^2\\)</p>',null,async (name, budget) => {
    if(name==='math.js') { signal = budget; return new Promise<string>(() => {}) }
    return resource(name)
  },undefined,hashes)
  for(let i=0;i<20;i++) await Promise.resolve()
  t.mock.timers.tick(8000)
  const doc = await pending
  assert.equal(signal?.aborted, true, 'the optional timeout releases its reader')
  assert.ok(doc.includes('<p>\\(x^2\\)</p>'))
  assert.ok(doc.includes('fixtureSdkLoaded'))
})
