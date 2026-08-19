import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ActionLedgerClaim, ActionLedgerPort } from '../agents/action-ledger.js'
import {
  type CommunicationAction,
  communicationActionToArgv,
  computeActionKey,
  computeInputScopeKey,
  executeCommunicationActions,
  parseLingxiGraphRunResult,
  runLingxiGraph,
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
    [{ type: 'conversation.group.create', title: 'Launch', memberIds: ['p2', 'p3'], reason: 'ship', openingMessage: 'go' }, ['pull-group', 'Launch', '--members', 'p2,p3', '--reason', 'ship', '--say', 'go']],
    [{ type: 'email.send', to: ['a@example.com'], cc: ['b@example.com'], subject: 'S', body: 'B' }, ['email', 'send', '--to', 'a@example.com', '--cc', 'b@example.com', '--subject', 'S', '--body', 'B']],
    [{ type: 'poll.create', conversationId: 'c1', question: 'Q?', options: ['A', 'B'], mode: 'multi', expiresInMinutes: 10 }, ['poll', 'create', 'c1', 'Q?', 'A', 'B', '--mode', 'multi', '--expires-in', '10']],
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

/* ─── issue #7: ledger-backed replay skips the real executor ─────────── */

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
  const actions: CommunicationAction[] = [{ type: 'message.send', conversationId: 'c1', body: 'hello' }]
  let executeCliCalls = 0

  const first = await executeCommunicationActions({
    agentId: 'agent-1',
    inputScopeKey: 'scope-1',
    actions,
    ledger,
    executeCli: async () => {
      executeCliCalls++
      return { ok: true, exitCode: 0, text: 'sent (m-1, seq 1)' }
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
      return { ok: true, exitCode: 0, text: 'sent (m-2, seq 2)' }
    },
  })
  assert.equal(retry.completed, true)
  assert.equal(executeCliCalls, 1, 'succeeded ledger replay must skip the real executor')
  assert.deepEqual(retry.results[0], { ok: true, exitCode: 0, text: 'sent (m-1, seq 1)' })
})

test('a new input scope is free to repeat the same action content as a fresh execution', async () => {
  const { port: ledger } = fakeLedger()
  const actions: CommunicationAction[] = [{ type: 'message.send', conversationId: 'c1', body: 'hello' }]
  let executeCliCalls = 0
  const run = (inputScopeKey: string) => executeCommunicationActions({
    agentId: 'agent-1',
    inputScopeKey,
    actions,
    ledger,
    executeCli: async () => {
      executeCliCalls++
      return { ok: true, exitCode: 0, text: `sent (m-${executeCliCalls}, seq ${executeCliCalls})` }
    },
  })

  await run('scope-1')
  await run('scope-2')
  assert.equal(executeCliCalls, 2, 'a genuinely new inbox scope must not be deduped against an old one')
})

test('communicationActionToArgv only carries the internal idempotency key on the P0 sink action types', () => {
  const send = communicationActionToArgv({ type: 'message.send', conversationId: 'c1', body: 'hi' }, 'key-1')
  assert.deepEqual(send, ['reply', 'c1', 'hi', '--idempotency-key', 'key-1'])

  const react = communicationActionToArgv({ type: 'reaction.toggle', messageId: 'm1', emoji: '✅' }, 'key-2')
  assert.deepEqual(react, ['react', 'm1', '✅', '--idempotency-key', 'key-2'])

  const dm = communicationActionToArgv({ type: 'conversation.dm.create', participantId: 'p2', topic: 't', openingMessage: 'hi' }, 'key-3')
  assert.deepEqual(dm, ['dm', 'p2', 't', 'hi'], 'non-P0 action types must not carry the internal flag')
})
