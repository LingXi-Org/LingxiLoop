/**
 * Unit tests for the SSE parser the pod uses to consume the wake
 * stream. The wire-level guarantees come from this parser; the
 * higher-level steering integration tests assume it works. This
 * file pins the parser contract directly.
 *
 * Covers: basic block, CRLF endings, multi-line `data:` accumulation,
 * comment-line skip, partial-UTF-8 chunk splits mid-codepoint,
 * chunks that arrive byte-by-byte, blocks split across chunk
 * boundaries, the `id:` field, trailing-buffer-without-double-newline.
 *
 * Run: node --import tsx --test server/src/__tests__/agents-sse-parse.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSseStream, type SseEvent } from '../agents/runtime/sse-parse.js'

/** Build an AsyncIterable<Uint8Array> from raw chunks. Each `parts`
 *  string is yielded as one chunk — lets a test simulate exact
 *  network chunking behavior. */
async function* asUint8Stream(parts: string[]): AsyncGenerator<Uint8Array> {
  const enc = new TextEncoder()
  for (const p of parts) yield enc.encode(p)
}

async function collect(g: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
  const out: SseEvent[] = []
  for await (const e of g) out.push(e)
  return out
}

// ── basic blocks ───────────────────────────────────────────────────────

test('parseSseStream: single complete event block', async () => {
  const out = await collect(parseSseStream(asUint8Stream(['event: wake\ndata: hello\n\n'])))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'wake')
  assert.equal(out[0].data, 'hello')
})

test('parseSseStream: multiple consecutive blocks', async () => {
  const out = await collect(parseSseStream(asUint8Stream([
    'event: wake\ndata: 1\n\nevent: wake\ndata: 2\n\nevent: steer\ndata: 3\n\n',
  ])))
  assert.equal(out.length, 3)
  assert.deepEqual(out.map((e) => e.event), ['wake', 'wake', 'steer'])
  assert.deepEqual(out.map((e) => e.data), ['1', '2', '3'])
})

test('parseSseStream: id field captured alongside event/data', async () => {
  const out = await collect(parseSseStream(asUint8Stream([
    'event: steer\nid: steer-abc\ndata: {"x":1}\n\n',
  ])))
  assert.equal(out[0].event, 'steer')
  assert.equal(out[0].id, 'steer-abc')
  assert.equal(out[0].data, '{"x":1}')
})

test('parseSseStream: empty `data:` value yields the event anyway', async () => {
  // Edge case: `event: ready\ndata: \n\n` — ready events without a
  // body still need to flow through to the consumer.
  const out = await collect(parseSseStream(asUint8Stream([
    'event: ready\ndata: \n\n',
  ])))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'ready')
})

// ── line ending variants ───────────────────────────────────────────────

test('parseSseStream: CRLF line endings stripped from values', async () => {
  // Some proxies / clients emit CRLF instead of LF inside a block,
  // but the block terminator is still \n\n. The parser must strip
  // the trailing \r off each line's value.
  const out = await collect(parseSseStream(asUint8Stream([
    'event: wake\r\ndata: hello\r\n\n',
  ])))
  assert.equal(out[0].event, 'wake')
  assert.equal(out[0].data, 'hello', 'no embedded \\r in the value')
})

// ── comments + unknown fields ──────────────────────────────────────────

test('parseSseStream: `:` comment lines are skipped', async () => {
  const out = await collect(parseSseStream(asUint8Stream([
    ': keep-alive ping 1234\nevent: wake\ndata: hi\n\n',
  ])))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'wake')
})

test('parseSseStream: unknown fields are ignored, recognized fields are kept', async () => {
  // `retry:` and `: comment` are skipped; we keep event/data/id.
  const out = await collect(parseSseStream(asUint8Stream([
    'retry: 500\nevent: wake\ndata: ok\n\n',
  ])))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'wake')
  assert.equal(out[0].data, 'ok')
})

// ── multi-line data accumulation ──────────────────────────────────────

test('parseSseStream: multi-line `data:` is concatenated per SSE spec', async () => {
  // The spec says "data:" lines within a single block accumulate
  // (joined without newlines — most servers use ONE data line per
  // block but the parser must handle the multi-line form).
  const out = await collect(parseSseStream(asUint8Stream([
    'event: msg\ndata: hello \ndata: world\n\n',
  ])))
  assert.equal(out.length, 1)
  assert.equal(out[0].data, 'hello world')
})

// ── chunk-boundary safety ──────────────────────────────────────────────

test('parseSseStream: a single block split across many tiny chunks', async () => {
  // Worst-case TCP fragmentation: each character is its own chunk.
  // The buffered parser must still emit the block correctly.
  const blob = 'event: wake\ndata: hi\n\n'
  const chunks = blob.split('').map((c) => c)
  const out = await collect(parseSseStream(asUint8Stream(chunks)))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'wake')
})

test('parseSseStream: partial UTF-8 split mid-codepoint preserves correct text', async () => {
  // The `🚀` rocket emoji is a 4-byte UTF-8 sequence. Splitting it
  // across two chunks WITHOUT TextDecoder({stream:true}) would yield
  // a U+FFFD replacement character. Confirm the rocket survives.
  const enc = new TextEncoder()
  const bytes = enc.encode('event: x\ndata: 🚀\n\n')
  // Split right inside the 4-byte rocket sequence.
  const splitPoint = bytes.indexOf(0xf0) + 2 // 0xf0 is the rocket's leading byte
  const part1 = bytes.slice(0, splitPoint)
  const part2 = bytes.slice(splitPoint)
  async function* yieldRaw(): AsyncGenerator<Uint8Array> {
    yield part1
    yield part2
  }
  const out = await collect(parseSseStream(yieldRaw()))
  assert.equal(out.length, 1)
  assert.equal(out[0].data, '🚀', 'rocket emoji survives partial-UTF-8 split')
})

test('parseSseStream: block terminator split across chunks (data + \\n + \\n separately)', async () => {
  // The double-newline that ends a block can itself be split.
  const out = await collect(parseSseStream(asUint8Stream([
    'event: wake\ndata: hi\n',
    '\n',
  ])))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'wake')
  assert.equal(out[0].data, 'hi')
})

test('parseSseStream: incomplete trailing block is buffered, NOT yielded', async () => {
  // Stream ends mid-block — we should NOT yield the partial event.
  // (In practice the network reconnects and a future chunk completes
  // the block, but here we assert that an incomplete trailer doesn't
  // fire prematurely.)
  const out = await collect(parseSseStream(asUint8Stream([
    'event: wake\ndata: hi\n', // no second \n
  ])))
  assert.equal(out.length, 0, 'incomplete block is held until termination')
})

// ── strings vs Uint8Array vs unknown ──────────────────────────────────

test('parseSseStream: accepts string chunks directly (for tests with no encoder)', async () => {
  async function* yieldStrings(): AsyncGenerator<string> {
    yield 'event: wake\ndata: hi\n\n'
  }
  const out = await collect(parseSseStream(yieldStrings()))
  assert.equal(out.length, 1)
})

test('parseSseStream: skips chunks of unknown types without crashing', async () => {
  async function* yieldMixed(): AsyncGenerator<unknown> {
    yield 42 // number — unknown type
    yield 'event: wake\ndata: ok\n\n'
    yield { not: 'a chunk' } // object — unknown type
  }
  const out = await collect(parseSseStream(yieldMixed()))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'wake')
})

// ── only-event, only-data, neither ────────────────────────────────────

test('parseSseStream: block with only `event:` (no data) is still yielded', async () => {
  const out = await collect(parseSseStream(asUint8Stream(['event: ping\n\n'])))
  assert.equal(out.length, 1)
  assert.equal(out[0].event, 'ping')
  assert.equal(out[0].data, undefined)
})

test('parseSseStream: an entirely-empty block is NOT yielded', async () => {
  // Two consecutive `\n\n` (a blank block) shouldn't surface as an
  // empty event — the upstream loop in pod-agent expects every
  // yielded event to carry SOMETHING.
  const out = await collect(parseSseStream(asUint8Stream(['\n\n'])))
  assert.equal(out.length, 0)
})

test('parseSseStream: block with only `id:` (no event, no data) is NOT yielded', async () => {
  // Implementation: yield iff event OR data present. id-only blocks
  // (rare; some servers send them as the last-event-id checkpoint)
  // are discarded by design.
  const out = await collect(parseSseStream(asUint8Stream(['id: checkpoint-42\n\n'])))
  assert.equal(out.length, 0)
})
