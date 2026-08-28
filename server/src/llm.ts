import type OpenAI from 'openai'
import { env } from './env.js'
import { createOpenAIClient } from './llm-client.js'
import { recordLlmCall, type LlmCallContext, type LlmUsage } from './llm-ledger.js'

let testOverride: (() => OpenAI | Promise<OpenAI>) | null = null
export function __setLlmClientOverrideForTesting(override: typeof testOverride): void {
  testOverride = override
}

let client: OpenAI | null = null
async function providerClient(): Promise<OpenAI> {
  if (testOverride) return testOverride()
  client ??= createOpenAIClient({ apiKey: env.OPENAI_API_KEY, baseURL: env.OPENAI_BASE_URL })
  return client
}

async function tracked<T>(
  context: LlmCallContext,
  model: string,
  operation: (client: OpenAI) => Promise<T>,
  usageOf: (value: T) => LlmUsage | null = () => null,
): Promise<T> {
  const startedAt = Date.now()
  try {
    const value = await operation(await providerClient())
    await recordLlmCall({ context, model, usage: usageOf(value), latencyMs: Date.now() - startedAt, status: 'succeeded' })
    return value
  } catch (error) {
    await recordLlmCall({ context, model, latencyMs: Date.now() - startedAt, status: 'failed', error, measured: false })
    throw error
  }
}

export async function createChatCompletion(
  context: LlmCallContext,
  request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options?: OpenAI.RequestOptions,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  return tracked(
    context,
    request.model,
    async (provider) => provider.chat.completions.create(request, options),
    (response) => response.usage ?? null,
  )
}

export async function createEmbedding(
  context: LlmCallContext,
  request: OpenAI.Embeddings.EmbeddingCreateParams,
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  return tracked(context, request.model, async (provider) => provider.embeddings.create(request), (response) => response.usage)
}

export async function createImage(
  context: LlmCallContext,
  request: OpenAI.Images.ImageGenerateParamsNonStreaming & { model: string },
): Promise<OpenAI.Images.ImagesResponse> {
  return tracked(context, request.model, async (provider) => provider.images.generate(request))
}

export function invalidateLlmClient(): void {
  client = null
}
