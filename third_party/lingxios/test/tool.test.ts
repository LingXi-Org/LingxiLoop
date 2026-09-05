import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { boundedToolOutput, parseIPythonArguments } from '../src/runtime/tool.js'

describe('parseIPythonArguments', () => {
  it('accepts a strict single-code object', () => {
    assert.deepEqual(parseIPythonArguments('{"code":"print(1)"}'), { code: 'print(1)' })
  })

  it('rejects non-JSON', () => {
    assert.throws(() => parseIPythonArguments('print(1)'), /strict JSON/)
  })

  it('rejects extra properties', () => {
    assert.throws(() => parseIPythonArguments('{"code":"x","lang":"py"}'), /exactly one property/)
  })

  it('rejects missing, empty, and non-string code', () => {
    assert.throws(() => parseIPythonArguments('{}'), /exactly one property/)
    assert.throws(() => parseIPythonArguments('{"code":"  "}'), /non-empty string/)
    assert.throws(() => parseIPythonArguments('{"code":42}'), /non-empty string/)
    assert.throws(() => parseIPythonArguments('["code"]'), /JSON object/)
  })
})

describe('boundedToolOutput', () => {
  it('passes small payloads through verbatim', () => {
    assert.equal(boundedToolOutput({ a: 1 }), '{"a":1}')
  })

  it('truncates oversized payloads into valid JSON', () => {
    const output = boundedToolOutput({ blob: 'x'.repeat(20_000) }, 1_000)
    const parsed = JSON.parse(output) as { truncated: boolean; preview: string }
    assert.equal(parsed.truncated, true)
    assert.ok(output.length <= 1_000 + 40)
  })

  it('handles undefined without corrupting JSON', () => {
    assert.equal(boundedToolOutput(undefined), 'null')
  })
})
