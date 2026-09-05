/**
 * Model driver port. The runtime speaks only this interface; concrete
 * providers (OpenAI-compatible, Anthropic, test fakes) live behind it.
 */
import type { ModelItem } from '../protocol/types.js'

export interface ModelUsage {
  available: boolean
  inputTokens: number
  outputTokens: number
}

export interface ModelTurnResult {
  /** Items to append to session history (assistant text and/or tool calls). */
  output: ModelItem[]
  /** Full assistant text of this turn ('' when the turn is a tool call). */
  text: string
  model?: string
  usage: ModelUsage
  diagnostics?: Record<string, unknown>
}

export interface ModelTurnRequest {
  instructions: string
  items: readonly ModelItem[]
  signal?: AbortSignal | undefined
  /** Called as assistant text streams; used for latency, not for delivery. */
  onTextDelta?: ((delta: string) => void) | undefined
}

export interface StructuredCallRequest {
  instructions: string
  input: unknown
  signal?: AbortSignal | undefined
}

export interface StructuredCallResult {
  value: unknown
  model: string
  usage: ModelUsage
}

export interface CompactionRequest {
  instructions: string
  items: readonly ModelItem[]
  signal?: AbortSignal | undefined
}

export interface CompactionResult {
  value: string
  model: string
  usage: ModelUsage
}

export interface ModelDriver {
  readonly modelId?: string
  /** One agent-loop turn: single `ipython` tool exposed, at most one call. */
  run(request: ModelTurnRequest): Promise<ModelTurnResult>
  /** One-shot JSON-mode call for auxiliary pipelines. */
  structured(request: StructuredCallRequest): Promise<StructuredCallResult>
  /** Summarize `items` into a continuity summary for context compaction. */
  compact(request: CompactionRequest): Promise<CompactionResult>
}
