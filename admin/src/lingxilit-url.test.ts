import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeLingxiLitUrl } from './lingxilit-url.js'

test('LingxiLit admin URL accepts HTTP(S) URLs only', () => {
  assert.deepEqual(
    [
      normalizeLingxiLitUrl('https://lingxilit.example.com/dashboards/lingxiloop'),
      normalizeLingxiLitUrl('http://localhost:3000'),
      normalizeLingxiLitUrl('http://lingxilit.internal:3000'),
      normalizeLingxiLitUrl('javascript:alert(1)'),
    ],
    [
      'https://lingxilit.example.com/dashboards/lingxiloop',
      'http://localhost:3000/',
      'http://lingxilit.internal:3000/',
      undefined,
    ],
  )
})
