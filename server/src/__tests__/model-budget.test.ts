import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { runtimeExecutionBudget } from '../agent-runtime/model-budget.js'

test('complex artifact work has finite root-wide headroom and both deployment slots use the same defaults', () => {
  const limits = runtimeExecutionBudget({})
  assert.deepEqual(limits, { maxModelCalls: 512, maxTokens: 8_000_000, maxCostMicros: 50_000_000, wallClockMs: 7_200_000 })
  for (const slot of ['a', 'b']) {
    const compose = readFileSync(`deploy/app-${slot}/compose.yml`, 'utf8')
    for (const [name, value] of Object.entries({ AGENT_OS_MAX_MODEL_CALLS: limits.maxModelCalls,
      AGENT_OS_MAX_MODEL_TOKENS: limits.maxTokens, AGENT_OS_MAX_MODEL_COST_MICROS: limits.maxCostMicros, AGENT_OS_MAX_WORK_MS: limits.wallClockMs })) {
      assert.ok(compose.includes(`${name}: \u0024{${name}:-${value}}`), `${slot}: ${name}`)
    }
  }
})

test('explicit low budgets stay effective; unlimited, negative and fractional values fail closed', () => {
  assert.deepEqual(runtimeExecutionBudget({ AGENT_OS_MAX_MODEL_CALLS: '1', AGENT_OS_MAX_MODEL_TOKENS: '500',
    AGENT_OS_MAX_MODEL_COST_MICROS: '1', AGENT_OS_MAX_WORK_MS: '100' }),
  { maxModelCalls: 1, maxTokens: 500, maxCostMicros: 1, wallClockMs: 100 })
  for (const name of ['AGENT_OS_MAX_MODEL_CALLS', 'AGENT_OS_MAX_MODEL_TOKENS', 'AGENT_OS_MAX_MODEL_COST_MICROS', 'AGENT_OS_MAX_WORK_MS']) {
    for (const value of ['0', '-1', 'Infinity', 'NaN', '1.1', '9007199254740992']) assert.throws(() => runtimeExecutionBudget({ [name]: value }))
  }
})
