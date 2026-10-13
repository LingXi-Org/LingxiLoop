import type OpenAI from 'openai'
import { env } from './env.js'
import { createOpenAIClient } from './llm-client.js'
import { type LlmCallContext, type LlmUsage, recordLlmCall } from './llm-ledger.js'

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

async function persistTrackedCall(record: Parameters<typeof recordLlmCall>[0]): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await recordLlmCall(record)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function tracked<T>(
  context: LlmCallContext,
  model: string,
  operation: (client: OpenAI) => Promise<T>,
  usageOf: (value: T) => LlmUsage | null = () => null,
): Promise<T> {
  const rates = model === env.OPENAI_MODEL ? [
    'AGENT_OS_INPUT_COST_MICROS_PER_MILLION', 'AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION',
  ].map(name => {
    const rate = Number(process.env[name]?.trim() || 0)
    if (!Number.isSafeInteger(rate) || rate < 0) throw new Error(`${name} must be a non-negative integer`)
    return rate
  }) : null
  const startedAt = Date.now()
  let value: T
  try {
    value = await operation(await providerClient())
  } catch (error) {
    await persistTrackedCall({
      context, model, latencyMs: Date.now() - startedAt, status: 'failed', error, measured: false,
    })
    throw error
  }
  const usage = usageOf(value)
  await persistTrackedCall({
    context, model, usage, latencyMs: Date.now() - startedAt, status: 'succeeded',
    ...(rates && usage ? {
      costUsd: ((usage.prompt_tokens ?? 0) * rates[0]! + (usage.completion_tokens ?? 0) * rates[1]!) / 1e12,
      costEstimated: true,
    } : {}),
  })
  return value
}

export async function createChatCompletion(
  context: LlmCallContext,
  request: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  options?: OpenAI.RequestOptions,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const providerRequest = { ...request, reasoning_effort: undefined, thinking_budget: undefined, enable_thinking: false, thinking: { type: 'disabled' } }
  return tracked(
    context,
    request.model,
    async (provider) => provider.chat.completions.create(providerRequest, options),
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
