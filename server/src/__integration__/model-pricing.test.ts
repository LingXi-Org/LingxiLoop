import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { __setLlmClientOverrideForTesting, createChatCompletion } from '../llm.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Failure modes: malformed cache usage drops a paid call, incomplete/invalid
// tokens are labelled measured, or legacy admission overrides distort CN billing.
test('Flash provider usage cannot bypass the authoritative product ledger', async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const { companyId } = await seedCompanyWithAgent()
  const originalModel = env.OPENAI_MODEL, originalBase = env.OPENAI_BASE_URL
  const originalRate = process.env.SILICONFLOW_USD_CNY_RATE
  env.OPENAI_MODEL = 'zai-org/GLM-5.3-Flash'; env.OPENAI_BASE_URL = 'https://api.siliconflow.cn/v1'
  process.env.SILICONFLOW_USD_CNY_RATE = '7'
  const cases = [
    { usage: { prompt_tokens: 10, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 11 } }, measured: true },
    { usage: { prompt_tokens: 10 }, measured: false },
    { usage: { prompt_tokens: -1, completion_tokens: 2 }, measured: false },
    { usage: { prompt_tokens: 1.5, completion_tokens: 2 }, measured: false },
    { usage: undefined, measured: false },
  ]
  let issued = 0
  try {
    for (const [index, scenario] of cases.entries()) {
      __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => {
        issued++
        return { choices: [{ message: { content: 'ok' } }], usage: scenario.usage }
      } } } }) as never)
      await createChatCompletion({ purpose: `malformed-usage-${index}`, companyId }, {
        model: env.OPENAI_MODEL, messages: [{ role: 'user', content: 'synthetic' }],
      })
      const rows = (await pool.query('SELECT measured,status,cached_input_tokens,cost_usd FROM llm_calls WHERE company_id=$1 AND purpose=$2', [companyId, `malformed-usage-${index}`])).rows
      assert.equal(rows.length, 1)
      assert.equal(rows[0].status, 'succeeded')
      assert.equal(rows[0].measured, scenario.measured)
      assert.equal(rows[0].cached_input_tokens, 0)
      if (scenario.measured) assert.ok(Number(rows[0].cost_usd) > 0)
    }
    assert.equal(issued, cases.length)
  } finally {
    __setLlmClientOverrideForTesting(null)
    env.OPENAI_MODEL = originalModel; env.OPENAI_BASE_URL = originalBase
    if (originalRate === undefined) delete process.env.SILICONFLOW_USD_CNY_RATE
    else process.env.SILICONFLOW_USD_CNY_RATE = originalRate
    await teardownAll()
  }
})
