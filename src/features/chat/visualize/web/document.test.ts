import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWebDocument, buildWebShell } from './document.js'

const hashes = Object.fromEntries(['capture.js','kit-tooltip.js','kit-carousel.js','kit-tabs.js','kit-icons.js','vendor/lucide-1.17.0.js','kit.css'].map(name => [name,'a'.repeat(64)]))
const resource = async (name: string) => ({'math.js':'window.fixtureMathLoaded=true;', 'visualize.html':'<!--__INLINE_VISUALIZATION_FRAGMENT__-->', 'gen-ui.js':'window.fixtureSdkLoaded=true;'}[name] ?? '')

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
