import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCoverPresentation } from './cover-presentation.js'
import { CaseCoverGenerationError } from './cover-validation.js'
import { parseCoverProgram } from '../../../../src/features/cases/cover-vm/program.js'

test('presentation is V2 source data and preserves exact original source newlines', () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const kernel = `var HL = {};${newline}`, figure = `hairline({});${newline}`
    assert.deepEqual(parseCoverProgram(buildCoverPresentation({ kernel, figure, altText: '封面' })), { version: 2, engine: 'quickjs-wasm', kernel, figure })
  }
})
test('presentation rejects NUL and oversize source', () => {
  for (const field of ['figure', 'kernel', 'altText'] as const) {
    const input = { kernel: 'var HL = {};', figure: 'hairline({});', altText: '封面' }
    input[field] += '\0'
    assert.throws(() => buildCoverPresentation(input), CaseCoverGenerationError)
  }
  assert.throws(() => buildCoverPresentation({ kernel: 'x'.repeat(65537), figure: 'x', altText: '封面' }), CaseCoverGenerationError)
})
