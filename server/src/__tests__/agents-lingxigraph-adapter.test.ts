import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  communicationActionToArgv,
  executeCommunicationActions,
  parseLingxiGraphRunResult,
  runLingxiGraph,
  type CommunicationAction,
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
  const execution = await executeCommunicationActions(actions, async (argv) => {
    seen.push(argv)
    if (seen.length === 2) return { ok: false, exitCode: 2, text: 'HELD' }
    return { ok: true, exitCode: 0, text: 'ok' }
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
