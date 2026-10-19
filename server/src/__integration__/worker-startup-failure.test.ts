import assert from 'node:assert/strict'
import { test } from 'node:test'
import IORedis from 'ioredis'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { startWorkerProcess } from '../worker.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Failure model, before the fix: real channel reconciliation opens the passive
// context's two realtime Redis connections. A later runner preflight/start
// failure occurs before its stop handle is registered, leaving these sockets
// alive after product pools close. Cleanup must preserve the startup error,
// stop the context before database teardown, and never start later tasks.
test('failed Worker runner startup closes reconciled realtime context before database teardown', { timeout: 30000 }, async () => {
  await ensureSchemaOnce()
  await resetAllTables()
  installFakeWukong()
  const { companyId, agentId } = await seedCompanyWithAgent()
  await pool.query(`INSERT INTO conversations(id,company_id,kind,title,members)
    VALUES('worker-failure-room',$1,'group','Startup failure',$2::jsonb)`, [companyId, JSON.stringify([agentId])])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
    VALUES('worker-failure-room',$1,$2::jsonb)`, [companyId, JSON.stringify({ channelType: 2, members: [agentId] })])
  await stopLingxiOSControl()
  const originalPreviewUrl = process.env.LINGXIOS_REALTIME_REDIS_URL
  // This dedicated logical DB identifies only this fixture's two sockets in
  // the isolated Redis. No preview keys or production Redis are touched.
  const previewUrl = new URL(process.env.LINGXIOS_TEST_REDIS_URL || env.REDIS_URL)
  previewUrl.pathname = '/15'
  process.env.LINGXIOS_REALTIME_REDIS_URL = previewUrl.href
  const inspector = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: 0 })
  const previewConnections = async () => String(await inspector.client('LIST')).split('\n')
    .filter(line => /(?:^| )db=15(?: |$)/.test(line)).length
  const waitForConnections = async (expected: number) => {
    const deadline = Date.now() + 2000
    let actual = await previewConnections()
    while (actual !== expected && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 20))
      actual = await previewConnections()
    }
    assert.equal(actual, expected, 'isolated preview connection count')
  }
  const failure = new Error('isolated runner startup failure')
  const events: string[] = []
  try {
    await waitForConnections(0)
    await assert.rejects(startWorkerProcess({
      initializeStorage: () => undefined,
      startAgentRuntime: async () => {
        // This is the actual published context created by real reconciliation.
        const context = await lingxiOSControl()
        const stop = context.stop.bind(context)
        context.stop = async () => { events.push('stop:context'); await stop() }
        await waitForConnections(2)
        throw failure
      },
      startAgentIngress: () => { events.push('unexpected:ingress'); return null },
      tasks: [{ name: 'must-not-start', concurrency: 'idempotent', start: () => { events.push('unexpected:task'); return null } }],
      closeRedis: () => { events.push('stop:redis') },
      closePostgres: () => { events.push('stop:postgres') },
    }), error => error === failure)
    await waitForConnections(0)
    assert.deepEqual(events, ['stop:context', 'stop:redis', 'stop:postgres'])
  } finally {
    await stopLingxiOSControl()
    inspector.disconnect()
    if (originalPreviewUrl === undefined) delete process.env.LINGXIOS_REALTIME_REDIS_URL
    else process.env.LINGXIOS_REALTIME_REDIS_URL = originalPreviewUrl
    await teardownAll()
  }
})
