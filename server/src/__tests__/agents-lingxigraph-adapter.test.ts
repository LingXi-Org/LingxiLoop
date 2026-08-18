import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

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

const fakeRunner = fileURLToPath(new URL('./fixtures/fake-lingxigraph-runner.cjs', import.meta.url))
const request = {
  version: 1 as const, runId: 'r1',
  agent: { id: 'a1', name: 'Agent', role: 'tester', model: 'fake' },
  trigger: 'message.new' as const, systemPrompt: 'system', contextPrompt: 'context',
}

test('runner adapter accepts one JSON response', async () => {
  const output = await runLingxiGraph(request, { pythonBin: process.execPath, runnerPath: fakeRunner })
  assert.equal(output.reason, 'fake')
})

for (const [mode, pattern, options] of [
  ['nonzero', /exited 7: model failed/, {}],
  ['invalid', /invalid LingxiGraph runner output/, {}],
  ['oversized', /output exceeded/, { maxOutputBytes: 100 }],
  ['delay', /timed out/, { timeoutMs: 20 }],
] as const) {
  test(`runner adapter rejects ${mode}`, async () => {
    await assert.rejects(runLingxiGraph(request, {
      pythonBin: process.execPath, runnerPath: fakeRunner,
      env: { FAKE_LINGXIGRAPH_MODE: mode }, ...options,
    }), pattern)
  })
}
