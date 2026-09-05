import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AgentOSError, ApprovalPendingError, CapabilityDeniedError, ConfigError, KernelCancelledError,
  KernelExecutionError, KernelProtocolError, KernelTimeoutError, LeaseLostError, ModelDriverError,
  RunCancelledError, asError, errorMessage,
} from '../src/errors.js'

describe('AgentOSError subclasses', () => {
  it('carries a stable machine-readable code and the subclass name', () => {
    const error = new LeaseLostError()
    assert.equal(error.code, 'lease_lost')
    assert.equal(error.name, 'LeaseLostError')
    assert.ok(error instanceof AgentOSError)
    assert.ok(error instanceof Error)
  })

  it('RunCancelledError includes the scope in its default message', () => {
    const error = new RunCancelledError('preemption')
    assert.equal(error.code, 'run_cancelled')
    assert.equal(error.scope, 'preemption')
    assert.match(error.message, /preemption/)
  })

  it('KernelExecutionError retains the offending cellId', () => {
    const error = new KernelExecutionError('boom', 'cell-1')
    assert.equal(error.code, 'kernel_execution_failed')
    assert.equal(error.cellId, 'cell-1')
    assert.equal(error.message, 'boom')
  })

  it('KernelTimeoutError formats the timeout into the message', () => {
    const error = new KernelTimeoutError(5000, 'cell-2')
    assert.equal(error.code, 'kernel_timeout')
    assert.equal(error.timeoutMs, 5000)
    assert.match(error.message, /5000ms/)
  })

  it('KernelCancelledError and KernelProtocolError carry expected codes', () => {
    assert.equal(new KernelCancelledError('cell-3').code, 'kernel_cancelled')
    assert.equal(new KernelProtocolError('bad frame').code, 'kernel_protocol')
  })

  it('ApprovalPendingError carries approvalId and cellId', () => {
    const error = new ApprovalPendingError('appr-1', 'cell-4')
    assert.equal(error.approvalId, 'appr-1')
    assert.equal(error.cellId, 'cell-4')
    assert.match(error.message, /appr-1/)
  })

  it('CapabilityDeniedError carries the denied action', () => {
    const error = new CapabilityDeniedError('fs.write')
    assert.equal(error.action, 'fs.write')
    assert.match(error.message, /fs\.write/)
  })

  it('ModelDriverError carries structured diagnostics', () => {
    const diagnostics = { finishReasons: ['length'], status: 500, attempts: 3 }
    const error = new ModelDriverError('provider failed', diagnostics)
    assert.equal(error.code, 'model_driver')
    assert.deepEqual(error.diagnostics, diagnostics)
  })

  it('ConfigError carries the config code', () => {
    assert.equal(new ConfigError('missing key').code, 'config')
  })
})

describe('errorMessage', () => {
  it('extracts the message from an Error', () => {
    assert.equal(errorMessage(new Error('bad thing')), 'bad thing')
  })

  it('stringifies non-Error values', () => {
    assert.equal(errorMessage('plain string'), 'plain string')
    assert.equal(errorMessage(42), '42')
    assert.equal(errorMessage(null), 'null')
  })
})

describe('asError', () => {
  it('passes an Error through unchanged', () => {
    const original = new Error('already an error')
    assert.equal(asError(original), original)
  })

  it('wraps non-Error values in a new Error', () => {
    const wrapped = asError('oops')
    assert.ok(wrapped instanceof Error)
    assert.equal(wrapped.message, 'oops')
  })
})
