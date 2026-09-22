import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { jevConfigFromEnv, jevJudge } from '../src/jev.js'
import { ModelError } from '../src/contracts.js'

test('independent Jev judge validates protocol, abstains, bounds spend and accounts failures without retries', async () => {
  assert.throws(() => jevConfigFromEnv({ TYPESAFE_API_KEY: 'runtime-secret' }), /invalid_jev/)
  let calls = 0, mode = 'pass'
  const server = createServer(async (request, response) => {
    calls++
    let body = ''
    for await (const chunk of request) body += chunk
    assert.equal(request.url, '/v1/systemone')
    assert.equal(JSON.parse(body).state.evidence[0].actual, true)
    if (mode === 'http') { response.writeHead(429); response.end('private-secret'); return }
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ model: mode === 'alias' ? 'jev-latest' : 'jev-1.13.0',
      usage: mode === 'missing' ? {} : { input_tokens: 1000, output_tokens: 10 }, answers: { verdict: { type: 'choice', choice: 'PASS',
        confidence: mode === 'uncertain' ? 0.5 : 1, probabilities: { PASS: 1, PARTIAL: 0, UNSUPPORTED: 0, WRONG_SCOPE: 0, FAIL: 0, UNCERTAIN: 0 } } } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  try {
    const config = { apiKey: 'fixture', model: 'jev-1.13.0', inputCnyPerMillion: 0.3, timeoutMs: 1000, baseURL: `http://127.0.0.1:${address.port}/v1` }
    const judge = jevJudge(config)
    const grade = (maxCostCny = 1) => judge.grade('task', 'answer', 'criteria', new AbortController().signal, 'request', { evidence: [{ actual: true }] as never, maxCostCny })
    assert.deepEqual(await grade(), { score: 1, usage: { inputTokens: 1000, outputTokens: 10, costCny: 0.0003 }, reason: 'semantic_pass' })
    mode = 'uncertain'; assert.equal((await grade()).score, 0)
    for (mode of ['http', 'missing', 'alias']) await assert.rejects(grade(), error => error instanceof ModelError && !error.message.includes('private-secret'))
    assert.equal(calls, 5)
    await assert.rejects(grade(0), /judge_spend_limit_reached/)
    assert.equal(calls, 5)
    assert.notEqual(judge.fingerprint, jevJudge({ ...config, model: 'jev-1.14.0' }).fingerprint)
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

test('atomic rubric covers every original criterion and never approves missing answers', async () => {
  let omit = false
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk
    const payload = JSON.parse(body)
    assert.equal(payload.state.expected, '必须引用来源。必须保留反证。')
    assert.deepEqual(Object.keys(payload.questions), ['criterion_0', 'criterion_1'])
    const answer = (choice: string) => ({ type: 'choice', choice, confidence: 1, probabilities: { PASS: Number(choice === 'PASS'), PARTIAL: 0, UNSUPPORTED: Number(choice === 'UNSUPPORTED'), WRONG_SCOPE: 0, FAIL: 0, UNCERTAIN: 0 } })
    response.end(JSON.stringify({ model: 'jev-1.13.0', usage: { input_tokens: 40, output_tokens: 10 }, answers: { criterion_0: answer('PASS'), ...omit ? {} : { criterion_1: answer('UNSUPPORTED') } } }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const judge = jevJudge({ apiKey: 'fixture', model: 'jev-1.13.0', inputCnyPerMillion: .3, timeoutMs: 1000, baseURL: `http://127.0.0.1:${(server.address() as {port:number}).port}/v1` })
    const grade = () => judge.grade('task', 'answer', '必须引用来源。必须保留反证。', new AbortController().signal, 'atomic')
    assert.equal((await grade()).reason, 'semantic_unsupported')
    omit = true
    await assert.rejects(grade(), /invalid_jev_judge_coverage/)
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
})
