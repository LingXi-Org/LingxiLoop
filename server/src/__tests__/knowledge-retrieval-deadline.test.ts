import assert from 'node:assert/strict'
import { mock, test } from 'node:test'

test('native retrieval shares the context deadline, cancels stalled vector work and preserves evidence', { timeout: 60_000 }, async context => {
  const access = await import('../modules/access/public.js')
  const assertCan = mock.fn(async () => {})
  mock.module('../modules/access/public.js', { namedExports: { ...access,
    createPermissionService: () => ({ assertCan, can: async () => ({ allowed: false }) }) } })
  const { pool } = await import('../db/pool.js')
  const { openNotebookClient, OpenNotebookError } = await import('../modules/knowledge/provider.js')
  const { retrieveKnowledgeState } = await import('../modules/knowledge/runtime.js')
  const previous = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  const query = async (sql: string) => {
    if (sql.includes('FROM conversations')) return { rows: [{ project_id: 'project' }] }
    if (sql.includes('FROM knowledge_sources')) return { rows: [{ id: 'source', title: 'TCP notes',
      status: 'ready', external_source_id: 'external-source', original_url: null, excluded: false }] }
    if (sql.includes('FROM knowledge_notebook_bindings')) return { rows: [{ external_notebook_id: 'notebook', state: 'ready' }] }
    if (sql.includes('pg_advisory_')) return { rows: [] }
    throw Error('unexpected retrieval query')
  }
  mock.method(pool, 'query', query)
  mock.method(pool, 'connect', async () => ({ query, release() {} }))
  const input = { companyId: 'company', conversationId: 'room', authorizationUserId: 'human', query: 'TCP retransmission' }
  const timeouts: Array<number | undefined> = []
  const search = mock.method(openNotebookClient, 'search', async (request: Parameters<typeof openNotebookClient.search>[0]) => {
    timeouts.push(request.timeoutMs)
    return [{ parent_id: 'external-source', id: 'chunk', content: 'A TCP segment is retransmitted.' }]
  })
  try {
    const result = await retrieveKnowledgeState(input)
    assert.equal(result.status, 'matched')
    assert.equal(result.citations.length, 1, 'hybrid duplicates retain one citation')
    assert.deepEqual(timeouts, [5_000, 5_000], 'tool retrieval must not inherit the provider 90s default')
    timeouts.length = 0
    await retrieveKnowledgeState({ ...input, searchTimeoutMs: 1_000 })
    assert.deepEqual(timeouts, [1_000, 1_000], 'a tighter existing caller deadline is preserved')
    assert.equal(assertCan.mock.callCount(), 4, 'both calls reauthorize before and after search')
    search.mock.restore()

    // Use the real provider adapter and its AbortSignal deadline. Scale only the
    // deadline clock 1:100, not the configured values, to qualify 20 paired
    // old/candidate samples without waiting 30+ minutes or making network calls.
    const nativeTimeout = AbortSignal.timeout.bind(AbortSignal)
    mock.method(AbortSignal, 'timeout', (ms: number) => nativeTimeout(ms / 100))
    let active = 0, requests = 0, abortedHeaders = 0, abortedBodies = 0
    let vectorMode: 'headers' | 'body' = 'headers'
    let stalledModes = new Set(['vector'])
    const hit = { parent_id: 'external-source', id: 'tcp-chunk', content: 'TCP uses retransmission.' }
    mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
      requests++
      const body = JSON.parse(String(init?.body)) as { type: string }
      if (!stalledModes.has(body.type)) return Response.json({ results: [hit,
        { parent_id: 'external-private', id: 'private-chunk', content: 'PRIVATE' }] })
      const signal = init?.signal
      assert.ok(signal)
      signal.throwIfAborted()
      active++
      // Keep the fake transport alive until cancellation, as a real socket would.
      let abort: () => void
      const guard = setTimeout(() => { throw Error('search failed to cancel the fake transport') }, 2_000)
      const finish = () => { active--; clearTimeout(guard); signal.removeEventListener('abort', abort) }
      if (vectorMode === 'headers') return new Promise<Response>((_resolve, reject) => {
        abort = () => { finish(); abortedHeaders++; reject(signal.reason) }
        signal.addEventListener('abort', abort, { once: true })
      })
      return new Response(new ReadableStream({ start(controller) {
        abort = () => { finish(); abortedBodies++; controller.error(signal.reason) }
        signal.addEventListener('abort', abort, { once: true })
        controller.enqueue(new TextEncoder().encode('{"results":['))
      } }), { headers: { 'content-type': 'application/json' } })
    })
    const samples: Array<{ baselineMs: number; candidateMs: number }> = []
    for (let i = 0; i < 20; i++) {
      vectorMode = i % 2 ? 'body' : 'headers'
      const pair: { baselineMs: number; candidateMs: number } = { baselineMs: 0, candidateMs: 0 }
      for (const mode of ['baseline', 'candidate'] as const) {
        const started = performance.now()
        // Reproduce the old implicit 90s default explicitly; all other inputs,
        // adapter code, source scope, text hits and transport behavior are equal.
        const result = await retrieveKnowledgeState({ ...input, ...(mode === 'baseline' ? { searchTimeoutMs: 90_000 } : {}) })
        pair[`${mode}Ms`] = performance.now() - started
        assert.equal(result.status, 'degraded')
        assert.deepEqual(result.searchFailures, [{ type: 'vector', code: 'search_timeout' }])
        assert.deepEqual(result.citations.map(value => [value.sourceId, value.chunkId, value.marker]), [['source', 'tcp-chunk', 'S1']])
        assert.doesNotMatch(JSON.stringify(result), /PRIVATE|private-chunk/)
        assert.equal(active, 0, 'no orphan transport after returning retained text')
      }
      samples.push(pair)
    }
    const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1]
    const baseline = { p50Ms: percentile(samples.map(s => s.baselineMs), .5), p95Ms: percentile(samples.map(s => s.baselineMs), .95) }
    const candidate = { p50Ms: percentile(samples.map(s => s.candidateMs), .5), p95Ms: percentile(samples.map(s => s.candidateMs), .95) }
    assert.ok(candidate.p95Ms < baseline.p50Ms * .4, 'candidate keeps slow vectors from holding text for the old deadline')
    assert.equal(requests, 80)
    assert.equal(abortedHeaders, 20)
    assert.equal(abortedBodies, 20)
    assert.equal(assertCan.mock.callCount(), 84, 'every degraded sample reauthorizes before returning')
    context.diagnostic('retrieval-deadline/v1 ' + JSON.stringify({ synthetic: true, samples: 20, deadlineClockScale: .01,
      configuredDeadlinesMs: { baseline: 90_000, candidate: 5_000 }, baseline, candidate,
      transportRequests: requests, realProviderCalls: 0, successfulPartialResults: 40,
      abortedHeaders, abortedBodies, completeReplyOrVisibleFirstText: 'not_measured' }))

    const cancellation = new AbortController()
    const pending = retrieveKnowledgeState({ ...input, signal: cancellation.signal })
    const cancel = setTimeout(() => cancellation.abort(), 5)
    await assert.rejects(pending, { name: 'AbortError' })
    clearTimeout(cancel)
    assert.equal(active, 0, 'caller cancellation also stops the vector body')
    stalledModes = new Set(['text'])
    const vectorOnly = await retrieveKnowledgeState(input)
    assert.equal(vectorOnly.status, 'degraded')
    assert.deepEqual(vectorOnly.searchFailures, [{ type: 'text', code: 'search_timeout' }])
    assert.equal(vectorOnly.citations[0].chunkId, 'tcp-chunk', 'healthy vector results survive a text timeout too')
    assert.equal(active, 0)
    stalledModes = new Set(['text', 'vector'])
    const unavailable = await retrieveKnowledgeState(input)
    assert.equal(unavailable.status, 'unavailable')
    assert.deepEqual(unavailable.citations, [])
    assert.deepEqual(unavailable.searchFailures, [{ type: 'text', code: 'search_timeout' }, { type: 'vector', code: 'search_timeout' }])
    assert.equal(active, 0)
    stalledModes = new Set(['vector'])
    let checks = 0
    assertCan.mock.mockImplementation(async () => { if (++checks === 2) throw Error('reader revoked during retrieval') })
    await assert.rejects(retrieveKnowledgeState(input), /reader revoked/)
    assert.equal(active, 0)
    assertCan.mock.mockImplementation(async () => {})
    // Closed timeout classification comes from the adapter, never from an
    // arbitrary provider message which happens to contain the word timeout.
    const { knowledgeSearchFailure } = await import('../modules/knowledge/provider.js')
    assert.equal(knowledgeSearchFailure('vector', new OpenNotebookError('private timeout detail')).code, 'notebook_unavailable')
  } finally {
    if (previous === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED
    else process.env.OPEN_NOTEBOOK_ENABLED = previous
    mock.restoreAll()
  }
})
