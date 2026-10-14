import assert from 'node:assert/strict'
import test from 'node:test'
import { startHomeworkMeter } from './meter'

// Failures: provider rejection, malformed JSON and missing usage must fail closed,
// distinguish the failing boundary, and never retain provider text or credentials.
test('live meter records only bounded failure metadata across its HTTP boundary', async () => {
  const originalFetch = globalThis.fetch
  const names = ['BASE_URL', 'MODEL', 'API_KEY', 'INPUT_CNY_PER_MILLION', 'OUTPUT_CNY_PER_MILLION']
  const previous = names.map(name => process.env[`EVAL_JUDGE_${name}`])
  for (const [name, value] of Object.entries({ BASE_URL: 'https://provider.example.invalid/v1', MODEL: 'test-judge', API_KEY: 'PRIVATE_CREDENTIAL_SENTINEL', INPUT_CNY_PER_MILLION: '1', OUTPUT_CNY_PER_MILLION: '2' })) process.env[`EVAL_JUDGE_${name}`] = value
  try {
    for (const fixture of [
      { status: 503, body: 'PRIVATE_PROVIDER_SENTINEL', stage: 'provider-status' },
      { status: 200, body: 'PRIVATE_INVALID_JSON_SENTINEL', stage: 'response-json' },
      { status: 200, body: JSON.stringify({ choices: [{ message: { content: 'PRIVATE_CONTENT_SENTINEL' } }] }), stage: 'usage' },
    ]) {
      globalThis.fetch = async (input, init) => String(input).startsWith('https://provider.example.invalid/')
        ? new Response(fixture.body, { status: fixture.status }) : originalFetch(input, init)
      const meter = await startHomeworkMeter(1)
      try {
        const response = await originalFetch(`${meter.judgeBaseURL}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'test-judge', max_tokens: 100, messages: [{ role: 'user', content: 'PRIVATE_REQUEST_SENTINEL' }] }) })
        assert.equal(response.status, 502)
        const snapshot = meter.snapshot()
        assert.equal(snapshot.failed, true)
        assert.equal(snapshot.receipts.length, 1)
        assert.deepEqual((snapshot.receipts[0] as unknown as { failure: unknown }).failure, { stage: fixture.stage, httpStatus: fixture.status })
        assert.doesNotMatch(JSON.stringify(snapshot), /PRIVATE_\w+_SENTINEL/)
      } finally { await meter.stop() }
    }
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => { const key = `EVAL_JUDGE_${name}`; if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index] })
  }
})
