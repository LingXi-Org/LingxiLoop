import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalJson } from '../modules/trust/canonical-json.js'


test('canonical snapshot JSON sorts keys recursively and preserves dates', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}')
  assert.equal(canonicalJson({ 'ä': 1, z: 2 }), '{"z":2,"ä":1}')
  assert.equal(
    canonicalJson({ at: new Date('2026-08-30T00:00:00.000Z') }),
    '{"at":"2026-08-30T00:00:00.000Z"}',
  )
})
