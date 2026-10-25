import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { env } from '../env.js'
import { readImageInput } from '../agent-runtime/image-input.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { createOpenAIClient } from '../llm-client.js'

// Explicit opt-in: one paid provider request, synthetic image only. Standard CI
// exercises the deterministic request/authorization/retry cases in the sibling test.
test('configured live vision provider reads numbers present only in the synthetic PNG', {
  skip: process.env.LINGXILOOP_LIVE_VISION !== '1', timeout: 30_000,
}, async () => {
  assert.ok(env.OPENAI_VISION_MODEL, 'configure the visual model explicitly')
  const png = await readFile(new URL('../__tests__/fixtures/teacher-image-465/network.png', import.meta.url))
  const records: { model: string; status: string; inputTokens: number; outputTokens: number; costUsd: number }[] = []
  let transportFailure: { name?: string; status?: number; code?: string; causeCode?: string } | undefined
  const client = createOpenAIClient({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })
  const create = client.chat.completions.create.bind(client.chat.completions)
  client.chat.completions.create = (async (...args: Parameters<typeof create>) => {
    try { return await create(...args) }
    catch (error) {
      const failure = error as { name?: string; status?: number; code?: string; cause?: { code?: string } }
      transportFailure = { name: failure.name, status: failure.status, code: failure.code, causeCode: failure.cause?.code }
      throw error
    }
  }) as typeof create
  __setLlmClientOverrideForTesting(() => client)
  __setLlmLedgerOverrideForTesting(async record => {
    records.push({ model: record.model, status: record.status, inputTokens: record.usage?.prompt_tokens ?? 0,
      outputTokens: record.usage?.completion_tokens ?? 0, costUsd: record.costUsd ?? 0 })
  })
  try {
    const result = await readImageInput(png, 'image/png', { companyId: 'synthetic-live-465' }, AbortSignal.timeout(25_000))
    const readExpectedAddress = result.text?.includes('192.168.7.83') === true
    const readExpectedPrefix = result.text?.includes('/26') === true
    await mkdir('artifacts/issue-465', { recursive: true })
    await writeFile('artifacts/issue-465/live-vision.json', JSON.stringify({ provider: new URL(env.OPENAI_BASE_URL).hostname,
      model: env.OPENAI_VISION_MODEL, originalImageSha256: createHash('sha256').update(png).digest('hex'),
      contentStatus: result.contentStatus ?? 'readable', readExpectedAddress, readExpectedPrefix, records, transportFailure,
      syntheticOnly: true, productionIncidentRootCauseVerified: false }, null, 2) + '\n')
    assert.equal(result.contentStatus, undefined)
    assert.equal(readExpectedAddress, true, 'the image-only address must be transcribed')
    assert.equal(readExpectedPrefix, true, 'the image-only prefix must be transcribed')
    assert.equal(records.length, 1)
    assert.ok(records[0]!.inputTokens > 0 && records[0]!.outputTokens > 0 && records[0]!.costUsd > 0)
  } finally { __setLlmLedgerOverrideForTesting(null); __setLlmClientOverrideForTesting(null) }
})
