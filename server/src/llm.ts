import type OpenAI from 'openai'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { acquireCircuit, modelFailure, recoveryPolicy, type ModelFailure } from '@lyyzka/lingxios'
import { env } from './env.js'
import { createOpenAIClient } from './llm-client.js'
import { type LlmCallContext, type LlmUsage, recordLlmCall } from './llm-ledger.js'
import { siliconFlowCost, siliconFlowPricingForModel } from './agent-runtime/pricing.js'

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

async function persistTrackedCall(record: Parameters<typeof recordLlmCall>[0], callId: string): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await recordLlmCall(record, undefined, callId)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

async function abortable<T>(operation: Promise<T>,signal: AbortSignal): Promise<T> {
  let listener!: () => void
  const aborted = new Promise<never>((_,reject) => {
    listener = () => reject(signal.reason)
    if (signal.aborted) listener()
    else signal.addEventListener('abort',listener,{ once: true })
  })
  try { return await Promise.race([operation,aborted]) }
  finally { signal.removeEventListener('abort',listener) }
}

async function tracked<T>(
  context: LlmCallContext,
  model: string,
  operation: (client: OpenAI, options: OpenAI.RequestOptions) => Promise<T>,
  usageOf: (value: T) => LlmUsage | null = () => null,
  options: OpenAI.RequestOptions = {},
): Promise<T> {
  const pricing = siliconFlowPricingForModel(env.OPENAI_BASE_URL, model, env.NODE_ENV === 'production')
  const rates = model === env.OPENAI_MODEL ? [
    'AGENT_OS_INPUT_COST_MICROS_PER_MILLION', 'AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION',
  ].map(name => {
    const rate = Number(process.env[name]?.trim() || 0)
    if (!Number.isSafeInteger(rate) || rate < 0) throw new Error(`${name} must be a non-negative integer`)
    return rate
  }) : null
  const policy = recoveryPolicy({ maxAttempts: Math.min(3,(options.maxRetries ?? 2)+1),
    totalTimeoutMs: Math.min(options.timeout ?? 120_000,120_000) })
  const signal = AbortSignal.any([AbortSignal.timeout(policy.totalTimeoutMs),...(options.signal ? [options.signal] : [])])
  signal.throwIfAborted()
  const key = createHash('sha256').update(JSON.stringify([env.OPENAI_BASE_URL,model,env.OPENAI_API_KEY])).digest('hex')
  const settleCircuit = acquireCircuit(key,60_000), logicalCallId = `product-${randomUUID()}`, began = performance.now()
  let latestFailure: ModelFailure | undefined, issued = 0
  try {
    for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
      signal.throwIfAborted()
      const callId = `${logicalCallId}:${attempt}`, startedAt = performance.now()
      const requestOptions = { ...options,maxRetries: 0,signal,
        timeout: Math.max(1,Math.min(30_000,policy.totalTimeoutMs-(performance.now()-began))) }
      let value: T | undefined, failure: unknown, succeeded = false
      issued++
      try {
        value = await abortable(providerClient().then(client => operation(client,requestOptions)),signal)
        succeeded = true
      } catch (error) { failure = error }
      latestFailure = succeeded ? undefined : modelFailure(failure,options.signal?.aborted)
      const trackedContext = { ...context,extras: { ...context.extras,callId,logicalCallId,attempt,
        elapsedMs: performance.now()-began,...(latestFailure ? { failure: latestFailure } : {}) } }
      let usage = succeeded ? usageOf(value!) : null
      if (pricing && usage) {
        const validToken = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0
        if (!validToken(usage.prompt_tokens) || !validToken(usage.completion_tokens)) {
          usage = null
          Object.assign(trackedContext.extras, { invalidProviderUsage: true })
        } else {
          const cached = usage.prompt_tokens_details?.cached_tokens
          // Match the native driver: invalid cache counters are unavailable, not
          // a reason to lose the ledger record for an already issued paid call.
          usage = { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens,
            ...(validToken(cached) && cached <= usage.prompt_tokens ? { prompt_tokens_details: { cached_tokens: cached } } : {}) }
        }
      }
      const billing = pricing && usage ? siliconFlowCost({ available: true,
        inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0,
        cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
      }, pricing) : undefined
      if (billing) Object.assign(trackedContext.extras, { providerPricing: pricing, ...billing })
      // Persist each issued attempt before returning or retrying. The stable ID also
      // makes a lost ledger acknowledgement safe to retry without duplicate billing rows.
      await persistTrackedCall({ context: trackedContext,model,usage,latencyMs: performance.now()-startedAt,
        status: succeeded ? 'succeeded' : 'failed',
        ...(latestFailure ? { error: `Model request failed (${latestFailure.category})`,measured: false } : {}),
        ...(billing ? { costUsd: billing.costUsd, costEstimated: true } : rates && usage ? { costUsd: ((usage.prompt_tokens ?? 0)*rates[0]!+(usage.completion_tokens ?? 0)*rates[1]!)/1e12,
          costEstimated: true } : {}),
      },callId)
      if (succeeded) return value!
      if (!latestFailure?.retryable || signal.aborted || attempt >= policy.maxAttempts) throw failure
      const backoff = Math.max(latestFailure.retryAfterMs ?? 0,Math.floor(Math.random()*Math.min(2000,250*2**(attempt-1))))
      if (backoff >= policy.totalTimeoutMs-(performance.now()-began)) throw failure
      await delay(backoff,undefined,{ signal })
    }
    throw new Error('model recovery exhausted')
  } finally {
    settleCircuit(latestFailure,issued)
  }
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
    async (provider, requestOptions) => provider.chat.completions.create(providerRequest, requestOptions),
    (response) => response.usage ?? null,
    options,
  )
}

export async function createEmbedding(
  context: LlmCallContext,
  request: OpenAI.Embeddings.EmbeddingCreateParams,
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  return tracked(context, request.model, async (provider, options) => provider.embeddings.create(request,options), (response) => response.usage)
}

export async function createImage(
  context: LlmCallContext,
  request: OpenAI.Images.ImageGenerateParamsNonStreaming & { model: string },
): Promise<OpenAI.Images.ImagesResponse> {
  return tracked(context, request.model, async (provider, options) => provider.images.generate(request,options))
}

export function invalidateLlmClient(): void {
  client = null
}
