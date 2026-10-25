import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sourceSearchRequestSchema } from '../modules/knowledge/contracts.js'
import { verifiedTextAnchor } from '../modules/knowledge/source-search.js'

test('source search anchors only an exact unique excerpt in the returned text snapshot', () => {
  assert.deepEqual(verifiedTextAnchor('前言\nAttention uses Q, K and V.\n后记', 'Attention uses Q, K and V.'),
    { type: 'extracted_text', start: 3, end: 29 })
  assert.equal(verifiedTextAnchor('repeated repeated', 'repeated'), null)
  assert.equal(verifiedTextAnchor('Attention uses Q.', 'Attention uses K.'), null)
  assert.equal(verifiedTextAnchor('Text', ''), null)
  // A carried PDF marker is not a stored page/box coordinate.
  assert.equal(verifiedTextAnchor('[[PAGE:1]]\nfirst\n\n[[PAGE:2]]\nsecond', '[[PAGE:1]]\nsecond'), null)
})

test('source search rejects empty queries, unbounded result counts and caller scope overrides', () => {
  assert.deepEqual(sourceSearchRequestSchema.parse({ query: '  attention  ' }), { query: 'attention', limit: 8 })
  for (const input of [{ query: '' }, { query: 'a', limit: 100 }, { query: 'a', sourceIds: ['private'] },
    { query: 'a', companyId: 'other' }, { query: 'a', indexVersion: '' }]) {
    assert.equal(sourceSearchRequestSchema.safeParse(input).success, false)
  }
})
