import assert from 'node:assert/strict'
import { test } from 'node:test'
import { IPYTHON_TOOL_NAME, KERNEL_SDK_MODULE } from '../../../third_party/lingxios/src/protocol/constants.js'
import { parseIPythonArguments } from '../../../third_party/lingxios/src/runtime/tool.js'

test('the model-visible tool and kernel SDK names are the LingxiOS v2 names', () => {
  assert.equal(IPYTHON_TOOL_NAME, 'ipython')
  assert.equal(KERNEL_SDK_MODULE, 'host')
})

test('IPython arguments reject every shape except one non-empty code string', () => {
  assert.deepEqual(parseIPythonArguments('{"code":"x = 1"}'), { code: 'x = 1' })
  for (const invalid of ['{}', '[]', 'null', '{"code":""}', '{"code":"x","shell":true}', 'not-json']) {
    assert.throws(() => parseIPythonArguments(invalid))
  }
})
