import OpenAI from 'openai'
import { instrumentOpenAIClient, lingxiLitObservabilityFetch } from './lingxilit-observability.js'

const SDK_MAX_RETRIES = 5
const SDK_TIMEOUT_MS = 5 * 60_000

export type OpenAIClientOptions = {
  apiKey: string
  baseURL?: string
  maxRetries?: number
  timeout?: number
}

/** The only module allowed to construct the provider SDK client. */
export function createOpenAIClient(options: OpenAIClientOptions): OpenAI {
  const observedFetch = lingxiLitObservabilityFetch()
  const client = new OpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    maxRetries: options.maxRetries ?? SDK_MAX_RETRIES,
    timeout: options.timeout ?? SDK_TIMEOUT_MS,
    ...(observedFetch ? { fetch: observedFetch } : {}),
  })
  return instrumentOpenAIClient(client)
}
