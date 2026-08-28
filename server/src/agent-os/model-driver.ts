import type OpenAI from 'openai'
import { createOpenAIClient } from '../llm-client.js'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { MODEL_TOOLS } from './tool.js'
import type { ModelItem } from './types.js'

export type ModelTurnResult = {
  model?: string
  output: ModelItem[]
  text: string
  usage: { inputTokens: number; outputTokens: number; available?: boolean }
  diagnostics?: ModelTurnDiagnostics
}

export type AuxiliaryModelResult<T> = {
  model: string
  value: T
  usage: { inputTokens: number; outputTokens: number; available?: boolean }
}

export type ModelTurnDiagnostics = {
  chunkCount: number
  choiceCount: number
  finishReasons: string[]
  contentLength: number
  toolCallCount: number
  chunkShapes: string[]
}

export class ModelAdapterError extends Error {
  constructor(message: string, readonly diagnostics: ModelTurnDiagnostics) {
    super(message)
    this.name = 'ModelAdapterError'
  }
}

export interface AgentModelDriver {
  readonly modelId?: string
  run(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal; onTextDelta?: (delta: string) => void | Promise<void> }): Promise<ModelTurnResult>
  compact(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal }): Promise<AuxiliaryModelResult<string>>
  structured(args: { instructions: string; input: unknown; signal?: AbortSignal }): Promise<AuxiliaryModelResult<unknown>>
}

function toChatMessage(item: ModelItem): ChatCompletionMessageParam {
  if ('role' in item) return { role: item.role, content: item.content } as ChatCompletionMessageParam
  if (item.type === 'function_call') {
    return {
      role: 'assistant',
      content: null,
      tool_calls: [{ id: item.callId, type: 'function', function: { name: item.name, arguments: item.arguments } }],
    }
  }
  return { role: 'tool', tool_call_id: item.callId, content: item.output }
}

const CHAT_TOOLS: ChatCompletionTool[] = MODEL_TOOLS.map((tool) => ({
  type: 'function',
  function: {
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  },
}))

/** Native OpenAI Chat Completions transport. LingxiLoop owns
 * all history and never relies on provider threads or server-side state. */
export class OpenAIChatDriver implements AgentModelDriver {
  private readonly client: OpenAI
  readonly modelId: string

  constructor(
    private readonly model: string,
    options: { apiKey: string; baseURL?: string },
  ) {
    this.modelId = model
    this.client = createOpenAIClient({ apiKey: options.apiKey, baseURL: options.baseURL })
  }

  async run(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal; onTextDelta?: (delta: string) => void | Promise<void> }): Promise<ModelTurnResult> {
    const request = {
      model: this.model,
      messages: [
        { role: 'system', content: args.instructions },
        ...args.items.map(toChatMessage),
      ],
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      max_tokens: 4_000,
    } satisfies Parameters<typeof this.client.chat.completions.create>[0]
    const stream = await this.client.chat.completions.create({
      ...request,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: args.signal })

    const output: ModelItem[] = []
    let text = ''
    let inputTokens = 0
    let outputTokens = 0
    let usageAvailable = false
    let chunkCount = 0
    let choiceCount = 0
    const finishReasons = new Set<string>()
    const chunkShapes: string[] = []
    const calls = new Map<number, { id: string; name: string; arguments: string }>()
    for await (const chunk of stream) {
      chunkCount += 1
      choiceCount += chunk.choices.length
      if (chunkShapes.length < 8) {
        chunkShapes.push(JSON.stringify({
          keys: Object.keys(chunk),
          choices: chunk.choices.map((choice) => ({
            keys: Object.keys(choice),
            deltaKeys: choice.delta ? Object.keys(choice.delta) : [],
            finishReason: choice.finish_reason ?? null,
          })),
        }))
      }
      if (chunk.usage) {
        usageAvailable = true
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }
      for (const choice of chunk.choices) {
        if (choice.finish_reason) finishReasons.add(choice.finish_reason)
        const delta = choice.delta as {
          content?: string | null
          tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }>
        }
        const content = delta.content
        if (content) {
          text += content
          await args.onTextDelta?.(content)
        }
        const rawCalls = delta.tool_calls ?? []
        for (const [position, raw] of rawCalls.entries()) {
          const index = raw.index ?? position
          const existing = calls.get(index) ?? { id: '', name: '', arguments: '' }
          if (raw.id) existing.id = raw.id
          if (raw.function?.name) existing.name += raw.function.name
          if (raw.function?.arguments) existing.arguments += raw.function.arguments
          calls.set(index, existing)
        }
      }
    }
    if (text) output.push({ role: 'assistant', content: text })
    for (const call of [...calls.values()]) {
      if (call.id && call.name === 'ipython') {
        output.push({ type: 'function_call', callId: call.id, name: 'ipython', arguments: call.arguments })
      }
    }
    const diagnostics: ModelTurnDiagnostics = {
      chunkCount,
      choiceCount,
      finishReasons: [...finishReasons],
      contentLength: text.length,
      toolCallCount: output.filter((item) => 'type' in item && item.type === 'function_call').length,
      chunkShapes,
    }
    if (output.length === 0) {
      throw new ModelAdapterError(
        `native model stream returned no assistant content or supported tool calls (chunks=${chunkCount}, choices=${choiceCount}, finishReasons=${diagnostics.finishReasons.join(',') || 'unavailable'})`,
        diagnostics,
      )
    }
    return {
      model: this.model,
      output,
      text,
      usage: { inputTokens, outputTokens, available: usageAvailable },
      diagnostics,
    }
  }

  async compact(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal }): Promise<AuxiliaryModelResult<string>> {
    const transcript = args.items.map((item) => JSON.stringify(item)).join('\n')
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: `${args.instructions}\nCreate a durable, factual learning-session summary. Preserve goals, learner preferences, corrections, unfinished work, approvals and handoffs.` },
        { role: 'user', content: transcript },
      ],
      max_tokens: 1_500,
    }, { signal: args.signal })
    return {
      model: this.model,
      value: response.choices[0]?.message?.content?.trim() ?? '',
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0, available: Boolean(response.usage) },
    }
  }

  async structured(args: { instructions: string; input: unknown; signal?: AbortSignal }): Promise<AuxiliaryModelResult<unknown>> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: args.instructions },
        { role: 'user', content: JSON.stringify(args.input) },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2_000,
    }, { signal: args.signal })
    const text = response.choices[0]?.message?.content?.trim() ?? '{}'
    try {
      return {
        model: this.model,
        value: JSON.parse(text) as unknown,
        usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0, available: Boolean(response.usage) },
      }
    } catch { throw new Error('model returned invalid structured JSON') }
  }
}

export class ScriptedModelDriver implements AgentModelDriver {
  readonly modelId = 'scripted'
  constructor(private readonly turns: ModelTurnResult[]) {}
  async run(): Promise<ModelTurnResult> {
    const next = this.turns.shift()
    if (!next) throw new Error('scripted model exhausted')
    return structuredClone(next)
  }
  async compact(args: { items: ModelItem[] }): Promise<AuxiliaryModelResult<string>> {
    return { model: 'scripted', value: `Summary of ${args.items.length} items`, usage: { inputTokens: 0, outputTokens: 0, available: false } }
  }
  async structured(): Promise<AuxiliaryModelResult<unknown>> {
    return { model: 'scripted', value: { changes: [], approved: true, confidence: 1 }, usage: { inputTokens: 0, outputTokens: 0, available: false } }
  }
}
