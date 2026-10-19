import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { fixture, frames, stream } from './fixtures.js'

// In-process synthetic fixture: no credentials, database, provider or Redis use.
// Explicit test-only settings prevent accidental use of developer configuration.
Object.assign(process.env, { DOTENV_CONFIG_PATH: '/dev/null', NODE_ENV: 'test',
  DATABASE_URL: 'postgres://fixture@127.0.0.1:1/perf_test', REDIS_URL: 'redis://127.0.0.1:1',
  WUKONG_USER_TOKEN_SECRET: 'synthetic-perf-fixture', OPENAI_API_KEY: 'synthetic-perf-fixture',
  OPENAI_EMBEDDING_MODEL: 'synthetic', OPENAI_BASE_URL: 'http://127.0.0.1:1' })
const source = resolve(process.argv[2] ?? '.')
const kind = process.argv[3] === 'long' ? 'long' : 'short'
const { assistantRunResponse, RunStreamProjection } = await import(pathToFileURL(resolve(source, 'server/src/agent-runtime/assistant-transport.ts')).href)
const { events, body } = fixture(kind), bytes = frames(events)

async function measure(counters: boolean) {
  global.gc?.()
  let stringifyCalls = 0, serializedChars = 0, projections = 0
  const original = JSON.stringify
  if (counters) JSON.stringify = ((...args: Parameters<typeof JSON.stringify>) => {
    const result = Reflect.apply(original, JSON, args)
    stringifyCalls++; serializedChars += result?.length ?? 0
    return result
  }) as typeof JSON.stringify
  const descriptor = Object.getOwnPropertyDescriptor(RunStreamProjection.prototype, 'snapshot')!
  if (counters) Object.defineProperty(RunStreamProjection.prototype, 'snapshot', { ...descriptor, get() { projections++; return descriptor.get!.call(this) } })
  const startMemory = process.memoryUsage(), cpu = process.cpuUsage(), start = performance.now()
  let firstStateMs: number | null = null, firstBodyMs: number | null = null, chunks = 0, wireBytes = 0
  let peakHeapBytes = startMemory.heapUsed, peakRssBytes = startMemory.rss
  const hash = createHash('sha256'), tracker = new AssistantTransportDeltaTracker()
  try {
    const response = assistantRunResponse(stream(bytes), new RunStreamProjection('run', true))
    const counted = new Response(response.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
      wireBytes += chunk.byteLength; hash.update(chunk); controller.enqueue(chunk)
    } })), { headers: response.headers })
    for await (const chunk of AssistantStream.fromResponse(counted, new AssistantTransportDecoder())) {
      if (chunk.type !== 'update-state') continue
      tracker.append(chunk.operations); chunks++
      firstStateMs ??= performance.now() - start
      const state = tracker.state as unknown as { message: { content: { type: string; text?: string }[] } }
      if (state.message.content.some(part => part.type === 'text' && part.text)) firstBodyMs ??= performance.now() - start
      if (chunks % 20 === 0) {
        const memory = process.memoryUsage(); peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed); peakRssBytes = Math.max(peakRssBytes, memory.rss)
      }
    }
    const totalMs = performance.now() - start, elapsedCpu = process.cpuUsage(cpu)
    const final = tracker.state as unknown as { message: { content: { type: string; text?: string }[]; status: { type: string } } }
    assert.equal(final.message.content.filter(part => part.type === 'text').map(part => part.text).join(''), body)
    assert.equal(final.message.status.type, 'complete')
    return { firstStateMs, firstBodyMs, totalMs, cpuUserMs: elapsedCpu.user / 1000, cpuSystemMs: elapsedCpu.system / 1000,
      heapStartBytes: startMemory.heapUsed, peakHeapBytes, peakRssBytes, wireBytes, chunks, wireSha256: hash.digest('hex'),
      requests: 0, databaseQueries: 0, ...(counters ? { stringifyCalls, serializedChars, projections } : {}) }
  } finally {
    JSON.stringify = original
    Object.defineProperty(RunStreamProjection.prototype, 'snapshot', descriptor)
  }
}
await measure(false) // identical warmup in each fresh process
const timing = await measure(false)
const counts = await measure(true) // invasive instrumentation is excluded from timing
console.log(JSON.stringify({ kind, timing, counts: { stringifyCalls: counts.stringifyCalls, serializedChars: counts.serializedChars,
  projections: counts.projections, wireBytes: counts.wireBytes, chunks: counts.chunks },
  timingScope: 'in-process public projection, encoder, decoder and state tracker; not model TTFT or browser paint' }))
