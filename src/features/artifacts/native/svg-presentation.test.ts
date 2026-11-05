import assert from 'node:assert/strict'
import test from 'node:test'
import { isSafeArtifactSvg } from '../../../../shared/artifact-document'
import { presentSvg } from './svg-presentation'

test('SVG presentation maps known fonts and scopes paint IDs without altering text or source', () => {
  const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 150"><defs><linearGradient id="paint"><stop offset="0" stop-color="#123456" /></linearGradient></defs><text font-family="'Merriweather', serif" fill="url(#paint)">id="literal" font-family="Merriweather" url(#paint)</text></svg>`
  assert.equal(isSafeArtifactSvg(source), true)
  const result = presentSvg(source, 'page-node-')
  assert.match(result, /font-family="&quot;LingxiLoopEditor Merriweather&quot;, serif"/)
  assert.match(result, /id="page-node-paint"/)
  assert.match(result, /fill="url\(#page-node-paint\)"/)
  assert.ok(result.includes('>id="literal" font-family="Merriweather" url(#paint)</text>'))
  assert.ok(source.includes('font-family="\'Merriweather\', serif"'))
})

test('unsafe SVG remains rejected and custom system font data stays unchanged', () => {
  assert.equal(presentSvg('<svg><script>alert(1)</script></svg>'), '')
  assert.equal(presentSvg('<svg onload="alert(1)"></svg>'), '')
  const custom = '<svg><text font-family="User Font">原文</text></svg>'
  assert.equal(presentSvg(custom), custom)
})
