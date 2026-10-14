import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { contentReviewDiagnostics, structuredRequestShape } from './content-review-diagnostics.js'
import { homeworkJudgmentDiagnostics } from './homework-judgment-diagnostics.js'

type Role = 'CANDIDATE' | 'JUDGE'
type Receipt = { id: string; role: Role; inputTokens: number; outputTokens: number; costCNY: number; status: 'measured' | 'failed'; model: string;
  contentReview?: NonNullable<ReturnType<typeof contentReviewDiagnostics>>; structuredRequest?: NonNullable<ReturnType<typeof structuredRequestShape>>;
  homeworkJudgment?: NonNullable<ReturnType<typeof homeworkJudgmentDiagnostics>> }
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
  const inspect = (value: unknown) => {
    const result = contentReviewDiagnostics(request, response(value))!
    assert.ok(result.contract === 'lingxios-3.4.2-content-review')
    return result
  }
  assert.equal(inspect(valid).matchesInstalledContract, true)
  assert.equal(inspect({ ...valid, limitations: [{ quote: 'Paraphrased explanation', requestQuote: null, reason: 'Not a current request gap' }] }).limitations.accepted, true)
  assert.equal(inspect({ ...valid, limitations: [{ quote: 'Paraphrased explanation', requestQuote: 'explain the area', reason: 'A current request gap' }] }).limitations.accepted, false)
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

// Failure inventory: deferral is confused with the first review; unknown/duplicate IDs pass;
// agent, body-only or invented quotes pass as human instructions; wrong shapes, empty/oversized
// fields, extra keys or more than 32 entries pass; quote matching normalizes text;
// diagnostics leak private text/IDs or mutate wire data.
{
  const input = { workId: 'PRIVATE_WORK_ID_SENTINEL', originalText: 'PRIVATE_REQUEST_SENTINEL defer publication',
    revisions: [{ text: 'PRIVATE_HUMAN_SENTINEL wait for review', author: { kind: 'human' } },
      { text: 'PRIVATE_AGENT_SENTINEL wait for permission', author: { kind: 'agent' } }],
    body: 'PRIVATE_BODY_SENTINEL draft is ready', findings: [
      { id: 'missing:0', quote: 'PRIVATE_FINDING_SENTINEL', reason: 'PRIVATE_FINDING_REASON_SENTINEL' },
      { id: 'limitation:0', quote: 'draft is ready', reason: 'PRIVATE_LIMITATION_REASON_SENTINEL', requestQuote: null },
    ] }
  const requestFor = (value: unknown) => ({ response_format: { type: 'json_object' }, messages: [{ role: 'user', content: JSON.stringify(value) }] })
  const request = requestFor(input)
  const response = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] })
  const valid = { deferred: [{ id: 'missing:0', quote: 'defer publication', reason: 'PRIVATE_REASON_SENTINEL' },
    { id: 'limitation:0', quote: 'wait for review', reason: 'PRIVATE_SECOND_REASON_SENTINEL' }] }
  const inspect = (value: unknown, source = request) => {
    const result = contentReviewDiagnostics(source, response(value))!
    assert.ok(result.contract === 'lingxios-3.3.11-content-review-deferral', 'Deferral must have its own diagnostic contract')
    return result
  }
  const accepted = inspect(valid)
  assert.equal(accepted.matchesInstalledContract, true)
  assert.equal('missing' in accepted || 'limitations' in accepted, false)
  assert.equal(inspect({ deferred: [] }).matchesInstalledContract, true)
  const shape = structuredRequestShape(request)!
  assert.deepEqual(shape.messages[0].fields.findings, { present: true, type: 'array', count: 2 })
  for (const deferred of [undefined, null, {}, 'PRIVATE_WRONG_SHAPE_SENTINEL', [null],
    [{ ...valid.deferred[0], id: 'PRIVATE_UNKNOWN_ID_SENTINEL' }], [valid.deferred[0], valid.deferred[0]],
    [{ ...valid.deferred[0], id: null }], [{ ...valid.deferred[0], quote: 'PRIVATE_AGENT_SENTINEL' }],
    [{ ...valid.deferred[0], quote: 'PRIVATE_BODY_SENTINEL' }], [{ ...valid.deferred[0], quote: 'PRIVATE_FORGED_QUOTE_SENTINEL' }],
    [{ ...valid.deferred[0], quote: ' defer publication ' }],
    [{ ...valid.deferred[0], quote: '' }], [{ ...valid.deferred[0], quote: null }],
    [{ ...valid.deferred[0], reason: ' ' }], [{ ...valid.deferred[0], reason: null }],
    [{ ...valid.deferred[0], reason: 'x'.repeat(2001) }]]) {
    assert.equal(inspect({ deferred }).matchesInstalledContract, false)
  }
  const boundInput = { ...input, originalText: 'x'.repeat(2001), findings: Array.from({ length: 33 }, (_, index) => ({ id: `missing:${index}` })) }
  const boundRequest = requestFor(boundInput)
  const boundItems = boundInput.findings.map(item => ({ id: item.id, quote: 'x'.repeat(2000), reason: 'x'.repeat(2000) }))
  assert.equal(inspect({ deferred: boundItems.slice(0, 32) }, boundRequest).matchesInstalledContract, true)
  assert.equal(inspect({ deferred: boundItems }, boundRequest).matchesInstalledContract, false)
  assert.equal(inspect({ deferred: [{ ...boundItems[0], quote: boundInput.originalText }] }, boundRequest).matchesInstalledContract, false)
  assert.equal(inspect({ deferred: [{ ...valid.deferred[0], quote: ' ' }] }, requestFor({ ...input, originalText: ' ' })).matchesInstalledContract, false)
  assert.equal(inspect(valid, requestFor({ ...input, revisions: [{ text: input.revisions[0].text }] })).matchesInstalledContract, true)
  assert.equal(inspect({ ...valid, PRIVATE_UNKNOWN_KEY_SENTINEL: 'PRIVATE_UNKNOWN_VALUE_SENTINEL' }).matchesInstalledContract, false)
  assert.equal(inspect({ deferred: [{ ...valid.deferred[0], PRIVATE_NESTED_KEY_SENTINEL: 'PRIVATE_NESTED_VALUE_SENTINEL' }] }).matchesInstalledContract, false)
  const raw = response({ ...valid, PRIVATE_UNKNOWN_KEY_SENTINEL: 'PRIVATE_UNKNOWN_VALUE_SENTINEL',
    deferred: [{ ...valid.deferred[0], PRIVATE_NESTED_KEY_SENTINEL: 'PRIVATE_NESTED_VALUE_SENTINEL' }] })
  const before = structuredClone(request), rawBefore = structuredClone(raw), observed = contentReviewDiagnostics(request, raw)!
  const malformed = contentReviewDiagnostics(request, { choices: [{ message: { content: 'PRIVATE_INVALID_JSON_SENTINEL' } }] })!
  assert.equal(malformed.matchesInstalledContract, false)
  assert.doesNotMatch(JSON.stringify([accepted, observed, malformed, shape, inspect({ deferred: [{ ...valid.deferred[0], id: 'PRIVATE_UNKNOWN_ID_SENTINEL' }] })]),
    /PRIVATE_\w+_SENTINEL|defer publication|wait for review|missing:0|limitation:0/)
  assert.deepEqual(request, before)
  assert.deepEqual(raw, rawBefore)
}

// Failure inventory: optional context prevents recognition; schema errors leak arbitrary keys;
// missing/duplicate criteria, forged IDs/quotes, assistant quotes or unsupported mastery pass;
// report/assessment are confused; malformed/truncated responses pass; observation mutates wire data.
{
  const input = { homework: { criteria: ['PRIVATE_CRITERION_SENTINEL'] }, messages: [
    { messageId: 'PRIVATE_USER_ID_SENTINEL', role: 'user', text: 'PRIVATE_USER_TEXT_SENTINEL demonstrates this result' },
    { messageId: 'PRIVATE_AGENT_ID_SENTINEL', role: 'assistant', text: 'PRIVATE_AGENT_TEXT_SENTINEL supplies a result' },
  ] }
  const request = { response_format: { type: 'json_object' }, messages: [{ role: 'user', content: JSON.stringify(input) }] }
  const valid = { criteria: [{ criterion: input.homework.criteria[0], met: true, independent: true, feedback: 'PRIVATE_FEEDBACK_SENTINEL' }],
    completion: 'PRIVATE_COMPLETION_SENTINEL', assistance: '', independence: '', weaknesses: [],
    evidence: [{ messageId: '  PRIVATE_USER_ID_SENTINEL  ', excerpt: 'PRIVATE_USER_TEXT_SENTINEL' }] }
  const response = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] })
  const inspect = (value: unknown) => {
    const result = homeworkJudgmentDiagnostics(request, response(value))
    assert.ok(result, 'Canonical homework judgment requests must produce safe diagnostics')
    return result
  }
  const accepted = inspect(valid)
  const privateMaterial = 'PRIVATE_MATERIAL_TEXT_SENTINEL'
  const materialSha = createHash('sha256').update(privateMaterial).digest('hex')
  const materialInput = { ...input, messages: [{ ...input.messages[0], materials: [{
    source: 'PRIVATE_MATERIAL_SOURCE_SENTINEL', hash: `sha256:${materialSha}`, text: privateMaterial,
  }] }] }
  const materialRequest = { ...request, messages: [{ role: 'user', content: JSON.stringify(materialInput) }] }
  const materialBefore = structuredClone(materialRequest)
  const materialProof = homeworkJudgmentDiagnostics(materialRequest, response(valid))!
  assert.deepEqual(materialProof.materials, [{ declaredHash: `sha256:${materialSha}`, textSha256: materialSha, textChars: privateMaterial.length }])
  assert.doesNotMatch(JSON.stringify(materialProof), /PRIVATE_\w+_SENTINEL/)
  assert.deepEqual(materialRequest, materialBefore)
  assert.deepEqual([accepted.schemaValid, accepted.criteriaMatch, accepted.matchesHostValidation, accepted.hasAnswer], [true, true, true, false])
  assert.deepEqual(accepted.evidence.map(item => [item.sourceFound, item.userRole, item.exactSubstring]), [[true, true, true]])
  assert.equal(homeworkJudgmentDiagnostics({ ...request, messages: [{ role: 'user', content: JSON.stringify({ ...input, answer: {} }) }] }, response(valid))!.hasAnswer, true)
  assert.equal(inspect({ ...valid, criteria: [] }).criteriaMatch, false)
  assert.equal(inspect({ ...valid, criteria: [valid.criteria[0], valid.criteria[0]] }).criteriaMatch, false)
  const forgedId = inspect({ ...valid, evidence: [{ ...valid.evidence[0], messageId: 'PRIVATE_FORGED_ID_SENTINEL' }] })
  assert.deepEqual([forgedId.matchesHostValidation, forgedId.evidence[0].sourceFound], [false, false])
  const forgedQuote = inspect({ ...valid, evidence: [{ ...valid.evidence[0], excerpt: 'PRIVATE_FORGED_QUOTE_SENTINEL' }] })
  assert.deepEqual([forgedQuote.matchesHostValidation, forgedQuote.evidence[0].exactSubstring], [false, false])
  const assistant = inspect({ ...valid, evidence: [{ messageId: input.messages[1].messageId, excerpt: input.messages[1].text }] })
  assert.deepEqual([assistant.matchesHostValidation, assistant.evidence[0].sourceFound, assistant.evidence[0].userRole], [false, true, false])
  assert.equal(inspect({ ...valid, evidence: [] }).metWithoutEvidence, true)
  assert.equal(inspect({ ...valid, criteria: [{ ...valid.criteria[0], met: false, independent: true }], evidence: [] }).matchesHostValidation, false)
  assert.equal(inspect({ ...valid, criteria: [{ ...valid.criteria[0], met: false, independent: false }], evidence: [] }).matchesHostValidation, true)
  assert.equal(inspect({ ...valid, criteria: [{ ...valid.criteria[0], met: 'PRIVATE_INVALID_TYPE_SENTINEL' }] }).schemaValid, false)
  const raw = response({ ...valid, PRIVATE_UNKNOWN_KEY_SENTINEL: 'PRIVATE_UNKNOWN_VALUE_SENTINEL',
    criteria: [{ ...valid.criteria[0], PRIVATE_NESTED_KEY_SENTINEL: 'PRIVATE_NESTED_VALUE_SENTINEL' }] })
  const before = structuredClone(request), rawBefore = structuredClone(raw)
  const observed = homeworkJudgmentDiagnostics(request, raw)!
  assert.equal(observed.schemaValid, false)
  assert.doesNotMatch(JSON.stringify([accepted, observed, forgedId, forgedQuote, assistant]), /PRIVATE_\w+_SENTINEL/)
  assert.deepEqual(request, before)
  assert.deepEqual(raw, rawBefore)
  assert.equal(homeworkJudgmentDiagnostics(request, { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(valid) } }] })!.matchesHostValidation, false)
  assert.equal(homeworkJudgmentDiagnostics(request, { choices: [{ message: { content: 'PRIVATE_INVALID_JSON_SENTINEL' } }] })!.schemaValid, false)
  assert.equal(homeworkJudgmentDiagnostics({ ...request, stream: true }, response(valid)), undefined)
  assert.equal(homeworkJudgmentDiagnostics({ ...request, response_format: { type: 'text' } }, response(valid)), undefined)
  assert.equal(homeworkJudgmentDiagnostics({ ...request, messages: [{ role: 'user', content: JSON.stringify({ homework: input.homework, messages: [{ role: 'user' }] }) }] }, response(valid)), undefined)
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
      const homeworkJudgment = homeworkJudgmentDiagnostics(input, messages[0])
      receipts.push({ id, role, inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens, costCNY: actual, status: 'measured', model,
        ...(contentReview ? { contentReview } : {}), ...(structuredRequest ? { structuredRequest } : {}), ...(homeworkJudgment ? { homeworkJudgment } : {}) })
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
