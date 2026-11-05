import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveTheme, validateNodeBounds } from './compute-bulk'

test('bulk bounds validation reports invalid edits and duplicate ids without changing payloads', () => {
  const nodes = [{ id: 'bad', x: 0, y: 0, width: -1, height: 10 },
    { id: 'bad', x: Infinity, y: 0, width: 20, height: 10 }]
  assert.deepEqual(validateNodeBounds(nodes), [{ id: 'bad', code: 'negative_size' },
    { id: 'bad', code: 'duplicate_id' }, { id: 'bad', code: 'non_finite' }])
  assert.equal(nodes[0].width, -1)
})

test('theme aliases resolve transitively while literal CSS and unresolved values survive', () => {
  const input = { primary: '#123456', accent: '{primary}', fill: '$accent', size: 24, heading: '{size}',
    gradient: 'linear-gradient(red,blue)', absent: '{missing}', cycleA: '{cycleB}', cycleB: '$cycleA' }
  const result = resolveTheme(input)
  assert.equal(result.tokens.fill, '#123456')
  assert.equal(result.tokens.heading, 24)
  assert.equal(result.tokens.gradient, input.gradient)
  assert.equal(result.tokens.absent, input.absent)
  assert.equal(result.tokens.cycleA, input.cycleA)
  assert.deepEqual(result.issues, [{ key: 'absent', code: 'missing_token' },
    { key: 'cycleA', code: 'cyclic_token' }, { key: 'cycleB', code: 'cyclic_token' }])
  assert.equal(input.fill, '$accent')
})

test('long token chains resolve without recursive stack growth', () => {
  const tokens: Record<string, string | number> = {}
  for (let index = 0; index < 10_000; index++) tokens[`t${index}`] = `{t${index + 1}}`
  tokens.t10000 = 42
  const result = resolveTheme(tokens)
  assert.equal(result.tokens.t0, 42)
  assert.deepEqual(result.issues, [])
})
