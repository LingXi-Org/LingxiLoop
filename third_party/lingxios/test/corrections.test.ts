import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CorrectionBudget } from '../src/runtime/corrections.js'

describe('CorrectionBudget', () => {
  it('grants exactly one correction per category', () => {
    const budget = new CorrectionBudget()
    assert.equal(budget.consume('tool_protocol'), true)
    assert.equal(budget.consume('tool_protocol'), false)
  })

  it('tracks categories independently', () => {
    const budget = new CorrectionBudget()
    assert.equal(budget.consume('tool_protocol'), true)
    assert.equal(budget.consume('kernel_error'), true)
    assert.equal(budget.consume('response_protocol'), true)
    assert.equal(budget.consume('tool_protocol'), false)
    assert.equal(budget.consume('kernel_error'), false)
    assert.equal(budget.consume('response_protocol'), false)
  })

  it('has() reflects remaining budget without consuming it', () => {
    const budget = new CorrectionBudget()
    assert.equal(budget.has('tool_protocol'), true)
    assert.equal(budget.has('tool_protocol'), true) // calling has() does not consume
    budget.consume('tool_protocol')
    assert.equal(budget.has('tool_protocol'), false)
  })
})
