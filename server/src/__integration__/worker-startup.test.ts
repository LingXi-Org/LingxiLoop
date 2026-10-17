import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listenLingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { startWorkerProcess } from '../worker.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, teardownAll } from './_helpers.js'

// Failures: reconciliation creates an active control before Worker admission;
// startup fails and closes the pool while active maintenance keeps the process alive.
test('production Worker reconciliation uses passive local context before runner startup', { timeout: 30000 }, async () => {
  await ensureSchemaOnce()
  await resetAllTables()
  installFakeWukong()
  const { companyId, agentId } = await seedCompanyWithAgent()
  await pool.query(`INSERT INTO conversations(id,company_id,kind,title,members)
    VALUES('worker-startup-room',$1,'group','Startup',$2::jsonb)`, [companyId, JSON.stringify([agentId])])
  await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile)
    VALUES('worker-startup-room',$1,$2::jsonb)`, [companyId, JSON.stringify({ channelType: 2, members: [agentId] })])
  await stopLingxiOSControl()
  const originalMode = env.NODE_ENV
  const originalPort = process.env.LINGXIOS_CONTROL_PORT
  const originalToken = process.env.LINGXIOS_SERVICE_TOKEN
  env.NODE_ENV = 'production'
  process.env.LINGXIOS_CONTROL_PORT = '53971'
  process.env.LINGXIOS_SERVICE_TOKEN = 'isolated-worker-startup-service-token'
  let started = false
  try {
    const service = await startWorkerProcess({
      initializeStorage: () => undefined,
      startAgentRuntime: async () => {
        await assert.rejects(async () => {
          const listener = await listenLingxiOSControl()
          await listener.stop()
        }, /Worker-local control cannot own the API control plane/)
        started = true
        return { stop: stopLingxiOSControl }
      },
      startAgentIngress: () => null,
      tasks: [],
      closePostgres: () => undefined,
      closeRedis: () => undefined,
    })
    assert.equal(started, true)
    await service.stop('test')
    assert.equal((await pool.query('SELECT 1')).rowCount, 1)
  } finally {
    env.NODE_ENV = originalMode
    if (originalPort === undefined) delete process.env.LINGXIOS_CONTROL_PORT
    else process.env.LINGXIOS_CONTROL_PORT = originalPort
    if (originalToken === undefined) delete process.env.LINGXIOS_SERVICE_TOKEN
    else process.env.LINGXIOS_SERVICE_TOKEN = originalToken
    await teardownAll()
  }
})
