import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IPYTHON_TOOL, MODEL_TOOLS, parseIPythonArguments } from '../agent-os/tool.js'

test('the complete model-visible tool surface is strict IPython', () => {
  assert.equal(MODEL_TOOLS.length, 1)
  assert.equal(MODEL_TOOLS[0], IPYTHON_TOOL)
  assert.equal(IPYTHON_TOOL.function.name, 'ipython')
  assert.equal(IPYTHON_TOOL.function.strict, true)
  assert.deepEqual(IPYTHON_TOOL.function.parameters, {
    type: 'object',
    properties: { code: { type: 'string', description: 'Executable Python source only, without Markdown fences or user-facing prose. Python state persists across turns; never await loop SDK calls.' } },
    required: ['code'],
    additionalProperties: false,
  })
})

test('IPython arguments reject every shape except one non-empty code string', () => {
  assert.deepEqual(parseIPythonArguments('{"code":"x = 1"}'), { code: 'x = 1' })
  for (const invalid of ['{}', '[]', 'null', '{"code":""}', '{"code":"x","shell":true}', 'not-json']) {
    assert.throws(() => parseIPythonArguments(invalid))
  }
})
