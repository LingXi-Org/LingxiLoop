import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ActionLedgerClaim, ActionLedgerPort } from '../agents/action-ledger.js'
import {
  type CommunicationAction,
  communicationActionToArgv,
  computeActionKey,
  computeInputScopeKey,
  executeCommunicationActions,
  LingxiGraphRequestError,
  parseLingxiGraphRunResult,
  runLingxiGraph,
  steerLingxiGraphRun,
  streamLingxiGraphRunEvents,
} from '../agents/lingxigraph-adapter.js'

const result = (actions: unknown[]) => ({
  version: 1,
  status: 'done',
  reason: 'handled',
  actions,
  modelCalls: [{ model: 'test-model', usage: null }],
})

test('strictly validates actions before execution', () => {
  assert.throws(() => parseLingxiGraphRunResult(result([
    { type: 'message.send', conversationId: 'c1', body: 'hello', shell: 'nope' },
  ])), /unsupported fields/)
  assert.throws(() => parseLingxiGraphRunResult(result([
    { type: 'unknown.action' },
  ])), /unsupported communication action/)
  assert.throws(() => parseLingxiGraphRunResult(result(Array.from({ length: 17 }, () => ({
    type: 'reaction.toggle', messageId: 'm1', emoji: '✅',
  })))), /at most 16/)
})

test('maps communication actions to argv without a shell or identity flag', () => {
  const cases: Array<[CommunicationAction, string[]]> = [
    [{ type: 'message.send', conversationId: 'c1', body: 'hi', quoteMessageId: 'm1' }, ['reply', 'c1', 'hi', '--quote', 'm1']],
    [{ type: 'reaction.toggle', messageId: 'm1', emoji: '✅' }, ['react', 'm1', '✅']],
    [{ type: 'conversation.dm.create', participantId: 'p2', topic: 'sync', openingMessage: 'hello' }, ['dm', 'p2', 'sync', 'hello']],
    [{ type: 'conversation.group.create', title: 'Launch', memberIds: ['p2', 'p3'], leaderId: 'p2', reason: 'ship', openingMessage: 'go' }, ['pull-group', 'Launch', '--members', 'p2,p3', '--leader', 'p2', '--reason', 'ship', '--say', 'go']],
    [{ type: 'email.send', to: ['a@example.com'], cc: ['b@example.com'], subject: 'S', body: 'B' }, ['email', 'send', '--to', 'a@example.com', '--cc', 'b@example.com', '--subject', 'S', '--body', 'B']],
    [{ type: 'poll.create', conversationId: 'c1', question: 'Q?', options: ['A', 'B'], mode: 'multi', expiresInMinutes: 10 }, ['poll', 'create', 'c1', 'Q?', 'A', 'B', '--mode', 'multi', '--expires-in', '10']],
    [{ type: 'document.create', title: 'SVM 学习笔记', content: '初稿' }, ['doc', 'create', 'SVM 学习笔记', '--body', '初稿']],
    [{ type: 'document.read', documentId: 'doc_1' }, ['doc', 'read', 'doc_1', '--json']],
    [{ type: 'document.update', documentId: 'doc_1', find: '旧', replace: '新' }, ['doc', 'replace', 'doc_1', '--find', '旧', '--replace', '新']],
    [{ type: 'document.append', documentId: 'doc_1', content: '补充' }, ['doc', 'append', 'doc_1', '补充']],
    [{ type: 'document.share', documentId: 'doc_1', conversationId: 'c1', comment: '学习笔记' }, ['doc', 'share', 'doc_1', '--conversation', 'c1', '--comment', '学习笔记']],
  ]
  for (const [action, argv] of cases) {
    const mapped = communicationActionToArgv(action)
    assert.deepEqual(mapped, argv)
    assert.equal(mapped.some((arg) => arg === '--as' || arg.startsWith('--as=')), false)
  }
})

test('stops at the first failed or HELD CLI result', async () => {
  const seen: string[][] = []
  const actions: CommunicationAction[] = [
    { type: 'reaction.toggle', messageId: 'm1', emoji: '👀' },
    { type: 'message.send', conversationId: 'c1', body: 'first' },
    { type: 'message.send', conversationId: 'c1', body: 'must not run' },
  ]
  const execution = await executeCommunicationActions({
    agentId: 'a1',
    inputScopeKey: 'scope1',
    actions,
    executeCli: async (argv) => {
      seen.push(argv)
      if (seen.length === 2) return { ok: false, exitCode: 2, text: 'HELD' }
      return { ok: true, exitCode: 0, text: 'ok' }
    },
  })
  assert.equal(execution.completed, false)
  assert.equal(execution.failedActionIndex, 1)
  assert.equal(seen.length, 2)
})

test('accepts a valid silent result', () => {
  assert.deepEqual(parseLingxiGraphRunResult(result([])).actions, [])
})

const request = {
  version: 1 as const, runId: 'r1',
  agent: { id: 'a1', name: 'Agent', role: 'tester', model: 'fake' },
  trigger: 'message.new' as const, systemPrompt: 'system', contextPrompt: 'context',
}

function fakeFetch(handler: (input: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: any, init?: RequestInit) => handler(String(input), init ?? {})) as typeof fetch
}

test('runtime adapter posts to /v1/turn and parses a valid response', async () => {
  let seenUrl = ''
  let seenAuth: string | null = null
  const output = await runLingxiGraph(request, {
    url: 'http://runtime.local:8124',
    token: 'secret',
    fetchImpl: fakeFetch((url, init) => {
      seenUrl = url
      seenAuth = (init.headers as Record<string, string>).authorization
      return new Response(JSON.stringify({ version: 1, status: 'done', reason: 'fake', actions: [], modelCalls: [] }), { status: 200 })
    }),
  })
  assert.equal(seenUrl, 'http://runtime.local:8124/v1/turn')
  assert.equal(seenAuth, 'Bearer secret')
  assert.equal(output.reason, 'fake')
})

test('runtime adapter converts a non-2xx response into an explicit error', async () => {
  await assert.rejects(runLingxiGraph(request, {
    url: 'http://runtime.local:8124',
    fetchImpl: fakeFetch(() => new Response('model failed', { status: 502 })),
  }), /responded 502/)
})

test('runtime adapter rejects malformed JSON bodies', async () => {
  await assert.rejects(runLingxiGraph(request, {
    url: 'http://runtime.local:8124',
    fetchImpl: fakeFetch(() => new Response('{bad json', { status: 200 })),
  }), /invalid LingxiGraph runtime response/)
})

test('runtime adapter rejects a response that fails schema validation', async () => {
  await assert.rejects(runLingxiGraph(request, {
    url: 'http://runtime.local:8124',
    fetchImpl: fakeFetch(() => new Response(JSON.stringify({ version: 1, status: 'nonsense', reason: 'x', actions: [], modelCalls: [] }), { status: 200 })),
  }), /invalid LingxiGraph runtime response/)
})

test('runtime adapter aborts via AbortController on timeout', async () => {
  await assert.rejects(runLingxiGraph(request, {
    url: 'http://runtime.local:8124',
    timeoutMs: 20,
    fetchImpl: fakeFetch((_url, init) => new Promise((_resolve, reject) => {
      const signal = init.signal as AbortSignal
      signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })),
  }), /timed out after 20ms/)
})

test('runtime adapter times out a response whose body never completes, even after headers arrive', async () => {
  // Regression: fetch() resolves as soon as headers land, so a hung or
  // slow-streaming body must still be bounded by the same timeout —
  // clearTimeout must not fire until response.text() has settled.
  await assert.rejects(runLingxiGraph(request, {
    url: 'http://runtime.local:8124',
    timeoutMs: 20,
    fetchImpl: fakeFetch((_url, init) => {
      const signal = init.signal as AbortSignal
      const response = {
        ok: true,
        status: 200,
        text: () => new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }),
      }
      return Promise.resolve(response as unknown as Response)
    }),
  }), /timed out after 20ms/)
})

test('steering adapter sends a stable Idempotency-Key and parses durable acceptance', async () => {
  let seenUrl = ''
  let seenKey = ''
  let seenBody: unknown
  const accepted = await steerLingxiGraphRun({
    runId: 'run/trusted',
    kind: 'message.new',
    payload: { messageId: 'm-1', body: 'follow up' },
    idempotencyKey: 'm-1',
  }, {
    url: 'http://runtime.local:8124',
    fetchImpl: fakeFetch((url, init) => {
      seenUrl = url
      seenKey = (init.headers as Record<string, string>)['idempotency-key']
      seenBody = JSON.parse(String(init.body))
      return new Response(JSON.stringify({
        id: 'steer-1', run_id: 'run/trusted', sequence: 3,
        status: 'pending', kind: 'message.new', created_at: '2026-08-21T00:00:00Z',
      }), { status: 202 })
    }),
  })
  assert.equal(seenUrl, 'http://runtime.local:8124/v1/runs/run%2Ftrusted/steer')
  assert.equal(seenKey, 'm-1')
  assert.deepEqual(seenBody, { kind: 'message.new', payload: { messageId: 'm-1', body: 'follow up' }, metadata: {} })
  assert.deepEqual(accepted, {
    outcome: 'accepted', eventId: 'steer-1', runId: 'run/trusted', sequence: 3,
    status: 'pending', kind: 'message.new',
  })
})

test('steering adapter classifies terminal/finalizing rejection as permanent', async () => {
  let calls = 0
  await assert.rejects(steerLingxiGraphRun({
    runId: 'r1', kind: 'message.new', payload: {}, idempotencyKey: 'm-1',
  }, {
    url: 'http://runtime.local:8124',
    fetchImpl: fakeFetch(() => {
      calls++
      return new Response(JSON.stringify({ code: 'run_finalizing', detail: 'no safe point remains', retryable: false }), { status: 409 })
    }),
  }), (error: unknown) => error instanceof LingxiGraphRequestError && error.code === 'run_finalizing' && !error.retryable)
  assert.equal(calls, 1)
})

test('steering adapter retries an ambiguous transient failure with the same key', async () => {
  const keys: string[] = []
  const result = await steerLingxiGraphRun({
    runId: 'r1', kind: 'message.new', payload: {}, idempotencyKey: 'm-stable',
  }, {
    url: 'http://runtime.local:8124',
    fetchImpl: fakeFetch((_url, init) => {
      keys.push((init.headers as Record<string, string>)['idempotency-key'])
      if (keys.length === 1) return new Response('temporary', { status: 503 })
      return new Response(JSON.stringify({ id: 's1', run_id: 'r1', sequence: 1, status: 'consumed', kind: 'message.new' }), { status: 202 })
    }),
  })
  assert.deepEqual(keys, ['m-stable', 'm-stable'])
  assert.equal(result.outcome, 'duplicate')
  assert.equal(result.status, 'consumed')
})

test('native SSE adapter resumes from Last-Event-ID and deduplicates sequences', async () => {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(
        ': heartbeat\n\n' +
        'id: 8\nevent: run.steer.accepted\ndata: {"run_id":"r1","sequence":8,"kind":"run.steer.accepted","data":{"steering_event_id":"s1"}}\n\n' +
        'id: 9\nevent: run.steer.consumed\ndata: {"run_id":"r1","sequence":9,"kind":"run.steer.consumed","data":{"steering_event_id":"s1"}}\n\n',
      ))
      controller.close()
    },
  })
  let lastEventId = ''
  const events: string[] = []
  const cursor = await streamLingxiGraphRunEvents('r1', (event) => { events.push(event.kind) }, {
    url: 'http://runtime.local:8124',
    lastEventId: 8,
    fetchImpl: fakeFetch((_url, init) => {
      lastEventId = (init.headers as Record<string, string>)['last-event-id']
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }),
  })
  assert.equal(lastEventId, '8')
  assert.deepEqual(events, ['run.steer.consumed'])
  assert.equal(cursor, 9)
})

test('native run adapter creates a Runtime run, consumes SSE, and reads authoritative output', async () => {
  const urls: string[] = []
  const events: string[] = []
  let runKey = ''
  let tenant = ''
  const encoder = new TextEncoder()
  const output = await runLingxiGraph({ ...request, tenantId: 'co-1' }, {
    url: 'http://native-runtime.local:8124',
    nativeRuns: true,
    onRunEvent: (event) => { events.push(event.kind) },
    fetchImpl: fakeFetch((url, init) => {
      urls.push(url)
      tenant = (init.headers as Record<string, string> | undefined)?.['x-tenant-id'] ?? tenant
      if (url.endsWith('/v1/assistants') && !init.method) return new Response('[]', { status: 200 })
      if (url.endsWith('/v1/assistants')) return new Response(JSON.stringify({ id: 'assistant-1' }), { status: 201 })
      if (url.endsWith('/v1/runs')) {
        runKey = (init.headers as Record<string, string>)['idempotency-key']
        return new Response(JSON.stringify({ id: 'runtime-run-1', status: 'pending' }), { status: 202 })
      }
      if (url.endsWith('/stream')) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('id: 1\nevent: run_completed\ndata: {"run_id":"runtime-run-1","sequence":1,"kind":"run_completed","data":{}}\n\n'))
            controller.close()
          },
        })
        return new Response(body, { status: 200 })
      }
      if (url.endsWith('/v1/runs/runtime-run-1')) {
        return new Response(JSON.stringify({ status: 'succeeded', output: { result: result([]) } }), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }),
  })
  assert.equal(output.reason, 'handled')
  assert.equal(tenant, 'co-1')
  assert.equal(runKey, 'lingxiloop-run:r1')
  assert.deepEqual(events, ['run_completed'])
  assert.equal(urls.some((url) => url.endsWith('/v1/runs/runtime-run-1/stream')), true)
})

/* ─── issue #7: action idempotency key generation ────────────────────── */

test('computeInputScopeKey is stable regardless of input order, and changes with new messages', () => {
  const scopeA = computeInputScopeKey(['m-2', 'm-1', 'm-3'])
  const scopeB = computeInputScopeKey(['m-1', 'm-3', 'm-2'])
  assert.equal(scopeA, scopeB, 'same message id set (any order) must yield the same scope key')

  const scopeWithNewMessage = computeInputScopeKey(['m-1', 'm-2', 'm-3', 'm-4'])
  assert.notEqual(scopeA, scopeWithNewMessage, 'a new message in the inbox must change the scope key')
})

test('computeActionKey is stable for the same (agent, scope, index, action) and changes when any of them change', () => {
  const scope = computeInputScopeKey(['m-1', 'm-2'])
  const action: CommunicationAction = { type: 'message.send', conversationId: 'c1', body: 'hello' }

  const keyA = computeActionKey({ agentId: 'agent-1', inputScopeKey: scope, actionIndex: 0, action })
  const keyB = computeActionKey({ agentId: 'agent-1', inputScopeKey: scope, actionIndex: 0, action })
  assert.equal(keyA, keyB, 'identical inputs must produce identical keys — this is the retry-safety property')

  const differentAgent = computeActionKey({ agentId: 'agent-2', inputScopeKey: scope, actionIndex: 0, action })
  assert.notEqual(keyA, differentAgent)

  const newScope = computeInputScopeKey(['m-1', 'm-2', 'm-3'])
  const differentScope = computeActionKey({ agentId: 'agent-1', inputScopeKey: newScope, actionIndex: 0, action })
  assert.notEqual(keyA, differentScope, 'a new inbox scope must be free to repeat the same action content')

  const differentIndex = computeActionKey({ agentId: 'agent-1', inputScopeKey: scope, actionIndex: 1, action })
  assert.notEqual(keyA, differentIndex, 'two identical actions in one batch must get different keys via actionIndex')

  const differentBody: CommunicationAction = { type: 'message.send', conversationId: 'c1', body: 'goodbye' }
  const differentAction = computeActionKey({ agentId: 'agent-1', inputScopeKey: scope, actionIndex: 0, action: differentBody })
  assert.notEqual(keyA, differentAction)
})

test('computeActionKey ignores JSON key order (canonical serialization)', () => {
  const scope = 'scope-1'
  const a: CommunicationAction = { type: 'message.send', conversationId: 'c1', body: 'hi', quoteMessageId: 'm9' }
  // Same field values, constructed with a different insertion order — the
  // canonical serializer must hash these identically.
  const b: CommunicationAction = { quoteMessageId: 'm9', body: 'hi', conversationId: 'c1', type: 'message.send' } as CommunicationAction
  const keyA = computeActionKey({ agentId: 'a1', inputScopeKey: scope, actionIndex: 0, action: a })
  const keyB = computeActionKey({ agentId: 'a1', inputScopeKey: scope, actionIndex: 0, action: b })
  assert.equal(keyA, keyB)
})

/* ─── issue #7: ledger-backed replay skips the real executor ─────────── *
 * Only for action types WITHOUT their own sink-level idempotency — see
 * the "single-owner" tests further down for message.send / reaction.toggle,
 * which must bypass this generic ledger entirely (PR review P0-1). */

function fakeLedger(): { port: ActionLedgerPort; claims: string[] } {
  const store = new Map<string, ActionLedgerClaim & { key: string }>()
  const claims: string[] = []
  const port: ActionLedgerPort = {
    async claim(args) {
      claims.push(args.key)
      const existing = store.get(args.key)
      if (existing && existing.claimed === false) return existing
      return { claimed: true }
    },
    async markSucceeded(key, result) {
      store.set(key, { claimed: false, status: 'succeeded', result, key })
    },
    async markFailed() { /* not needed for this test */ },
  }
  return { port, claims }
}

test('a succeeded ledger entry replays its stored result without calling the real executor again', async () => {
  const { port: ledger } = fakeLedger()
  // conversation.leave has no sink-level idempotency of its own, so it's
  // the generic ledger's job (not the sink's) to prevent a replay.
  const actions: CommunicationAction[] = [{ type: 'conversation.leave', conversationId: 'c1' }]
  let executeCliCalls = 0

  const first = await executeCommunicationActions({
    agentId: 'agent-1',
    inputScopeKey: 'scope-1',
    actions,
    ledger,
    executeCli: async () => {
      executeCliCalls++
      return { ok: true, exitCode: 0, text: 'left c1' }
    },
  })
  assert.equal(first.completed, true)
  assert.equal(executeCliCalls, 1)

  // Simulate a retry / duplicate wake against the SAME input scope: same
  // agent, same scope, same action ⇒ same idempotency key ⇒ the ledger
  // already has it as succeeded ⇒ the real executor must NOT run again.
  const retry = await executeCommunicationActions({
    agentId: 'agent-1',
    inputScopeKey: 'scope-1',
    actions,
    ledger,
    executeCli: async () => {
      executeCliCalls++
      return { ok: true, exitCode: 0, text: 'left c1 (again)' }
    },
  })
  assert.equal(retry.completed, true)
  assert.equal(executeCliCalls, 1, 'succeeded ledger replay must skip the real executor')
  assert.deepEqual(retry.results[0], { ok: true, exitCode: 0, text: 'left c1' })
})

test('a new input scope is free to repeat the same action content as a fresh execution', async () => {
  const { port: ledger } = fakeLedger()
  const actions: CommunicationAction[] = [{ type: 'conversation.leave', conversationId: 'c1' }]
  let executeCliCalls = 0
  const run = (inputScopeKey: string) => executeCommunicationActions({
    agentId: 'agent-1',
    inputScopeKey,
    actions,
    ledger,
    executeCli: async () => {
      executeCliCalls++
      return { ok: true, exitCode: 0, text: `left c1 (${executeCliCalls})` }
    },
  })

  await run('scope-1')
  await run('scope-2')
  assert.equal(executeCliCalls, 2, 'a genuinely new inbox scope must not be deduped against an old one')
})

/* ─── issue #7 review (P0-1 / P0-2): single-owner sink idempotency ────── */

test('communicationActionToArgv never carries the idempotency key — it must travel out-of-band, not via argv', () => {
  // Regression for PR review P0-2: an argv flag is settable by any
  // legacy/bash-tool caller, human CLI, or BYOA pod, not just the trusted
  // executor. There must be no code path that puts the key in argv.
  const send = communicationActionToArgv({ type: 'message.send', conversationId: 'c1', body: 'hi' })
  assert.deepEqual(send, ['reply', 'c1', 'hi'])
  assert.equal(send.some((a) => a.includes('idempotency')), false)

  const react = communicationActionToArgv({ type: 'reaction.toggle', messageId: 'm1', emoji: '✅' })
  assert.deepEqual(react, ['react', 'm1', '✅'])
})

test('message.send and reaction.toggle receive the idempotency key via the internal (out-of-band) executeCli param, and skip the generic ledger entirely', async () => {
  const { port: ledger, claims } = fakeLedger()
  const actions: CommunicationAction[] = [
    { type: 'message.send', conversationId: 'c1', body: 'hi' },
    { type: 'reaction.toggle', messageId: 'm1', emoji: '✅' },
  ]
  const calls: Array<{ argv: string[]; internal?: { idempotencyKey?: string; deferReadCursor?: boolean } }> = []

  await executeCommunicationActions({
    agentId: 'agent-1',
    inputScopeKey: 'scope-1',
    actions,
    ledger,
    executeCli: async (argv, internal) => {
      calls.push({ argv, internal })
      return { ok: true, exitCode: 0, text: 'ok' }
    },
  })

  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.argv.some((a) => a.includes('idempotency')), false, 'argv must never carry the key')
    assert.ok(call.internal?.idempotencyKey, 'the internal param must carry the key for a P0 sink-owned action')
  }
  assert.equal(calls[0].internal?.deferReadCursor, true, 'structured message.send must defer cursor ownership to the turn')
  assert.equal(calls[1].internal?.deferReadCursor, undefined, 'reaction.toggle does not mutate the read cursor')
  // PR review P0-1: the generic ledger must never be consulted for these
  // two action types — claiming here BEFORE the sink's own transaction
  // would pre-insert a 'pending' row that the sink's atomic claim then
  // finds already taken, self-conflicting on the very first execution.
  assert.deepEqual(claims, [], 'the generic ledger must not be claimed for sink-owned action types')
})
