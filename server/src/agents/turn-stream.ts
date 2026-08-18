/**
 * Responses API stream-event reducer — extracted from `runAgentTurn` so it
 * can be unit-tested without dragging in the runtime client / DB pool /
 * Redis / OpenAI SDK boot graph.
 *
 * The reducer is intentionally tiny and side-effect-free: feed it events,
 * read the accumulated state. Every production bug we've fixed in this
 * code path (sub2api emitting `response.completed` with `output: []` while
 * tool calls did stream via `output_item.added`; drift between
 * pendingTools and the assistant-output replay items; partial-arguments
 * deltas with a lost final `.done` event) collapses to "a specific event
 * sequence" — exactly what unit tests cover well.
 */
import type { ResponseStreamEvent } from 'openai/resources/responses/responses'

export const RESPONSE_STREAM_IDLE_TIMEOUT_MS = 4 * 60_000
export const RESPONSE_STREAM_WALL_TIMEOUT_MS = 6 * 60_000

export class ResponseStreamTimeoutError extends Error {
  constructor(
    readonly kind: 'idle' | 'wall',
    readonly timeoutMs: number,
  ) {
    super(`OpenAI response stream ${kind} timeout after ${timeoutMs}ms`)
    this.name = 'ResponseStreamTimeoutError'
  }
}

export interface PendingToolCall {
  call_id: string
  name: string
  arguments: string
}

export interface ResponseStreamState {
  pendingTools: Record<string, PendingToolCall>
  responseTextByPart: Map<string, string>
  responseId?: string
  responseStatus?: string
  /** Traced (truncation-safe) representation of `response.completed.output`,
   *  rendered eagerly via the optional `traceResponseOutputItem` callback
   *  so the observability event can stay small even when the underlying
   *  response carries giant tool outputs. */
  responseOutput: unknown[]
  responseUsage: unknown
  /** Sum of `usage.input_tokens + usage.output_tokens` from the
   *  `response.completed` event. The caller surfaces this to the per-turn
   *  75%-budget guard; reset every hop. */
  totalTokens: number
}

export function newResponseStreamState(): ResponseStreamState {
  return {
    pendingTools: {},
    responseTextByPart: new Map<string, string>(),
    responseOutput: [],
    responseUsage: null,
    totalTokens: 0,
  }
}

export interface ApplyStreamEventOptions {
  /** Optional mapper for `response.completed.output` items. The production
   *  caller passes `traceResponseOutputItem` to render each item into a
   *  truncation-safe shape for observability events. Tests can omit this
   *  to keep raw items, which makes assertions easier. */
  traceItem?: (item: unknown) => unknown
}

export interface ConsumeStreamOptions {
  /** Maximum silence between stream events. Once the HTTP stream has been
   *  established, the OpenAI SDK request timeout no longer protects every
   *  `for await` read; this bounds the no-progress case explicitly. */
  idleTimeoutMs?: number
  /** Maximum wall-clock time for one model hop stream, even if it dribbles
   *  occasional events. Agent tasks should continue in another hop, not pin
   *  a worker forever inside one response body. */
  wallTimeoutMs?: number
}

function abortStream(stream: AsyncIterable<ResponseStreamEvent>): void {
  const maybeAbort = (stream as unknown as { controller?: { abort?: () => void } }).controller?.abort
  if (typeof maybeAbort === 'function') {
    try {
      maybeAbort.call((stream as unknown as { controller?: unknown }).controller)
    } catch {
      // Best effort only. The caller is already failing the turn.
    }
  }
}

async function nextWithTimeout<T>(
  next: Promise<IteratorResult<T>>,
  timeoutMs: number,
  kind: 'idle' | 'wall',
): Promise<IteratorResult<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null
  try {
    return await Promise.race([
      next,
      new Promise<IteratorResult<T>>((_, reject) => {
        timer = setTimeout(() => reject(new ResponseStreamTimeoutError(kind, timeoutMs)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function consumeResponseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  onEvent: (event: ResponseStreamEvent) => void,
  opts: ConsumeStreamOptions = {},
): Promise<void> {
  const idleTimeoutMs = opts.idleTimeoutMs ?? RESPONSE_STREAM_IDLE_TIMEOUT_MS
  const wallTimeoutMs = opts.wallTimeoutMs ?? RESPONSE_STREAM_WALL_TIMEOUT_MS
  const deadline = Date.now() + wallTimeoutMs
  const iterator = stream[Symbol.asyncIterator]()

  while (true) {
    const remainingWallMs = deadline - Date.now()
    if (remainingWallMs <= 0) {
      abortStream(stream)
      throw new ResponseStreamTimeoutError('wall', wallTimeoutMs)
    }
    const waitMs = Math.min(idleTimeoutMs, remainingWallMs)
    const timeoutKind = waitMs === remainingWallMs ? 'wall' : 'idle'
    let result: IteratorResult<ResponseStreamEvent>
    try {
      result = await nextWithTimeout(iterator.next(), waitMs, timeoutKind)
    } catch (err) {
      if (err instanceof ResponseStreamTimeoutError) abortStream(stream)
      throw err
    }
    if (result.done) return
    onEvent(result.value)
  }
}

/** Mutate `state` to reflect one Responses API stream event.
 *
 *  Defensive choices encoded here, all driven by real production failures:
 *  - `pendingTools` is keyed by `event.item.id ?? event.item.call_id` so
 *    later `function_call_arguments.delta` events (which carry `item_id`)
 *    can find the entry even when the item never got a real id.
 *  - `response.completed` BACK-FILLS `pendingTools` in case an
 *    `output_item.added` event was dropped upstream. It does NOT populate
 *    a separate assistant-replay buffer — sub2api's OAuth path is known
 *    to emit completed events with `output: []` even when tool calls did
 *    stream, and the caller derives assistant-replay items from
 *    `pendingTools` (single source of truth) after the stream ends.
 *  - Unknown event types fall through silently — Responses API gains new
 *    event types over time; we don't want a 500 because of one we don't
 *    yet care about. */
export function applyResponseStreamEvent(
  state: ResponseStreamState,
  event: ResponseStreamEvent,
  opts: ApplyStreamEventOptions = {},
): void {
  switch (event.type) {
    case 'response.created':
      state.responseId = event.response.id
      state.responseStatus = event.response.status
      break
    case 'response.output_text.delta': {
      const key = `${event.item_id}:${event.content_index}`
      state.responseTextByPart.set(key, (state.responseTextByPart.get(key) ?? '') + event.delta)
      break
    }
    case 'response.output_text.done': {
      const key = `${event.item_id}:${event.content_index}`
      state.responseTextByPart.set(key, event.text)
      break
    }
    case 'response.output_item.added':
      if (event.item.type === 'function_call') {
        state.pendingTools[event.item.id ?? event.item.call_id] = {
          call_id: event.item.call_id,
          name: event.item.name,
          arguments: event.item.arguments ?? '',
        }
      }
      break
    case 'response.function_call_arguments.delta':
      if (state.pendingTools[event.item_id]) {
        state.pendingTools[event.item_id].arguments += event.delta
      }
      break
    case 'response.function_call_arguments.done':
      if (state.pendingTools[event.item_id]) {
        state.pendingTools[event.item_id].arguments = event.arguments
      }
      break
    case 'response.completed':
      state.responseStatus = event.response.status
      state.responseOutput = (event.response.output ?? []).map((item) =>
        opts.traceItem ? opts.traceItem(item) : item,
      )
      for (const item of event.response.output ?? []) {
        if (item.type === 'function_call') {
          state.pendingTools[item.id ?? item.call_id] = {
            call_id: item.call_id,
            name: item.name,
            arguments: item.arguments ?? '',
          }
        }
      }
      if (event.response.usage) {
        state.responseUsage = event.response.usage
        state.totalTokens = (event.response.usage.input_tokens ?? 0) +
                            (event.response.usage.output_tokens ?? 0)
      }
      break
    default:
      break
  }
}

/** Drain an async iterable of stream events into a fresh state. Convenience
 *  for callers that want the post-stream snapshot in one call. */
export async function reduceResponseStream(
  stream: AsyncIterable<ResponseStreamEvent>,
  opts: ApplyStreamEventOptions & ConsumeStreamOptions = {},
): Promise<ResponseStreamState> {
  const state = newResponseStreamState()
  await consumeResponseStream(stream, (event) => applyResponseStreamEvent(state, event, opts), opts)
  return state
}
