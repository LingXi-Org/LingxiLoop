import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { contentReviewDiagnostics, structuredRequestShape } from './content-review-diagnostics.js'

type Role = 'CANDIDATE' | 'JUDGE'
type Receipt = { id: string; role: Role; inputTokens: number; outputTokens: number; costCNY: number; status: 'measured' | 'failed'; model: string;
  contentReview?: NonNullable<ReturnType<typeof contentReviewDiagnostics>>; structuredRequest?: NonNullable<ReturnType<typeof structuredRequestShape>> }
const cost = (input: number, output: number, inputRate: number, outputRate: number) => (input * inputRate + output * outputRate) / 1e6
// Failure inventory: concurrent reservations overspend; missing/streamed usage is hidden;
// an unknown failure retries with fresh money; credential or prompt text leaks into evidence.
assert.equal(cost(1000, 2000, 2, 4), 0.01)
assert.ok(cost(1000, 2000, 2, 4) > cost(1000, 1000, 2, 4))

{
  const input = { workId: 'diagnostic-work', requestVersion: 1, originalText: 'PRIVATE_REQUEST_SENTINEL explain the area',
    revisions: [], body: 'PRIVATE_BODY_SENTINEL cannot inspect the source', checklist: [], resourceChecks: [], fileObservations: [], observations: { steps: [], dependencies: [] } }
  const request = { response_format: { type: 'json_object' }, messages: [{ role: 'user', content: JSON.stringify(input) }] }
  const valid = { missing: [{ quote: 'explain the area', reason: 'PRIVATE_REASON_SENTINEL' }],
    limitations: [{ quote: 'cannot inspect the source', requestQuote: 'explain the area', reason: 'Source is unavailable' }] }
  const response = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] })
  const inspect = (value: unknown) => contentReviewDiagnostics(request, response(value))!
  assert.equal(inspect(valid).matchesInstalledContract, true)
  const minimal = { workId: input.workId, originalText: input.originalText, body: input.body, revisions: [] }
  const minimalRequest = { ...request, messages: [{ role: 'user', content: JSON.stringify(minimal) }] }
  assert.equal(contentReviewDiagnostics(minimalRequest, response(valid))!.matchesInstalledContract, true)
  const shape = structuredRequestShape(minimalRequest)!
  assert.equal(shape.messages[0].jsonParsed, true)
  assert.equal(shape.messages[0].fields.checklist.present, false)
  assert.equal(shape.messages[0].fields.originalText.type, 'string')
  assert.doesNotMatch(JSON.stringify(shape), /PRIVATE_\w+_SENTINEL|explain the area|cannot inspect the source/)
  assert.equal(inspect({ ...valid, missing: [{ ...valid.missing[0], blockedBy: null }] }).missing.accepted, false)
  assert.equal(inspect({ ...valid, limitations: [{ quote: 'cannot inspect the source', reason: 'Source is unavailable' }] }).limitations.accepted, false)
  assert.equal(inspect({ ...valid, missing: [{ ...valid.missing[0], quote: 'PRIVATE_UNGROUNDED_SENTINEL' }] }).missing.accepted, false)
  const before = structuredClone(request), raw = response({ ...valid, PRIVATE_UNKNOWN_KEY_SENTINEL: 'PRIVATE_UNKNOWN_VALUE_SENTINEL' })
  const rawBefore = structuredClone(raw), observed = contentReviewDiagnostics(request, raw)!
  assert.equal(observed.unknownKeyCount, 1)
  assert.doesNotMatch(JSON.stringify(observed), /PRIVATE_\w+_SENTINEL|explain the area|cannot inspect the source/)
  assert.deepEqual(request, before)
  assert.deepEqual(raw, rawBefore)
}

export async function startHomeworkMeter(maxCNY: number) {
  assert.ok(Number.isFinite(maxCNY) && maxCNY > 0)
  let spentCNY = 0, reservedCNY = 0, failed = false
  const receipts: Receipt[] = []
  const server = createServer(async (request, response) => {
    let reservation = 0
    let reserved = false
    const role: Role = request.url?.startsWith('/judge/') ? 'JUDGE' : 'CANDIDATE'
    const id = randomUUID(), model = process.env[`EVAL_${role}_MODEL`]!
    try {
      assert.ok(request.method === 'POST' && /^\/(candidate|judge)\/v1\/chat\/completions$/.test(request.url ?? ''), 'Only bounded chat completions are permitted')
      assert.ok(!failed && receipts.length < 80, 'Live model budget is closed')
      const chunks: Buffer[] = []; let bytes = 0
      for await (const chunk of request) { bytes += chunk.length; assert.ok(bytes <= 2 * 1024 * 1024, 'Model request too large'); chunks.push(chunk) }
      const input = JSON.parse(Buffer.concat(chunks).toString()) as Record<string, unknown>
      assert.equal(input.model, model, 'Live request changed the configured model')
      const outputBound = Number(input.max_completion_tokens ?? input.max_tokens ?? 6000)
      assert.ok(Number.isInteger(outputBound) && outputBound > 0 && outputBound <= 16000, 'Model output budget must be explicit and bounded')
      if (!input.max_completion_tokens) input.max_tokens = outputBound
      if (input.stream) input.stream_options = { include_usage: true }
      const inputRate = Number(process.env[`EVAL_${role}_INPUT_CNY_PER_MILLION`]), outputRate = Number(process.env[`EVAL_${role}_OUTPUT_CNY_PER_MILLION`])
      // UTF-8 bytes plus protocol overhead is deliberately conservative; reserve before forwarding.
      reservation = cost(bytes + 8192, outputBound, inputRate, outputRate)
      assert.ok(spentCNY + reservedCNY + reservation <= maxCNY, 'Live model cost ceiling reached before request')
      reservedCNY += reservation
      reserved = true
      const upstream = await fetch(`${process.env[`EVAL_${role}_BASE_URL`]!.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env[`EVAL_${role}_API_KEY`]}` },
        body: JSON.stringify(input), signal: AbortSignal.timeout(240_000),
      })
      assert.ok(upstream.ok, `Model provider returned HTTP ${upstream.status}`)
      const body = await upstream.text()
      assert.ok(Buffer.byteLength(body) <= 4 * 1024 * 1024, 'Model response too large')
      const messages = input.stream ? body.split('\n').filter(line => line.startsWith('data: ') && !line.includes('[DONE]')).map(line => JSON.parse(line.slice(6))) : [JSON.parse(body)]
      const usage = messages.map(message => message.usage).reverse().find(Boolean) as { prompt_tokens: number; completion_tokens: number } | undefined
      assert.ok(usage && Number.isInteger(usage.prompt_tokens) && usage.prompt_tokens > 0 && Number.isInteger(usage.completion_tokens) && usage.completion_tokens > 0, 'Measured provider usage is required')
      const actual = cost(usage.prompt_tokens, usage.completion_tokens, inputRate, outputRate)
      assert.ok(actual <= reservation && spentCNY + actual <= maxCNY, 'Provider usage exceeded reserved cost')
      spentCNY += actual
      const contentReview = contentReviewDiagnostics(input, messages[0])
      const structuredRequest = structuredRequestShape(input)
      receipts.push({ id, role, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, costCNY: actual, status: 'measured', model,
        ...(contentReview ? { contentReview } : {}), ...(structuredRequest ? { structuredRequest } : {}) })
      response.writeHead(200, { 'content-type': upstream.headers.get('content-type') ?? 'application/json' }); response.end(body)
    } catch {
      failed = true
      receipts.push({ id, role, inputTokens: 0, outputTokens: 0, costCNY: 0, status: 'failed', model })
      response.writeHead(502, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'Live metering failed closed; inspect receipt status.' } }))
    } finally { if (reserved) reservedCNY -= reservation }
  })
  await new Promise<void>(resolve => server.listen(53194, '127.0.0.1', resolve))
  return {
    candidateBaseURL: 'http://127.0.0.1:53194/candidate/v1', judgeBaseURL: 'http://127.0.0.1:53194/judge/v1',
    snapshot: () => ({ maxCNY, spentCNY, failed, receipts: [...receipts] }),
    stop: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  }
}
