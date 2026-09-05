import type OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { ModelDriverError } from '../../../third_party/lingxios/src/errors.js'
import type {
  CompactionResult as AuxiliaryStringResult,
  ModelDriver,
  ModelTurnResult,
  StructuredCallResult as AuxiliaryUnknownResult,
} from '../../../third_party/lingxios/src/model/driver.js'
import { createOpenAIClient } from '../llm-client.js'
import type { ModelItem } from './types.js'

export type { ModelTurnResult } from '../../../third_party/lingxios/src/model/driver.js'

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

export class ModelAdapterError extends ModelDriverError {
  constructor(message: string, readonly diagnostics: ModelTurnDiagnostics) {
    super(message, diagnostics)
    this.name = 'ModelAdapterError'
  }
}

export type AgentModelDriver = ModelDriver

const IPYTHON_TOOL = {
  type: 'function',
  function: {
    name: 'ipython',
    description: 'Execute private Python in the persistent session kernel. Product capabilities use host.<namespace>.<method>(keyword=value, ...).',
    strict: true,
    parameters: {
      type: 'object',
      properties: { code: { type: 'string', description: 'Executable Python source only, without Markdown fences or user-facing prose.' } },
      required: ['code'],
      additionalProperties: false,
    },
  },
} as const

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

const CHAT_TOOLS: ChatCompletionTool[] = [IPYTHON_TOOL].map((tool) => ({
  type: 'function',
  function: {
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
    strict: tool.function.strict,
  },
}))

function visibleAssistantContent(raw: string): string {
  let text = raw
  const completeReasoning = /^\s*<(think|thinking)>[\s\S]*?<\/\1>\s*/i.exec(text)
  if (completeReasoning) text = text.slice(completeReasoning[0].length)
  text = text.replace(/^\s*<\/(?:think|thinking)>\s*/i, '')
  return text
}

/** Native OpenAI Chat Completions transport. LingxiLoop owns
 * all history and never relies on provider threads or server-side state. */
export class OpenAIChatDriver implements ModelDriver {
  private readonly client: OpenAI
  readonly modelId: string

  constructor(
    private readonly model: string,
    options: { apiKey: string; baseURL?: string },
  ) {
    this.modelId = model
    this.client = createOpenAIClient({ apiKey: options.apiKey, baseURL: options.baseURL })
  }

  async run(args: {
    instructions: string
    items: readonly ModelItem[]
    signal?: AbortSignal
    onTextDelta?: (delta: string) => void
  }): Promise<ModelTurnResult> {
    const request = {
      model: this.model,
      messages: [
        { role: 'system', content: args.instructions },
        ...args.items.map(toChatMessage),
      ],
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_tokens: 4_000,
      ...(/qwen3\.5/i.test(this.model) ? { enable_thinking: false } : {}),
    } satisfies Parameters<typeof this.client.chat.completions.create>[0] & { enable_thinking?: boolean }
    const stream = await this.client.chat.completions.create({
      ...request,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: args.signal })

    const output: ModelItem[] = []
    let rawText = ''
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
          rawText += content
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
    const streamedCalls = [...calls.values()]
    const text = visibleAssistantContent(rawText)
    if (text.trim()) await args.onTextDelta?.(text)
    const diagnostics: ModelTurnDiagnostics = {
      chunkCount,
      choiceCount,
      finishReasons: [...finishReasons],
      contentLength: text.length,
      toolCallCount: streamedCalls.length,
      chunkShapes,
    }
    if (streamedCalls.length > 1) {
      throw new ModelAdapterError('native model stream emitted multiple tool calls; exactly one ipython call is allowed', diagnostics)
    }
    const call = streamedCalls[0]
    if (call && (!call.id || call.name !== 'ipython')) {
      throw new ModelAdapterError('native model stream emitted an incomplete or unsupported tool call', diagnostics)
    }
    if (text.trim()) output.push({ role: 'assistant', content: text })
    if (call) output.push({ type: 'function_call', callId: call.id, name: 'ipython', arguments: call.arguments })
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

  async compact(args: { instructions: string; items: readonly ModelItem[]; signal?: AbortSignal }): Promise<AuxiliaryStringResult> {
    const transcript = args.items.map((item) => JSON.stringify(item)).join('\n')
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: `${args.instructions}\nCreate a compact factual continuity summary. Preserve user-stated goals, preferences, decisions, corrections, unfinished work, approvals, and completed outcomes with their provenance. Exclude prompts and instructions, tool or runtime mechanics, internal scope and correlation identifiers, storage paths, tokens, raw errors, and transient metadata. Keep an opaque entity identifier only when it is required to finish an already requested product action. Never turn an assistant suggestion into a user decision.` },
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

  async structured(args: { instructions: string; input: unknown; signal?: AbortSignal }): Promise<AuxiliaryUnknownResult> {
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
  async run(args: Parameters<AgentModelDriver['run']>[0]): Promise<ModelTurnResult> {
    const next = this.turns.shift()
    if (!next) throw new Error('scripted model exhausted')
    if (next.text) await args.onTextDelta?.(next.text)
    return structuredClone(next)
  }
  async compact(args: Parameters<AgentModelDriver['compact']>[0]): Promise<AuxiliaryStringResult> {
    return { model: 'scripted', value: `Summary of ${args.items.length} items`, usage: { inputTokens: 0, outputTokens: 0, available: false } }
  }
  async structured(): Promise<AuxiliaryUnknownResult> {
    return { model: 'scripted', value: { changes: [], approved: true, confidence: 1 }, usage: { inputTokens: 0, outputTokens: 0, available: false } }
  }
}
