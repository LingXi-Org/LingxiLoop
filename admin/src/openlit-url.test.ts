import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeOpenlitUrl } from './openlit-url.js'

test('OpenLIT admin URL accepts HTTP(S) URLs only', () => {
  assert.deepEqual(
    [
      normalizeOpenlitUrl('https://openlit.example.com/dashboards/lingxiloop'),
      normalizeOpenlitUrl('http://localhost:3000'),
      normalizeOpenlitUrl('http://openlit.internal:3000'),
      normalizeOpenlitUrl('javascript:alert(1)'),
    ],
    [
      'https://openlit.example.com/dashboards/lingxiloop',
      'http://localhost:3000/',
      'http://openlit.internal:3000/',
      undefined,
    ],
  )
})
