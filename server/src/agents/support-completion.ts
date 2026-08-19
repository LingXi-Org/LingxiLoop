import type OpenAI from 'openai'

/**
 * Run a JSON-oriented support-model call through Chat Completions.
 *
 * Support/triage must stay on the common OpenAI-compatible surface: providers
 * such as DeepSeek expose /chat/completions but not the Responses API. Main
 * agent turns keep their richer Responses streaming/tool loop separately.
 */
export async function createSupportJson(
  client: OpenAI,
  args: { model: string; instructions: string; input: string; maxTokens: number },
  options?: { maxRetries?: number; timeout?: number },
): Promise<{ output_text: string; usage: unknown }> {
  // A few in-process/test clients implement only the historical Responses
  // shape. Keep that compatibility without selecting it for real SDK clients.
  const chatCreate = client.chat?.completions?.create
  if (typeof chatCreate !== 'function') {
    const response = await client.responses.create({
      model: args.model,
      instructions: args.instructions,
      input: args.input,
      text: { format: { type: 'json_object' } },
      max_output_tokens: args.maxTokens,
    }, options)
    return { output_text: response.output_text, usage: response.usage }
  }
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
