import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULT_AGENT_OS_CONCURRENCY, parseAgentOSConcurrency } from '../agent-os/concurrency-config.js'

test('Agent OS defaults to enough concurrency for the six-agent learning room', () => {
  assert.equal(DEFAULT_AGENT_OS_CONCURRENCY, 8)
  assert.equal(parseAgentOSConcurrency(undefined), 8)
  assert.ok(parseAgentOSConcurrency(undefined) >= 6)
})

test('Agent OS concurrency remains configurable within its safe bounds', () => {
  assert.equal(parseAgentOSConcurrency('1'), 1)
  assert.equal(parseAgentOSConcurrency('32'), 32)
  for (const invalid of ['0', '33', '1.5', 'nope']) {
    assert.throws(() => parseAgentOSConcurrency(invalid), /between 1 and 32/)
  }
})
