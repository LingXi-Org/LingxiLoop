// Public SDK + real disposable PostgreSQL and a test-owned, nonpersistent Redis.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { Pool } from 'pg'
import { createLingxiOS, packageResources } from '@lyyzka/lingxios'
import IORedis from 'ioredis'
import { createRealtimeStore } from '../server/src/agent-runtime/realtime-store.ts'

const databaseUrl = new URL(process.env.LINGXIOS_BENCH_DATABASE_URL)
assert.equal(databaseUrl.hostname, '127.0.0.1', 'requires disposable local PostgreSQL')
const id = randomUUID().replaceAll('-', ''), container = `runtime-realtime-${id}`
const admin = new Pool({ connectionString: databaseUrl.href, max: 1 })
const apps = [], stores = [], streams = [], uploads = []
let pool, redis
async function docker(...args) {
  const child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', value => { output += value }); child.stderr.on('data', value => { output += value })
  assert.equal((await once(child, 'exit'))[0], 0, output)
  return output.trim()
}
async function wait(check) {
  const deadline = performance.now() + 15000
  while (!await check()) { assert.ok(performance.now() < deadline, 'realtime condition timed out'); await delay(25) }
}
async function subscribe(app, identity, lastEventId) {
  const stop = new AbortController(), events = []
  const response = await app.streamRun(identity, { signal: stop.signal, lastEventId })
  assert.equal(response.headers.get('x-accel-buffering'), 'no')
  const done = (async () => {
    try {
      for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
        for (const line of chunk.split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)))
      }
    } catch (error) { if (!stop.signal.aborted) throw error }
  })()
  void done.catch(() => {})
  const stream = { events, done, close: async () => { stop.abort(); await done } }
  streams.push(stream)
  return stream
}
function upload(host, work) {
  const queue = [], signal = AbortSignal.timeout(60000)
  let wake, closed = false
  const task = host.streamPreview(work, (async function* () {
    while (!closed || queue.length) {
      if (queue.length) yield queue.shift()
      else await new Promise(resolve => { wake = resolve })
    }
  })(), signal)
  void task.catch(() => {})
  const result = { send(frame) { queue.push(frame); wake?.() }, async close() { closed = true; wake?.(); await task } }
  uploads.push(result)
  return result
}
const preview = (events, text) => events.some(item => item.type === 'preview' && (item.preview.draft === text || item.preview.delta === text))
try {
  await admin.query(`CREATE DATABASE realtime_${id}`)
  databaseUrl.pathname = `/realtime_${id}`
  pool = new Pool({ connectionString: databaseUrl.href, max: 12 })
  await pool.query(await readFile(packageResources().schema, 'utf8'))
  await docker('run', '-d', '--name', container, '-p', '127.0.0.1:54348:6379', 'redis:7-alpine', 'redis-server', '--save', '', '--appendonly', 'no')
  const port = (await docker('port', container, '6379/tcp')).split(':').at(-1)
  const url = `redis://127.0.0.1:${port}`
  redis = new IORedis(url); redis.on('error', () => {})
  for (let index = 0; index < 2; index++) {
    const store = createRealtimeStore(url); stores.push(store)
    apps.push(await createLingxiOS({ database: pool, realtime: { store, allowDraft: () => true, maxSubscribers: 4 } }))
  }
  const signal = AbortSignal.timeout(120000)
  await wait(async () => { try { await stores[0].read({ runId: id }, signal); return true } catch { return false } })
  for (let writer = 0; writer < 2; writer++) {
    const identity = { runId: `run-${writer}`, tenantId: id, agentId: 'agent', sessionId: `session-${writer}`, principalId: 'human' }
    await apps[0].enqueue({ ...identity, id: identity.runId, text: 'Stream the fixture.' })
    const host = apps[writer].connectWorker({ workerId: `worker-${writer}`, workKinds: ['turn'] })
    const work = await host.claimWork(); assert.equal(work.id, identity.runId)
    const readers = await Promise.all([subscribe(apps[0], identity), subscribe(apps[1], identity), subscribe(apps[1], identity)])
    const sender = upload(host, work)
    let seq = 0
    const send = (kind, text, requestVersion = 1) => sender.send({ kind, text, seq: ++seq, requestVersion, attemptId: 'attempt' })
    send('reset', ''); send('delta', 'before')
    await wait(async () => readers.every(reader => preview(reader.events, 'before')))
    await host.emitEvent(work, { runId: work.id, seq: 1, kind: 'fixture.first', stage: 'completed', visibility: 'user', data: {} })
    await wait(async () => readers.every(reader => reader.events.some(item => item.type === 'event')))
    const cursor = readers[0].events.find(item => item.type === 'event').event.seq
    await readers[0].close()
    const resumed = await subscribe(apps[1], identity, String(cursor))
    await wait(async () => preview(resumed.events, 'before'))
    assert.equal(resumed.events.filter(item => item.type === 'event').length, 0)
    await assert.rejects(apps[0].streamRun({ ...identity, principalId: 'stranger' }), /identity/)
    // An unread client occupies one bounded slot and must release it on cancel.
    const slow = await apps[1].streamRun(identity)
    await assert.rejects(apps[1].streamRun(identity), /subscribers/)
    await slow.body.cancel()
    const free = await apps[1].streamRun(identity); await free.body.cancel()
    if (writer === 0) {
      await docker('stop', '--time', '1', container)
      await wait(async () => readers[1].events.at(-1)?.type === 'reset')
      await host.emitEvent(work, { runId: work.id, seq: 2, kind: 'fixture.outage', stage: 'completed', visibility: 'user', data: {} })
      await wait(async () => resumed.events.some(item => item.type === 'event' && item.event.kind === 'fixture.outage'))
      send('delta', '-offline')
      await docker('start', container)
      await wait(async () => { try { return await redis.ping() === 'PONG' } catch { return false } })
      await wait(async () => { try { await stores[0].read(identity, signal); await stores[1].read(identity, signal); return true } catch { return false } })
      send('delta', '-restored')
      await wait(async () => preview(resumed.events, 'before-offline-restored'))
      await redis.call('CLIENT', 'KILL', 'TYPE', 'pubsub')
      send('delta', '-notification-gap')
      await wait(async () => preview(resumed.events, '-notification-gap') || preview(resumed.events, 'before-offline-restored-notification-gap'))
      await apps[1].revise(identity, 'Revised request')
      await wait(async () => resumed.events.at(-1)?.type === 'reset')
      send('reset', '', 2); send('delta', 'revised', 2)
      await wait(async () => preview(resumed.events, 'revised'))
    }
    await apps[0].cancel(identity)
    await sender.close()
    await host.completeWork(work, { status: 'cancelled' })
    await Promise.all(readers.map(reader => reader.done)); await resumed.done
    for (const reader of [...readers.slice(1), resumed]) {
      const ids = reader.events.filter(item => item.type === 'event').map(item => item.event.seq)
      assert.equal(new Set(ids).size, ids.length, 'durable events must not duplicate')
      assert.equal(reader.events.findLast(item => item.type === 'state').state.run.status, 'cancelled')
    }
    assert.equal(await redis.call('PUBSUB', 'NUMPAT'), 0)
  }
  await wait(async () => (await redis.call('PUBSUB', 'CHANNELS', 'lingxios:preview:*')).length === 0)
  console.log('PASS: A/A, A/B, B/A, B/B, multiple readers, cursor reconnect, Redis restart/outage replay/reseed, notification loss, revision/cancel, authorization, bounded slow clients, and subscription cleanup')
} finally {
  await Promise.allSettled(uploads.map(item => item.close()))
  await Promise.allSettled(streams.map(item => item.close()))
  for (const app of apps) await app.stop()
  stores.forEach(store => store.close()); redis?.disconnect()
  await pool?.end(); await admin.end()
  await docker('rm', '-f', container)
}
