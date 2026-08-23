import type OpenAI from 'openai'

/**
 * Run a JSON-oriented support-model call through Chat Completions.
 *
 * Support/triage uses the same DeepSeek Chat Completions surface as every
 * other model call. There is intentionally no Responses API fallback.
 */
export async function createSupportJson(
  client: OpenAI,
  args: { model: string; instructions: string; input: string; maxTokens: number },
  options?: { maxRetries?: number; timeout?: number },
): Promise<{ output_text: string; usage: unknown }> {
  const response = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: 'system', content: args.instructions },
      { role: 'user', content: args.input },
    ],
    response_format: { type: 'json_object' },
    max_tokens: args.maxTokens,
  }, options)
  return {
    output_text: response.choices[0]?.message?.content ?? '',
    usage: response.usage,
  }
}
