/**
 * Unit tests for the Responses API stream-event reducer.
 *
 * Every test here is a "play this event sequence, assert the resulting
 * state" exercise — no DB, no LLM, no live stream. The cases below were
 * picked to lock in the failure modes we've actually shipped fixes for
 * (sub2api OAuth emitting `response.completed` with `output: []` while
 * tool calls did stream, partial-arguments deltas, drift between
 * pendingTools and assistant-replay), plus a few defensive scenarios
 * (unknown event types, missing call_id, duplicates) so future
 * upstream-shape changes can't silently regress the consumption logic.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-turn-stream.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ResponseStreamEvent } from 'openai/resources/responses/responses'
import {
  applyResponseStreamEvent,
  consumeResponseStream,
  newResponseStreamState,
  reduceResponseStream,
  ResponseStreamTimeoutError,
  type ResponseStreamState,
} from '../agents/turn-stream.js'

/** Test helper — feeds a static event list through the reducer and
 *  returns the final state. Spread on top of `newResponseStreamState`
 *  so individual tests can stay declarative. */
function play(events: ResponseStreamEvent[]): ResponseStreamState {
  const state = newResponseStreamState()
  for (const ev of events) {
    applyResponseStreamEvent(state, ev)
  }
  return state
}

/** Wrap an array as an async iterable for the `reduceResponseStream`
 *  drain helper. */
async function *asAsync<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

/** Minimal usage shape — Responses API actually returns more fields but
 *  the reducer only reads input_tokens + output_tokens. */
function usage(input: number, output: number): Record<string, unknown> {
  return { input_tokens: input, output_tokens: output, total_tokens: input + output }
}

test('starts with an empty state', () => {
  const s = newResponseStreamState()
  assert.deepEqual(s.pendingTools, {})
  assert.equal(s.responseTextByPart.size, 0)
  assert.equal(s.responseId, undefined)
  assert.equal(s.responseStatus, undefined)
  assert.deepEqual(s.responseOutput, [])
  assert.equal(s.responseUsage, null)
  assert.equal(s.totalTokens, 0)
})

test('response.created stamps the id and initial status', () => {
  const s = play([
    { type: 'response.created', response: { id: 'resp_abc', status: 'in_progress' } } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseId, 'resp_abc')
  assert.equal(s.responseStatus, 'in_progress')
})

test('output_text.delta accumulates by item_id + content_index key', () => {
  const s = play([
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'Hello, ' } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'world!' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseTextByPart.get('msg_1:0'), 'Hello, world!')
})

test('output_text.done overrides any prior delta for the same key', () => {
  const s = play([
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'partial...' } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.done', item_id: 'msg_1', content_index: 0, text: 'final answer' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseTextByPart.get('msg_1:0'), 'final answer')
})

test('output_text deltas for different items + parts stay independent', () => {
  const s = play([
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'A' } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 1, delta: 'B' } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.delta', item_id: 'msg_2', content_index: 0, delta: 'C' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseTextByPart.get('msg_1:0'), 'A')
  assert.equal(s.responseTextByPart.get('msg_1:1'), 'B')
  assert.equal(s.responseTextByPart.get('msg_2:0'), 'C')
})

test('output_item.added function_call seeds pendingTools', () => {
  const s = play([
    {
      type: 'response.output_item.added',
      item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' },
    } as unknown as ResponseStreamEvent,
  ])
  assert.deepEqual(s.pendingTools, {
    fc_1: { call_id: 'call_1', name: 'bash', arguments: '' },
  })
})

test('arguments deltas append to the seeded entry', () => {
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"comm' } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: 'and":"ls"}' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.pendingTools.fc_1.arguments, '{"command":"ls"}')
})

test('arguments.done replaces accumulated deltas with the canonical string', () => {
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"command":"ls' } as unknown as ResponseStreamEvent,
    // .done arrives even though our streamed deltas were missing the close brace
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"command":"ls -la"}' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.pendingTools.fc_1.arguments, '{"command":"ls -la"}')
})

test('arguments deltas for unknown item_id are silently dropped', () => {
  // Defends against a stray delta that arrived without a preceding `added` —
  // e.g. an upstream re-order. We shouldn't crash, just no-op.
  const s = play([
    { type: 'response.function_call_arguments.delta', item_id: 'fc_unknown', delta: 'oops' } as unknown as ResponseStreamEvent,
  ])
  assert.deepEqual(s.pendingTools, {})
})

test('output_item.added without an item.id falls back to call_id as the map key', () => {
  // Production reality: most events carry both `id` and `call_id`, but the
  // SDK type allows either to be missing. The reducer prefers `id`, so the
  // later delta-by-item_id lookups still hit the right entry.
  const s = play([
    { type: 'response.output_item.added', item: { type: 'function_call', call_id: 'call_only', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.delta', item_id: 'call_only', delta: '{}' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.pendingTools.call_only.arguments, '{}')
})

test('non-function_call items in output_item.added are ignored', () => {
  // Reasoning items, message items, etc. shouldn't pollute pendingTools.
  const s = play([
    { type: 'response.output_item.added', item: { id: 'rs_1', type: 'reasoning', summary: [] } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'msg_1', type: 'message', role: 'assistant', content: [] } } as unknown as ResponseStreamEvent,
  ])
  assert.deepEqual(s.pendingTools, {})
})

test('response.completed with output:[] still back-fills pendingTools from earlier added events — the sub2api OAuth regression', () => {
  // This is the bug that produced the run-d0f395ae "No tool call found for
  // function call output" 502 storm: sub2api's OAuth path emitted
  // response.completed with an empty `output` array even though tool calls
  // had streamed via `output_item.added` events earlier. The reducer must
  // preserve those entries; the caller's downstream assistantOutputItems
  // build relies on `pendingTools` as the single source of truth.
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"command":"cumora kanban ls"}' } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [], usage: usage(8400, 80) } } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseStatus, 'completed')
  assert.equal(s.totalTokens, 8480)
  assert.deepEqual(Object.keys(s.pendingTools), ['fc_1'])
  assert.equal(s.pendingTools.fc_1.call_id, 'call_1')
  assert.equal(s.pendingTools.fc_1.arguments, '{"command":"cumora kanban ls"}')
})

test('response.completed back-fills pendingTools when output_item.added events were missing entirely', () => {
  // Symmetric defense: if the stream skipped output_item.added but the
  // final completed event carries the call, we still get a pendingTool.
  const s = play([
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [{ id: 'fc_late', type: 'function_call', call_id: 'call_late', name: 'bash', arguments: '{"command":"ls"}' }],
        usage: usage(100, 20),
      },
    } as unknown as ResponseStreamEvent,
  ])
  assert.deepEqual(s.pendingTools, {
    fc_late: { call_id: 'call_late', name: 'bash', arguments: '{"command":"ls"}' },
  })
})

test('response.completed preserves the most complete pendingTool when its data races the back-fill', () => {
  // If `output_item.added` + delta + .done already populated the args, and
  // response.completed's `output` carries a different arguments string for
  // the same id, the back-fill is authoritative (matches the production
  // reducer's "completed wins" semantic). Documenting this so tests catch
  // an accidental flip in priority.
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"partial":true}' } as unknown as ResponseStreamEvent,
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [{ id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '{"final":true}' }],
        usage: usage(50, 10),
      },
    } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.pendingTools.fc_1.arguments, '{"final":true}')
})

test('response.completed without usage leaves totalTokens at the prior value', () => {
  const s = play([
    { type: 'response.completed', response: { status: 'completed', output: [] } } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.totalTokens, 0)
  assert.equal(s.responseUsage, null)
})

test('non-`completed` response status propagates verbatim (failed / incomplete / timed_out)', () => {
  for (const status of ['failed', 'incomplete', 'timed_out']) {
    const s = play([
      { type: 'response.created', response: { id: 'resp', status: 'in_progress' } } as unknown as ResponseStreamEvent,
      { type: 'response.completed', response: { status, output: [], usage: usage(10, 5) } } as unknown as ResponseStreamEvent,
    ])
    assert.equal(s.responseStatus, status, `expected status=${status}`)
    assert.equal(s.totalTokens, 15, 'usage is recorded even when status is non-completed')
  }
})

test('partial stream (added + delta but no .done and no completed) leaves pendingTools with whatever arrived', () => {
  // This is the "stream interrupted mid-tool-call" case — agent network blip
  // or upstream connection reset. The caller's outer try/catch handles the
  // failed turn; the reducer just keeps what it heard.
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{"co' } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseStatus, undefined, 'no completed event → status stays unset')
  assert.equal(s.pendingTools.fc_1.arguments, '{"co')
})

test('multiple concurrent tool calls in one hop keep distinct entries', () => {
  // Model fires N bash calls in parallel; we must end up with N pendingTools.
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_2', type: 'function_call', call_id: 'call_2', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_3', type: 'function_call', call_id: 'call_3', name: 'web_search', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"command":"ls"}' } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_2', arguments: '{"command":"pwd"}' } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_3', arguments: '{"query":"cats"}' } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [], usage: usage(100, 30) } } as unknown as ResponseStreamEvent,
  ])
  const ids = Object.keys(s.pendingTools).sort()
  assert.deepEqual(ids, ['fc_1', 'fc_2', 'fc_3'])
  assert.equal(s.pendingTools.fc_3.name, 'web_search')
  assert.equal(s.pendingTools.fc_3.arguments, '{"query":"cats"}')
})

test('unknown event types are ignored without crashing — forward-compat with new Responses event shapes', () => {
  // Don't 500 because OpenAI shipped a new event we don't yet care about.
  const s = play([
    { type: 'response.reasoning.delta', delta: 'hmm' } as unknown as ResponseStreamEvent,
    { type: 'response.totally.fictional.event', some: 'payload' } as unknown as ResponseStreamEvent,
    { type: 'response.created', response: { id: 'resp_x', status: 'in_progress' } } as unknown as ResponseStreamEvent,
  ])
  assert.equal(s.responseId, 'resp_x', 'known events still applied after unknown ones')
})

test('output_item.added with the same id twice is idempotent (later wins)', () => {
  // Upstream sometimes re-emits added (e.g. on a retry). Last write wins —
  // the entry just gets overwritten with the same shape.
  const s = play([
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '{"already":"populated"}' } } as unknown as ResponseStreamEvent,
  ])
  assert.equal(Object.keys(s.pendingTools).length, 1)
  assert.equal(s.pendingTools.fc_1.arguments, '{"already":"populated"}')
})

test('traceItem option transforms response.completed.output for observability', () => {
  // The production caller passes `traceResponseOutputItem` so the
  // observability event carries a truncation-safe rendering rather than
  // raw upstream JSON. Tests can omit the mapper to inspect raw items.
  const s = newResponseStreamState()
  const calls: unknown[] = []
  applyResponseStreamEvent(
    s,
    {
      type: 'response.completed',
      response: {
        status: 'completed',
        output: [
          { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '{}' },
          { id: 'msg_1', type: 'message', role: 'assistant', content: [] },
        ],
        usage: usage(10, 2),
      },
    } as unknown as ResponseStreamEvent,
    {
      traceItem: (item) => { calls.push(item); return { TRACED: true } },
    },
  )
  assert.equal(calls.length, 2, 'mapper called once per item')
  assert.deepEqual(s.responseOutput, [{ TRACED: true }, { TRACED: true }])
  // pendingTools is back-filled from the RAW items, not the traced shape —
  // tracing is observability-only.
  assert.equal(s.pendingTools.fc_1.call_id, 'call_1')
})

test('reduceResponseStream drains an async iterable into one snapshot', async () => {
  const events: ResponseStreamEvent[] = [
    { type: 'response.created', response: { id: 'resp_drain', status: 'in_progress' } } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"ok":true}' } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [], usage: usage(5, 1) } } as unknown as ResponseStreamEvent,
  ]
  const s = await reduceResponseStream(asAsync(events))
  assert.equal(s.responseId, 'resp_drain')
  assert.equal(s.responseStatus, 'completed')
  assert.equal(s.pendingTools.fc_1.arguments, '{"ok":true}')
  assert.equal(s.totalTokens, 6)
})

test('text + tool call in the same hop both land — agent can both speak and act', () => {
  // The model can stream visible text AND fire a tool call in one response.
  // We want both: the text is exposed for auto-relay considerations, the
  // tool call drives the next hop.
  const s = play([
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'On it — ' } as unknown as ResponseStreamEvent,
    { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: 'checking the boards.' } as unknown as ResponseStreamEvent,
    { type: 'response.output_item.added', item: { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'bash', arguments: '' } } as unknown as ResponseStreamEvent,
    { type: 'response.function_call_arguments.done', item_id: 'fc_1', arguments: '{"command":"cumora kanban ls"}' } as unknown as ResponseStreamEvent,
    { type: 'response.completed', response: { status: 'completed', output: [], usage: usage(200, 40) } } as unknown as ResponseStreamEvent,
  ])
  assert.equal(Array.from(s.responseTextByPart.values()).join(''), 'On it — checking the boards.')
  assert.equal(Object.keys(s.pendingTools).length, 1)
})

test('consumeResponseStream aborts a stream that goes idle between events', async () => {
  const controller = new AbortController()
  const stream = {
    controller,
    async *[Symbol.asyncIterator](): AsyncGenerator<ResponseStreamEvent> {
      yield { type: 'response.created', response: { id: 'resp_idle', status: 'in_progress' } } as unknown as ResponseStreamEvent
      await new Promise<never>(() => { /* never resolves */ })
    },
  }
  const seen: ResponseStreamEvent[] = []
  await assert.rejects(
    () => consumeResponseStream(stream, (event) => seen.push(event), { idleTimeoutMs: 10, wallTimeoutMs: 1_000 }),
    (err: unknown) => {
      assert.ok(err instanceof ResponseStreamTimeoutError)
      assert.equal(err.kind, 'idle')
      return true
    },
  )
  assert.equal(seen.length, 1)
  assert.equal(controller.signal.aborted, true)
})

test('consumeResponseStream aborts a stream that exceeds wall-clock budget', async () => {
  const controller = new AbortController()
  const stream = {
    controller,
    async *[Symbol.asyncIterator](): AsyncGenerator<ResponseStreamEvent> {
      while (true) {
        yield { type: 'response.output_text.delta', item_id: 'msg_1', content_index: 0, delta: '.' } as unknown as ResponseStreamEvent
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    },
  }
  await assert.rejects(
    () => consumeResponseStream(stream, () => {}, { idleTimeoutMs: 100, wallTimeoutMs: 20 }),
    (err: unknown) => {
      assert.ok(err instanceof ResponseStreamTimeoutError)
      assert.equal(err.kind, 'wall')
      return true
    },
  )
  assert.equal(controller.signal.aborted, true)
})
