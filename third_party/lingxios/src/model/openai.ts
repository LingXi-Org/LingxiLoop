/**
 * OpenAI-compatible chat-completions driver.
 *
 * Dependency-free: uses global `fetch` and hand-rolled SSE parsing so the
 * worker image carries no SDK. Works against any endpoint implementing the
 * chat-completions wire format (OpenAI, Azure, vLLM, LiteLLM, …).
 *
 * Protocol discipline enforced here, not in the runtime:
 * - exactly one tool (`ipython`) is advertised; parallel tool calls disabled;
 * - a turn that returns neither text nor a tool call is a driver error with
 *   diagnostics the runtime can use for a bounded protocol-correction retry.
 */
import { IPYTHON_TOOL_NAME } from '../protocol/constants.js'
import type { ModelItem } from '../protocol/types.js'
import { ModelDriverError } from '../errors.js'
import type {
  CompactionRequest, CompactionResult,
  ModelDriver, ModelTurnRequest, ModelTurnResult, ModelUsage,
  StructuredCallRequest, StructuredCallResult,
} from './driver.js'

export interface OpenAIDriverOptions {
  apiKey: string
  baseUrl?: string
  /** Max attempts per request across retryable failures (429/5xx/network). */
  maxAttempts?: number
  /** Base backoff in ms; grows exponentially with full jitter. */
  retryBaseMs?: number
  /** Per-request timeout in ms (wall clock, including streaming). */
  requestTimeoutMs?: number
  fetchImpl?: typeof fetch
  /** Injectable sleep for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

const IPYTHON_TOOL = {
  type: 'function',
  function: {
    name: IPYTHON_TOOL_NAME,
    description:
      'Execute Python in this session\'s persistent sandboxed kernel. Product capabilities are '
      + 'available as host.<namespace>.<method>(keyword=value, ...). Strict JSON arguments with '
      + 'exactly one non-empty "code" string.',
    parameters: {
      type: 'object',
      properties: { code: { type: 'string', description: 'Python source to execute.' } },
      required: ['code'],
      additionalProperties: false,
    },
  },
} as const

interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

function toWireMessages(instructions: string, items: readonly ModelItem[]): WireMessage[] {
  const messages: WireMessage[] = [{ role: 'system', content: instructions }]
  for (const item of items) {
    if ('role' in item) {
      messages.push({ role: item.role, content: item.content })
      continue
    }
    if (item.type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{ id: item.callId, type: 'function', function: { name: item.name, arguments: item.arguments } }],
      })
      continue
    }
    messages.push({ role: 'tool', tool_call_id: item.callId, content: item.output })
  }
  return messages
}

interface StreamAccumulator {
  text: string
  toolCalls: Map<number, { id: string; name: string; arguments: string }>
  finishReasons: string[]
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveSleep, rejectSleep) => {
    const timer = setTimeout(() => { cleanup(); resolveSleep() }, ms)
    const onAbort = () => { cleanup(); rejectSleep(signal?.reason instanceof Error ? signal.reason : new Error('aborted')) }
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort) }
    if (signal?.aborted) { onAbort(); return }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Parse `text/event-stream` bodies into `data:` payload strings. */
export async function* sseDataEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  let buffer = ''
  const reader = body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary: number
      // An SSE event ends at a blank line; tolerate \r\n line endings.
      while ((boundary = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const rawEvent = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + (buffer[boundary] === '\r' ? 4 : 2))
        const data = rawEvent
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).replace(/^ /, ''))
          .join('\n')
        if (data) yield data
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export class OpenAIChatDriver implements ModelDriver {
  private readonly baseUrl: string
  private readonly maxAttempts: number
  private readonly retryBaseMs: number
  private readonly requestTimeoutMs: number
  private readonly fetchImpl: typeof fetch
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>

  constructor(readonly modelId: string, private readonly options: OpenAIDriverOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
    this.maxAttempts = options.maxAttempts ?? 3
    this.retryBaseMs = options.retryBaseMs ?? 500
    this.requestTimeoutMs = options.requestTimeoutMs ?? 300_000
    this.fetchImpl = options.fetchImpl ?? fetch
    this.sleep = options.sleep ?? defaultSleep
  }

  private async request(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      signal?.throwIfAborted()
      const timeout = AbortSignal.timeout(this.requestTimeoutMs)
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
      let response: Response
      try {
        response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: combined,
        })
      } catch (error) {
        signal?.throwIfAborted()
        lastError = error
        if (attempt === this.maxAttempts) break
        await this.sleep(this.backoffMs(attempt), signal)
        continue
      }
      if (response.ok) return response
      const status = response.status
      const detail = (await response.text().catch(() => '')).slice(0, 2_000)
      if ((status === 429 || status >= 500) && attempt < this.maxAttempts) {
        const retryAfter = Number(response.headers.get('retry-after'))
        const delay = Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter * 1_000, 30_000)
          : this.backoffMs(attempt)
        await this.sleep(delay, signal)
        lastError = new ModelDriverError(`model provider returned ${status}: ${detail}`, { status, finishReasons: [], attempts: attempt })
        continue
      }
      throw new ModelDriverError(`model provider returned ${status}: ${detail}`, { status, finishReasons: [], attempts: attempt })
    }
    throw new ModelDriverError(
      `model request failed after ${this.maxAttempts} attempts`,
      { finishReasons: [], attempts: this.maxAttempts },
      { cause: lastError },
    )
  }

  private backoffMs(attempt: number): number {
    const cap = Math.min(this.retryBaseMs * 2 ** (attempt - 1), 20_000)
    return Math.floor(Math.random() * cap)
  }

  private async consumeStream(response: Response, onTextDelta?: (delta: string) => void): Promise<StreamAccumulator> {
    if (!response.body) throw new ModelDriverError('model provider returned no response body', { finishReasons: [] })
    const accumulator: StreamAccumulator = { text: '', toolCalls: new Map(), finishReasons: [] }
    for await (const data of sseDataEvents(response.body)) {
      if (data === '[DONE]') break
      let chunk: {
        model?: string
        usage?: { prompt_tokens?: number; completion_tokens?: number } | null
        choices?: Array<{
          finish_reason?: string | null
          delta?: {
            content?: string | null
            tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
          }
        }>
      }
      try {
        chunk = JSON.parse(data)
      } catch {
        throw new ModelDriverError('model stream contained invalid JSON', { finishReasons: accumulator.finishReasons })
      }
      if (chunk.model) accumulator.model = chunk.model
      if (chunk.usage) accumulator.usage = chunk.usage
      const choice = chunk.choices?.[0]
      if (!choice) continue
      if (choice.finish_reason) accumulator.finishReasons.push(choice.finish_reason)
      const content = choice.delta?.content
      if (typeof content === 'string' && content.length > 0) {
        accumulator.text += content
        onTextDelta?.(content)
      }
      for (const toolCall of choice.delta?.tool_calls ?? []) {
        const index = toolCall.index ?? 0
        let entry = accumulator.toolCalls.get(index)
        if (!entry) {
          entry = { id: '', name: '', arguments: '' }
          accumulator.toolCalls.set(index, entry)
        }
        if (toolCall.id) entry.id = toolCall.id
        if (toolCall.function?.name) entry.name += toolCall.function.name
        if (toolCall.function?.arguments) entry.arguments += toolCall.function.arguments
      }
    }
    return accumulator
  }

  private usageOf(accumulator: Pick<StreamAccumulator, 'usage'>): ModelUsage {
    const usage = accumulator.usage
    if (!usage || (usage.prompt_tokens === undefined && usage.completion_tokens === undefined)) {
      return { available: false, inputTokens: 0, outputTokens: 0 }
    }
    return { available: true, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 }
  }

  async run(request: ModelTurnRequest): Promise<ModelTurnResult> {
    const response = await this.request({
      model: this.modelId,
      messages: toWireMessages(request.instructions, request.items),
      tools: [IPYTHON_TOOL],
      tool_choice: 'auto',
      parallel_tool_calls: false,
      stream: true,
      stream_options: { include_usage: true },
    }, request.signal)
    const accumulator = await this.consumeStream(response, request.onTextDelta)
    const output: ModelItem[] = []
    const text = accumulator.text
    if (text.trim()) output.push({ role: 'assistant', content: text })
    for (const [, call] of [...accumulator.toolCalls.entries()].sort(([a], [b]) => a - b)) {
      output.push({
        type: 'function_call',
        callId: call.id || `call-${output.length}`,
        name: call.name || IPYTHON_TOOL_NAME,
        arguments: call.arguments,
      })
    }
    if (output.length === 0) {
      throw new ModelDriverError('model returned neither assistant text nor a tool call', {
        finishReasons: accumulator.finishReasons,
      })
    }
    const result: ModelTurnResult = { output, text, usage: this.usageOf(accumulator) }
    if (accumulator.model !== undefined) result.model = accumulator.model
    if (accumulator.finishReasons.length > 0) result.diagnostics = { finishReasons: accumulator.finishReasons }
    return result
  }

  async structured(request: StructuredCallRequest): Promise<StructuredCallResult> {
    const response = await this.request({
      model: this.modelId,
      messages: [
        { role: 'system', content: request.instructions },
        { role: 'user', content: JSON.stringify(request.input) },
      ],
      response_format: { type: 'json_object' },
      stream: false,
    }, request.signal)
    const payload = await response.json() as {
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new ModelDriverError('structured call returned no content', { finishReasons: [] })
    }
    let value: unknown
    try {
      value = JSON.parse(content)
    } catch {
      throw new ModelDriverError('structured call returned invalid JSON', { finishReasons: [] })
    }
    return { value, model: payload.model ?? this.modelId, usage: this.usageOf({ usage: payload.usage ?? {} }) }
  }

  async compact(request: CompactionRequest): Promise<CompactionResult> {
    const response = await this.request({
      model: this.modelId,
      messages: [
        {
          role: 'system',
          content:
            'Summarize the following agent conversation for continuity. Preserve unresolved tasks, '
            + 'commitments, key facts, user preferences, and identifiers verbatim. Output only the summary. '
            + `Base system context:\n${request.instructions.slice(0, 4_000)}`,
        },
        { role: 'user', content: JSON.stringify(request.items) },
      ],
      stream: false,
    }, request.signal)
    const payload = await response.json() as {
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      choices?: Array<{ message?: { content?: string | null } }>
    }
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string' || !content.trim()) {
      throw new ModelDriverError('compaction returned no summary', { finishReasons: [] })
    }
    return { value: content.trim(), model: payload.model ?? this.modelId, usage: this.usageOf({ usage: payload.usage ?? {} }) }
  }
}
