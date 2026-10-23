import assert from 'node:assert/strict'
import test from 'node:test'
import { qualificationModelDiagnostics } from '../__integration__/_qualification-model-diagnostics.js'

// Failure model: losing the terminal protocol code makes bounded retries
// indistinguishable; copying an error/extension can leak provider text. Only
// fixed enums and bounded numbers belong in a qualification artifact.
test('qualification retains exact safe terminal protocol diagnostics', () => {
  assert.deepEqual(qualificationModelDiagnostics({ kind: 'protocol', category: 'protocol',
    protocolCode: 'tool_identity_invalid', status: 200, finishReasons: ['tool_calls', 'tool_calls'],
    retryable: false, message: 'private sentinel', cause: { content: 'private sentinel' } }), {
    kind: 'protocol', category: 'protocol', protocolCode: 'tool_identity_invalid',
    status: 200, retryable: false, finishReasons: ['tool_calls', 'tool_calls'],
  })
})
test('unknown values and unbounded diagnostics cannot enter artifacts', () => {
  const result = qualificationModelDiagnostics({ kind: 'private sentinel', category: 'private sentinel',
    protocolCode: 'private sentinel', status: Infinity, retryable: 'private sentinel',
    finishReasons: Array(100).fill('private sentinel'), response: 'private sentinel' })
  assert.deepEqual(result, { finishReasons: Array(32).fill('unknown') })
  assert.equal(JSON.stringify(result).includes('private sentinel'), false)
  assert.deepEqual(qualificationModelDiagnostics(null), {})
  assert.deepEqual(qualificationModelDiagnostics({ status: 99 }), {})
})
