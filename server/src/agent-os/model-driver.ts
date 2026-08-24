import OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { MODEL_TOOLS } from './tool.js'
import type { ModelItem } from './types.js'

export type ModelTurnResult = {
  output: ModelItem[]
  text: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface AgentModelDriver {
  run(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal; onTextDelta?: (delta: string) => void | Promise<void> }): Promise<ModelTurnResult>
  compact(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal }): Promise<string>
  structured(args: { instructions: string; input: unknown; signal?: AbortSignal }): Promise<unknown>
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

/** DeepSeek's OpenAI-compatible Chat Completions transport. LingxiLoop owns
 * all history and never relies on provider threads or server-side state. */
export class DeepSeekChatDriver implements AgentModelDriver {
  private readonly client: OpenAI

  constructor(
    private readonly model: string,
    options: { apiKey: string; baseURL?: string },
  ) {
    this.client = new OpenAI({ apiKey: options.apiKey, baseURL: options.baseURL })
  }

  async run(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal; onTextDelta?: (delta: string) => void | Promise<void> }): Promise<ModelTurnResult> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: args.instructions },
        ...args.items.map(toChatMessage),
      ],
      tools: CHAT_TOOLS,
      tool_choice: 'auto',
      max_tokens: 4_000,
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: args.signal })

    const output: ModelItem[] = []
    let text = ''
    let inputTokens = 0
    let outputTokens = 0
    const calls = new Map<number, { id: string; name: string; arguments: string }>()
    for await (const chunk of stream) {
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens ?? 0
        outputTokens = chunk.usage.completion_tokens ?? 0
      }
      const delta = chunk.choices[0]?.delta
      if (!delta) continue
      if (delta.content) {
        text += delta.content
        await args.onTextDelta?.(delta.content)
      }
      for (const raw of delta.tool_calls ?? []) {
        const existing = calls.get(raw.index) ?? { id: '', name: '', arguments: '' }
        if (raw.id) existing.id = raw.id
        if (raw.function?.name) existing.name += raw.function.name
        if (raw.function?.arguments) existing.arguments += raw.function.arguments
        calls.set(raw.index, existing)
      }
    }
    if (text) output.push({ role: 'assistant', content: text })
    for (const call of [...calls.values()]) {
      if (call.id && call.name === 'ipython') {
        output.push({ type: 'function_call', callId: call.id, name: 'ipython', arguments: call.arguments })
      }
    }
    return {
      output,
      text,
      usage: { inputTokens, outputTokens },
    }
  }

  async compact(args: { instructions: string; items: ModelItem[]; signal?: AbortSignal }): Promise<string> {
    const transcript = args.items.map((item) => JSON.stringify(item)).join('\n')
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: `${args.instructions}\nCreate a durable, factual learning-session summary. Preserve goals, learner preferences, corrections, unfinished work, approvals and handoffs.` },
        { role: 'user', content: transcript },
      ],
      max_tokens: 1_500,
    }, { signal: args.signal })
    return response.choices[0]?.message?.content?.trim() ?? ''
  }

  async structured(args: { instructions: string; input: unknown; signal?: AbortSignal }): Promise<unknown> {
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
    try { return JSON.parse(text) as unknown } catch { throw new Error('model returned invalid structured JSON') }
  }
}

export class ScriptedModelDriver implements AgentModelDriver {
  constructor(private readonly turns: ModelTurnResult[]) {}
  async run(): Promise<ModelTurnResult> {
    const next = this.turns.shift()
    if (!next) throw new Error('scripted model exhausted')
    return structuredClone(next)
  }
  async compact(args: { items: ModelItem[] }): Promise<string> { return `Summary of ${args.items.length} items` }
  async structured(): Promise<unknown> { return { changes: [], approved: true, confidence: 1 } }
}
