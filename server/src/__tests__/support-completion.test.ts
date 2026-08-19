import assert from 'node:assert/strict'
import test from 'node:test'
import type OpenAI from 'openai'
import { createSupportJson } from '../agents/support-completion.js'

test('support JSON uses Chat Completions compatibility endpoint', async () => {
  let captured: Record<string, unknown> | undefined
  const fake = {
    chat: {
      completions: {
        create: async (args: Record<string, unknown>) => {
          captured = args
          return {
            choices: [{ message: { content: '{"actionable":false}' } }],
            usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
          }
        },
      },
    },
  } as unknown as OpenAI

  const result = await createSupportJson(fake, {
    model: 'deepseek-v4-flash',
    instructions: 'Return JSON.',
    input: 'Classify this.',
    maxTokens: 100,
  })

  assert.equal(result.output_text, '{"actionable":false}')
  assert.equal(captured?.model, 'deepseek-v4-flash')
  assert.equal(captured?.response_format && (captured.response_format as { type?: string }).type, 'json_object')
  assert.deepEqual(captured?.messages, [
    { role: 'system', content: 'Return JSON.' },
    { role: 'user', content: 'Classify this.' },
  ])
})
