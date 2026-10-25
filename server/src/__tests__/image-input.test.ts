import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import type OpenAI from 'openai'
import { env } from '../env.js'
import { __setLlmClientOverrideForTesting } from '../llm.js'
import { __setLlmLedgerOverrideForTesting } from '../llm-ledger.js'
import { readImageInput } from '../agent-runtime/image-input.js'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64')
const oldModel = env.OPENAI_VISION_MODEL
after(() => { env.OPENAI_VISION_MODEL = oldModel; __setLlmClientOverrideForTesting(null); __setLlmLedgerOverrideForTesting(null) })

test('image reader sends original PNG bytes to the configured vision model and records usage without prompt data', async () => {
  env.OPENAI_VISION_MODEL = 'test-vision'
  let calls = 0, records = 0
  __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async (request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, options: OpenAI.RequestOptions) => {
    calls++
    assert.equal(Number.isInteger(options.timeout), true, 'the real SDK rejects fractional timeout values before provider I/O')
    assert.equal(request.model, 'test-vision')
    const content = request.messages[1]!.content
    assert.ok(Array.isArray(content))
    const image = content.find(part => part.type === 'image_url')
    assert.ok(image?.type === 'image_url')
    assert.equal(image.image_url.detail, 'high')
    assert.equal(image.image_url.url, 'data:image/png;base64,' + png.toString('base64'))
    assert.equal((request as unknown as { enable_thinking: boolean }).enable_thinking, false)
    return { choices: [{ message: { content: JSON.stringify({ status: 'readable', text: 'IP 192.168.1.74 / 26' }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20 } }
  } } } }) as unknown as OpenAI)
  __setLlmLedgerOverrideForTesting(async record => {
    records++; assert.equal(record.context.purpose, 'attachment.image_read'); assert.equal(record.status, 'succeeded')
    assert.equal(record.usage?.prompt_tokens, 100)
    assert.ok(!JSON.stringify(record.context).includes(png.toString('base64')))
  })
  const result = await readImageInput(png, 'image/png', { companyId: 'synthetic', conversationId: 'teacher-room' }, AbortSignal.timeout(1000))
  assert.match(result.text!, /IP 192\.168\.1\.74/)
  assert.match(result.text!, /model-derived/)
  assert.equal(calls, 1); assert.equal(records, 1)
})

test('no configured capability, unreadable image, and invalid output remain truthful unavailable results', async () => {
  __setLlmLedgerOverrideForTesting(async () => {})
  env.OPENAI_VISION_MODEL = ''
  __setLlmClientOverrideForTesting(() => { throw new Error('unconfigured model must not be called') })
  assert.equal((await readImageInput(png, 'image/png', { companyId: 'synthetic' }, AbortSignal.timeout(1000))).contentStatus, 'unsupported')
  env.OPENAI_VISION_MODEL = 'test-vision'
  for (const [content, status] of [[JSON.stringify({ status: 'unreadable', text: 'cannot read' }), 'empty'], ['invalid JSON', 'failed']] as const) {
    __setLlmClientOverrideForTesting(() => ({ chat: { completions: { create: async () => ({ choices: [{ message: { content }, finish_reason: 'stop' }] }) } } }) as unknown as OpenAI)
    const result = await readImageInput(png, 'image/png', { companyId: 'synthetic' }, AbortSignal.timeout(1000))
    assert.equal(result.contentStatus, status); assert.equal(result.text, undefined)
  }
})
