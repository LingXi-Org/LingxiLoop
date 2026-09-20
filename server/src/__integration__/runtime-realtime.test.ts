import assert from 'node:assert/strict'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import IORedis from 'ioredis'
import { createRealtimeStore } from '../agent-runtime/realtime-store.js'

test('shares fenced drafts across nodes, isolates identities, recovers lost cache and pubsub, and releases subscriptions',
  { skip: !process.env.LINGXIOS_TEST_REDIS_URL && 'set LINGXIOS_TEST_REDIS_URL to a disposable local Redis for fault injection' }, async () => {
  const url = process.env.LINGXIOS_TEST_REDIS_URL
  assert.ok(url, 'LINGXIOS_TEST_REDIS_URL must refer to a disposable Redis')
  assert.equal(new URL(url).hostname, '127.0.0.1', 'fault injection requires a local disposable Redis')
  const redis = new IORedis(url), a = createRealtimeStore(url), b = createRealtimeStore(url)
  const signal = AbortSignal.timeout(20000)
  const wait = async (check: () => Promise<boolean>) => {
    while (!await check()) { signal.throwIfAborted(); await delay(20) }
  }
  const identity = { tenantId: 'test-tenant', agentId: 'agent', sessionId: 'session', principalId: 'human', threadId: 'thread', runId: 'run' }
  let count = 0
  try {
    await wait(async () => { try { await a.read(identity, signal); await b.read(identity, signal); return true } catch { return false } })
    const disposeA = await a.subscribe(identity, () => { count++ }, signal)
    const disposeB = await b.subscribe(identity, () => { count++ }, signal)
    const reset = { requestVersion: 1, attemptId: 'attempt', seq: 1, kind: 'reset' as const, text: '' }
    assert.equal(await a.update(identity, 'owner', 1, reset, undefined, signal), 'applied')
    const delta = { ...reset, seq: 2, kind: 'delta' as const, text: '共享正文' }
    assert.equal(await a.update(identity, 'owner', 1, delta, undefined, signal), 'applied')
    await wait(async () => count >= 2)
    assert.deepEqual(await b.read(identity, signal), { runId: 'run', fence: 1, requestVersion: 1, attemptId: 'attempt', seq: 2, draft: '共享正文' })
    for (const scope of ['tenantId', 'agentId', 'sessionId', 'principalId', 'threadId', 'runId']) assert.equal(await b.read({ ...identity, [scope]: 'other' }, signal), null)
    assert.equal(await b.update(identity, 'intruder', 1, { ...delta, seq: 3 }, undefined, signal), 'stale')
    assert.equal(await a.update(identity, 'owner', 1, delta, undefined, signal), 'stale')
    assert.equal(await a.update(identity, 'owner', 1, { ...delta, seq: 4 }, undefined, signal), 'missing')
    assert.equal((await b.read(identity, signal))?.draft, '共享正文')
    assert.equal(await b.update(identity, 'new-owner', 2, reset, undefined, signal), 'applied')
    await a.clear(identity, 'owner', 1, signal)
    assert.equal((await a.read(identity, signal))?.fence, 2)
    assert.equal(await a.update(identity, 'owner', 1, { ...delta, seq: 50 }, undefined, signal), 'stale')
    assert.equal(await b.update(identity, 'new-owner', 2, delta, undefined, signal), 'applied')
    const snapshot = (await b.read(identity, signal))!
    const keys = await redis.keys('lingxios:preview:*')
    await redis.del(...keys)
    assert.equal(await a.read(identity, signal), null)
    assert.equal(await b.update(identity, 'new-owner', 2, { ...delta, seq: 3, text: '继续' }, undefined, signal), 'missing')
    const continued = { ...snapshot, seq: 3, draft: '共享正文继续' }
    assert.equal(await b.update(identity, 'new-owner', 2, { ...delta, seq: 3, text: '继续' }, continued, signal), 'applied')
    assert.deepEqual(await a.read(identity, signal), continued)
    const priorCount = count
    await redis.call('CLIENT', 'KILL', 'TYPE', 'pubsub')
    await wait(async () => count > priorCount)
    assert.deepEqual(await a.read(identity, signal), continued)
    await b.clear(identity, 'new-owner', 2, signal)
    assert.equal(await a.read(identity, signal), null)
    disposeA(); disposeA(); disposeB()
    await wait(async () => (await redis.call('PUBSUB', 'CHANNELS', 'lingxios:preview:*') as string[]).length === 0)
    for (const key of await redis.keys('lingxios:preview:*')) await redis.del(key)
  } finally { a.close(); b.close(); redis.disconnect() }
})
