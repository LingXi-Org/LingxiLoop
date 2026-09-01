import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from '@opentelemetry/api'
// LingxiLit currently retains the OpenLIT TypeScript SDK package and API name.
import { Openlit } from 'openlit'
import type OpenAI from 'openai'

const ATTEMPT_SPAN_NAME = 'lingxiloop.openai.http_attempt'
const MODEL_NAME_LIMIT = 256
const PRICING_FETCH_TIMEOUT_MS = 5_000

type ModelLimit = { rpm: number; tpm: number }
type PricingState = {
  limits: Map<string, ModelLimit>
  pricing: Record<string, unknown>
  pricedModels: Set<string>
}

type LogicalOperation = 'chat' | 'embeddings' | 'image'
type TokenUsage = {
  prompt_tokens?: number | null
  completion_tokens?: number | null
  prompt_tokens_details?: { cached_tokens?: number | null } | null
}

let initialized = false
let observedFetch: typeof fetch | undefined
let pricingState: PricingState | undefined

function serviceVersionAttributes(): Attributes {
  const version =
    process.env.OTEL_SERVICE_VERSION?.trim() || process.env.LINGXILOOP_VERSION?.trim()
  return version ? { 'service.version': version } : {}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function parsePricingState(value: unknown): PricingState {
  const pricing = asRecord(value)
  if (!pricing) throw new Error('pricing JSON must be an object')

  const pricedModels = new Set<string>()
  for (const sectionName of ['chat', 'embeddings', 'images', 'audio']) {
    const section = asRecord(pricing[sectionName])
    if (!section) continue
    for (const model of Object.keys(section)) pricedModels.add(model)
  }

  const limits = new Map<string, ModelLimit>()
  const providers = asRecord(pricing.limits)
  if (providers) {
    for (const [providerHost, rawModels] of Object.entries(providers)) {
      const models = asRecord(rawModels)
      if (!models) continue
      for (const [model, rawLimit] of Object.entries(models)) {
        const limit = asRecord(rawLimit)
        const rpm = limit?.rpm
        const tpm = limit?.tpm
        if (Number.isInteger(rpm) && Number(rpm) > 0 && Number.isInteger(tpm) && Number(tpm) > 0) {
          limits.set(`${providerHost.toLowerCase()}\n${model}`, {
            rpm: Number(rpm),
            tpm: Number(tpm),
          })
        }
      }
    }
  }

  return { limits, pricedModels, pricing }
}

function resolvePricingJson(): string | Record<string, Record<string, unknown>> | undefined {
  const raw = process.env.LINGXILIT_PRICING_JSON?.trim()
  if (!raw) return undefined
  if (!raw.startsWith('{')) {
    void loadRemotePricingState(raw)
    return raw
  }

  try {
    const value = JSON.parse(raw) as unknown
    pricingState = parsePricingState(value)
    return value as Record<string, Record<string, unknown>>
  } catch (error) {
    console.warn(
      '[lingxilit] invalid inline pricing JSON; cost and limit metadata may be unavailable:',
      error instanceof Error ? error.message : String(error),
    )
    return undefined
  }
}

async function loadRemotePricingState(url: string): Promise<void> {
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('pricing URL must use HTTP or HTTPS')
    }
    const response = await fetch(parsedUrl, {
      signal: AbortSignal.timeout(PRICING_FETCH_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`pricing request returned HTTP ${response.status}`)
    pricingState = parsePricingState(await response.json())
  } catch (error) {
    console.warn(
      '[lingxilit] pricing limits unavailable; model calls remain enabled:',
      error instanceof Error ? error.message : String(error),
    )
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL | undefined {
  try {
    if (typeof input === 'string') return new URL(input)
    if (input instanceof URL) return input
    return new URL(input.url)
  } catch {
    return undefined
  }
}

function requestModel(init: RequestInit | undefined): string | undefined {
  if (typeof init?.body !== 'string') return undefined
  try {
    const model = asRecord(JSON.parse(init.body) as unknown)?.model
    return typeof model === 'string' && model.length <= MODEL_NAME_LIMIT ? model : undefined
  } catch {
    return undefined
  }
}

function pricingAttributes(
  providerHost: string | undefined,
  model: string | undefined,
): Attributes {
  if (!pricingState || !model) return {}
  const attributes: Attributes = {
    'lingxiloop.pricing.available': pricingState.pricedModels.has(model),
  }
  const limit = providerHost
    ? pricingState.limits.get(`${providerHost.toLowerCase()}\n${model}`)
    : undefined
  attributes['lingxiloop.limit.configured'] = Boolean(limit)
  if (limit) {
    attributes['lingxiloop.limit.rpm'] = limit.rpm
    attributes['lingxiloop.limit.tpm'] = limit.tpm
  }
  return attributes
}

function nonNegativeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function modelPrice(section: string, model: string): unknown {
  return asRecord(pricingState?.pricing[section])?.[model]
}

function calculateCost(
  operation: LogicalOperation,
  model: string,
  usage?: TokenUsage | null,
  image?: { n?: number | null; quality?: string | null; size?: string | null },
): number | undefined {
  if (!pricingState?.pricedModels.has(model)) return undefined
  if (operation === 'embeddings') {
    const price = modelPrice('embeddings', model)
    return typeof price === 'number'
      ? (nonNegativeNumber(usage?.prompt_tokens) * price) / 1_000
      : undefined
  }
  if (operation === 'image') {
    const price = asRecord(modelPrice('images', model))
    const qualityPrices = asRecord(price?.[image?.quality || 'standard'])
    const unitPrice = qualityPrices?.[image?.size || '1024x1024']
    return typeof unitPrice === 'number' ? unitPrice * Math.max(1, image?.n ?? 1) : undefined
  }

  const price = asRecord(modelPrice('chat', model))
  if (!price) return undefined
  const inputTokens = nonNegativeNumber(usage?.prompt_tokens)
  const outputTokens = nonNegativeNumber(usage?.completion_tokens)
  const cachedTokens = Math.min(
    inputTokens,
    nonNegativeNumber(usage?.prompt_tokens_details?.cached_tokens),
  )
  const promptPrice = nonNegativeNumber(price.promptPrice)
  const completionPrice = nonNegativeNumber(price.completionPrice)
  const cacheReadPrice =
    typeof price.cacheReadPrice === 'number' ? nonNegativeNumber(price.cacheReadPrice) : promptPrice
  return (
    ((inputTokens - cachedTokens) * promptPrice +
      cachedTokens * cacheReadPrice +
      outputTokens * completionPrice) /
    1_000
  )
}

function startLogicalSpan(operation: LogicalOperation, model: string): Span | undefined {
  if (!observedFetch) return undefined
  const attributes: Attributes = {
    'gen_ai.operation.name': operation,
    'gen_ai.provider.name': 'openai-compatible',
    'gen_ai.request.model': model,
    ...serviceVersionAttributes(),
  }
  if (pricingState) {
    attributes['lingxiloop.pricing.available'] = pricingState.pricedModels.has(model)
  }
  return trace
    .getTracer('lingxiloop-openai-logical-calls')
    .startSpan(`${operation} ${model}`, { kind: SpanKind.CLIENT, attributes })
}

function finishLogicalSpan(
  span: Span | undefined,
  operation: LogicalOperation,
  model: string,
  usage?: TokenUsage | null,
  image?: { n?: number | null; quality?: string | null; size?: string | null },
  streaming?: { ttftSeconds?: number; tbtSeconds?: number },
): void {
  if (!span) return
  const inputTokens = nonNegativeNumber(usage?.prompt_tokens)
  const outputTokens = nonNegativeNumber(usage?.completion_tokens)
  const cachedTokens = nonNegativeNumber(usage?.prompt_tokens_details?.cached_tokens)
  span.setAttribute('gen_ai.usage.input_tokens', inputTokens)
  span.setAttribute('gen_ai.usage.output_tokens', outputTokens)
  if (cachedTokens) span.setAttribute('gen_ai.usage.cache_read.input_tokens', cachedTokens)
  const cost = calculateCost(operation, model, usage, image)
  if (cost !== undefined) span.setAttribute('gen_ai.usage.cost', cost)
  if (streaming?.ttftSeconds) {
    span.setAttribute('gen_ai.server.time_to_first_token', streaming.ttftSeconds)
  }
  if (streaming?.tbtSeconds) {
    span.setAttribute('gen_ai.server.time_per_output_token', streaming.tbtSeconds)
  }
  span.setStatus({ code: SpanStatusCode.OK })
  span.end()
}

function failLogicalSpan(span: Span | undefined, error: unknown): void {
  if (!span) return
  const status = asRecord(error)?.status
  if (typeof status === 'number') span.setAttribute('http.response.status_code', status)
  span.setAttribute('error.type', error instanceof Error ? error.name : 'UnknownError')
  span.setStatus({ code: SpanStatusCode.ERROR })
  span.end()
}

function withLogicalContext<T>(span: Span | undefined, operation: () => T): T {
  return span
    ? context.with(trace.setSpan(context.active(), span), operation)
    : operation()
}

function observeChatStream(
  stream: AsyncIterable<unknown>,
  span: Span | undefined,
  model: string,
  startedAt: number,
): void {
  if (!span) return
  const originalIterator = stream[Symbol.asyncIterator].bind(stream)
  let consumed = false
  const observed = async function* () {
    if (consumed) throw new Error('observed model stream can only be consumed once')
    consumed = true
    let usage: TokenUsage | undefined
    const timestamps: number[] = []
    let ended = false
    const iterator = originalIterator()
    try {
      while (true) {
        const next = await iterator.next()
        if (next.done) break
        const chunk = next.value
        timestamps.push(Date.now())
        const chunkUsage = asRecord(chunk)?.usage
        if (chunkUsage) usage = chunkUsage as TokenUsage
        yield chunk
      }
      const intervals = timestamps.slice(1).map((timestamp, index) => timestamp - timestamps[index])
      finishLogicalSpan(span, 'chat', model, usage, undefined, {
        ttftSeconds: timestamps[0] ? (timestamps[0] - startedAt) / 1_000 : undefined,
        tbtSeconds: intervals.length
          ? intervals.reduce((total, interval) => total + interval, 0) / intervals.length / 1_000
          : undefined,
      })
      ended = true
    } catch (error) {
      failLogicalSpan(span, error)
      ended = true
      throw error
    } finally {
      await iterator.return?.()
      if (!ended) finishLogicalSpan(span, 'chat', model, usage)
    }
  }
  Object.defineProperty(stream, Symbol.asyncIterator, {
    configurable: true,
    value: () => observed()[Symbol.asyncIterator](),
  })
}

function createObservedFetch(): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input)
    const providerHost = url?.host.toLowerCase()
    const model = requestModel(init)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const attributes: Attributes = {
      'http.request.method': method,
      ...serviceVersionAttributes(),
      ...pricingAttributes(providerHost, model),
    }
    if (providerHost) {
      attributes['server.address'] = url?.hostname
      attributes['server.port'] = url?.port ? Number(url.port) : undefined
      attributes['url.path'] = url?.pathname
      attributes['lingxiloop.provider.host'] = providerHost
    }
    if (model) attributes['gen_ai.request.model'] = model

    return trace
      .getTracer('lingxiloop-openai-attempts')
      .startActiveSpan(ATTEMPT_SPAN_NAME, { kind: SpanKind.CLIENT, attributes }, async (span) => {
        try {
          const response = await fetch(input, init)
          span.setAttribute('http.response.status_code', response.status)
          if (!response.ok) {
            span.setAttribute(
              'error.type',
              response.status === 429 ? 'rate_limited' : `http_${response.status}`,
            )
            span.setStatus({ code: SpanStatusCode.ERROR })
          }
          return response
        } catch (error) {
          const errorType = error instanceof Error ? error.name : 'UnknownError'
          span.setAttribute('error.type', errorType)
          span.setStatus({ code: SpanStatusCode.ERROR })
          throw error
        } finally {
          span.end()
        }
      })
  }
}

/** Adds privacy-safe logical spans without exporting prompts, responses, tools, or arguments. */
export function instrumentOpenAIClient(client: OpenAI): OpenAI {
  if (!observedFetch) return client

  const chatCreate = client.chat.completions.create.bind(client.chat.completions)
  client.chat.completions.create = ((...args: any[]) => {
    const request = asRecord(args[0]) ?? {}
    const model = typeof request.model === 'string' ? request.model : 'unknown'
    const startedAt = Date.now()
    const span = startLogicalSpan('chat', model)
    try {
      const requestPromise = withLogicalContext(span, () => chatCreate(...(args as [any, any])))
      void requestPromise.then(
        (response) => {
          const streamResponse = response as unknown as AsyncIterable<unknown>
          if (
            request.stream &&
            response &&
            typeof streamResponse[Symbol.asyncIterator] === 'function'
          ) {
            observeChatStream(streamResponse, span, model, startedAt)
          } else {
            finishLogicalSpan(
              span,
              'chat',
              model,
              asRecord(response)?.usage as TokenUsage | undefined,
            )
          }
        },
        (error) => failLogicalSpan(span, error),
      )
      return requestPromise
    } catch (error) {
      failLogicalSpan(span, error)
      throw error
    }
  }) as typeof client.chat.completions.create

  const embeddingCreate = client.embeddings.create.bind(client.embeddings)
  client.embeddings.create = ((...args: any[]) => {
    const request = asRecord(args[0]) ?? {}
    const model = typeof request.model === 'string' ? request.model : 'unknown'
    const span = startLogicalSpan('embeddings', model)
    try {
      const requestPromise = withLogicalContext(span, () =>
        embeddingCreate(...(args as [any, any])),
      )
      void requestPromise.then(
        (response) =>
          finishLogicalSpan(
            span,
            'embeddings',
            model,
            asRecord(response)?.usage as TokenUsage | undefined,
          ),
        (error) => failLogicalSpan(span, error),
      )
      return requestPromise
    } catch (error) {
      failLogicalSpan(span, error)
      throw error
    }
  }) as typeof client.embeddings.create

  const imageGenerate = client.images.generate.bind(client.images)
  client.images.generate = ((...args: any[]) => {
    const request = asRecord(args[0]) ?? {}
    const model = typeof request.model === 'string' ? request.model : 'unknown'
    const span = startLogicalSpan('image', model)
    try {
      const requestPromise = withLogicalContext(span, () =>
        imageGenerate(...(args as [any, any])),
      )
      void requestPromise.then(
        () =>
          finishLogicalSpan(span, 'image', model, null, {
            n: typeof request.n === 'number' ? request.n : undefined,
            quality: typeof request.quality === 'string' ? request.quality : undefined,
            size: typeof request.size === 'string' ? request.size : undefined,
          }),
        (error) => failLogicalSpan(span, error),
      )
      return requestPromise
    } catch (error) {
      failLogicalSpan(span, error)
      throw error
    }
  }) as typeof client.images.generate

  return client
}

/** Enables fail-open LingxiLit telemetry for the shared OpenAI-compatible client. */
export function lingxiLitObservabilityFetch(): typeof fetch | undefined {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) return undefined
  if (initialized) return observedFetch
  initialized = true

  try {
    const serviceVersion =
      process.env.OTEL_SERVICE_VERSION?.trim() || process.env.LINGXILOOP_VERSION?.trim()
    Openlit.init({
      applicationName: process.env.OTEL_SERVICE_NAME?.trim() || 'lingxiloop',
      environment:
        process.env.OTEL_DEPLOYMENT_ENVIRONMENT?.trim() || process.env.NODE_ENV || 'development',
      captureMessageContent: false,
      customSpanAttributes: serviceVersion ? { 'service.version': serviceVersion } : undefined,
      disableEvents: true,
      instrumentations: {},
      pricingJson: resolvePricingJson(),
    })
    observedFetch = createObservedFetch()
  } catch (error) {
    console.warn(
      '[lingxilit] initialization failed; model calls remain enabled:',
      error instanceof Error ? error.message : String(error),
    )
  }
  return observedFetch
}
