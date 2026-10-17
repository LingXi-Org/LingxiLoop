// Disposable fault-injection proxy over the ordinary product API, PostgreSQL,
// real pinned WuKongIM, and LingxiOS. No product/developer environment is loaded.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer, request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import express from 'express'
import { WebSocketServer } from 'ws'

Object.assign(process.env, {
  DOTENV_CONFIG_PATH: '/tmp/lingxiloop-no-dotenv', NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://postgres:lingxiloop-e2e-local@127.0.0.1:55432/lingxiloop_integration_test',
  REDIS_URL: 'redis://127.0.0.1:56379/0',
  OPENAI_API_KEY: 'integration-test-key', OPENAI_BASE_URL: 'http://127.0.0.1:1/v1',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
  LINGXILOOP_INVITE_BASE_URL: 'http://127.0.0.1:5196', LINGXILOOP_PUBLIC_ORIGIN: 'http://127.0.0.1:5196',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'integration-gateway-secret',
  WUKONG_API_URL: 'http://127.0.0.1:55001', WUKONG_WS_URL: 'ws://127.0.0.1:55200',
  WUKONG_API_TOKEN: 'e2e-local-token', WUKONG_WEBHOOK_SECRET: 'lingxiloop-e2e-webhook',
  WUKONG_USER_TOKEN_SECRET: 'integration-wukong-user-token-secret',
  AGENT_OS_INPUT_COST_MICROS_PER_MILLION: '1', AGENT_OS_OUTPUT_COST_MICROS_PER_MILLION: '1',
  AGENT_OS_MODEL_REQUEST_TIMEOUT_MS: '200', AGENT_OS_WORKER_PORT: '52995',
  LINGXIOS_SERVICE_TOKEN: 'connection-recovery-fixture-service-token', LINGXILOOP_DISABLE_EMBEDDINGS: '1',
})
assert.equal(spawnSync(process.execPath, ['--import', 'tsx', 'server/src/migrate-bin.ts'], { stdio: 'inherit' }).status, 0)
const { pool } = await import('../server/src/db/pool.ts')
const { env } = await import('../server/src/env.ts')
const { lingxiOSControl, startLingxiOSWorker } = await import('../server/src/agent-runtime/runtime.ts')
const { syncConversationPolicy } = await import('../server/src/agent-runtime/conversations.ts')
const { bindProductRun } = await import('../server/src/agent-runtime/identity.ts')
const { readRunProjection } = await import('../server/src/agent-runtime/assistant-transport.ts')
const { seedCompanyWithAgent, seedUserMembership, buildApiTestApp, teardownAll } = await import('../server/src/__integration__/_helpers.ts')
const { storage } = await import('../server/src/storage.ts')
const { wukongClient: wukong } = await import('../server/src/im/wukong.ts')
const { createNativeMessage } = await import('../src/lib/nativeMessage.ts')
const provider = createServer(request => request.resume())
await new Promise(resolve => provider.listen(0, '127.0.0.1', resolve))
env.OPENAI_BASE_URL = `http://127.0.0.1:${provider.address().port}/v1`
const api = await lingxiOSControl()
const controlPort = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN, port: 0 })
process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${controlPort}`
const backend = express()
const identities = []
for (const name of ['A', 'B']) {
  const identity = await seedCompanyWithAgent()
  identity.userId = (await pool.query('SELECT created_by FROM projects WHERE id=$1', [identity.projectId])).rows[0].created_by
  await seedUserMembership(identity.userId, identity.companyId)
  identity.name = name
  identities.push(identity)
  backend.use((req, res, next) => {
    if (req.headers['x-company-id'] !== identity.companyId) return next()
    // Only login is supplied by the isolated fixture. All authorization and
    // product endpoints still use their normal routers and database checks.
    return identity.app(req, res, next)
  })
  identity.app = await buildApiTestApp(identity.userId)
}
const product = createServer(backend)
await new Promise(resolve => product.listen(0, '127.0.0.1', resolve))
let current
const streams = new Set()
const proxy = express()
proxy.use('/api/__recovery', express.json())
proxy.post('/api/__recovery/start', async (req, res) => {
  const id = randomUUID().slice(0, 8), room = `recovery-${id}`
  const identity = identities[0], members = [identity.userId, identity.agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','断线恢复验收',$4::jsonb)",
    [room, identity.companyId, identity.projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',
    [room, identity.companyId, JSON.stringify({ channelType: 2, members })])
  await wukong().upsertChannel({ channelId: room, channelType: 2, members })
  const fileId = `attachments/${identity.companyId}/${id}.txt`
  await storage.put(fileId, Buffer.from('Synthetic recovery attachment.'), 'text/plain')
  await pool.query(`INSERT INTO uploaded_files(storage_key,company_id,owner_user_id,company_period_id)
    SELECT $1,$2,$3,period_id FROM company_memberships WHERE company_id=$2 AND user_id=$3 AND ended_at IS NULL`,
  [fileId, identity.companyId, identity.userId])
  const payload = createNativeMessage({ id: `recovery-${id}`, role: 'user', content: [{ type: 'text', text: '保留这条测试消息和附件。' }],
    attachments: [{ id: fileId, type: 'document', name: '恢复附件.txt', contentType: 'text/plain', status: { type: 'complete' },
      content: [{ type: 'file', sourceType: 'id', data: fileId, mimeType: 'text/plain', filename: '恢复附件.txt' }] }] })
  current = { ...req.body, identity, room, payload, invalid: req.body.mode === 'invalid-receipt',
    unavailable: !['lost-reply', 'denied', 'invalid-receipt', 'identity'].includes(req.body.mode) && !req.body.mode?.startsWith('sse-'),
    accepts: 0, statusReads: 0, concurrent: 0, maxConcurrent: 0, crossIdentity: 0, lost: false, run: null, streamFault: false }
  if (req.body.mode?.startsWith('sse-')) {
    const policy = await syncConversationPolicy(api, identity.companyId, room)
    const accepted = await api.conversations.ingest({ tenantId: identity.companyId, conversationId: room, policyVersion: policy.version,
      messageId: payload.id, version: 1, author: { id: identity.userId, kind: 'human' }, text: '请回答这个问题。', mentions: [identity.agentId] },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    current.run = accepted.runs[0]; assert.ok(current.run)
    await bindProductRun(pool, current.run, room, false, payload.id)
    const queued = (await readRunProjection(api, current.run, true)).snapshot.message
    await wukong().sendMessage(room, 2, identity.agentId, queued)
  }
  res.json({ identity: { ...identity, app: undefined }, other: { ...identities[1], app: undefined }, room, payload, runId: current.run?.runId })
})
proxy.post('/api/__recovery/control', async (req, res) => {
  if (req.body.action === 'interrupt') {
    current.streamFault = true
    current.unavailable = current.mode === 'sse-offline'
    for (const stream of streams) stream.destroy()
  } else {
    current.unavailable = false
    current.invalid = false
    current.status = 0
    if (req.body.action === 'finish' && current.run) {
      const worker = await startLingxiOSWorker()
      const deadline = AbortSignal.timeout(20_000)
      while ((await api.readRunState(current.run))?.run.status !== 'failed') { deadline.throwIfAborted(); await delay(50) }
      await worker.stop()
    }
    if (current.wake === 'hello') for (const socket of sockets.clients) socket.send(JSON.stringify({ type: 'hello' }))
  }
  res.json({ ok: true })
})
proxy.get('/api/__recovery/facts', async (_req, res) => {
  if (!current) return res.json({})
  const messages = await wukong().syncMessages(current.room, 2, 200, current.identity.userId)
  const own = messages.filter(message => message.fromUid === current.identity.userId)
  res.json({ accepts: current.accepts, statusReads: current.statusReads, maxConcurrent: current.maxConcurrent,
    uniqueMessages: new Set(own.map(message => message.clientMsgNo)).size, crossIdentity: current.crossIdentity,
    remoteLifecycle: current.run ? (await api.readRunState(current.run))?.run.status : null,
    workItems: current.run ? (await pool.query('SELECT count(*)::int AS n FROM lingxios.agent_work_items WHERE run_id=$1', [current.run.runId])).rows[0].n : 0 })
})
// A local realtime fixture emits actual WS hello frames. It carries no user
// data and deliberately replaces only ticket/session setup, not product HTTP.
proxy.post('/api/auth/ws-ticket', (_req, res) => res.json({ ticket: 'isolated-recovery-fixture' }))
proxy.use((req, res) => {
  const scenario = current
  const send = /\/messages\/accept$/.test(req.url), status = /\/im\/sends\//.test(req.url)
  const stream = /\/runs\/[^/]+\/stream/.test(req.url), runRead = /\/runs\/[^/?]+\?/.test(req.url)
  if (send) scenario.accepts++
  if (status) scenario.statusReads++
  if ((send || status) && req.headers['x-company-id'] !== scenario.identity.companyId) scenario.crossIdentity++
  if (send || status) {
    scenario.concurrent++; scenario.maxConcurrent = Math.max(scenario.maxConcurrent, scenario.concurrent)
    res.once('close', () => scenario.concurrent--)
  }
  // Bootstrap is intentionally unavailable except the IM wake case; this
  // prevents a direct SDK echo from masking lost HTTP response recovery.
  if (req.url === '/api/im/bootstrap' && (scenario?.wake !== 'im' || scenario.unavailable)) return res.status(503).json({ error: 'injected bootstrap outage' })
  if ((send || status || stream || runRead) && scenario.unavailable) return res.status(503).json({ error: 'injected service outage' })
  if (send && scenario.status) return res.status(Number(scenario.status)).json({ error: 'injected permanent send rejection' })
  if (stream && scenario.streamFault && scenario.mode !== 'sse-silent') return res.status(503).json({ error: 'injected stream outage' })
  const forward = () => {
    if (res.destroyed) return
    const upstream = httpRequest({ hostname: '127.0.0.1', port: product.address().port, path: req.url,
      method: req.method, headers: { ...req.headers, host: '127.0.0.1' } }, incoming => {
      if (send && scenario.mode === 'lost-reply' && !scenario.lost && incoming.statusCode < 300) {
        scenario.lost = true; incoming.resume(); res.destroy(); return
      }
      if ((send || status) && scenario.invalid && incoming.statusCode < 300) {
        let data = ''
        incoming.on('data', chunk => { data += chunk })
        incoming.on('end', () => {
          const value = JSON.parse(data)
          if (value.echo) value.echo.messageSeq = 0
          res.status(incoming.statusCode).json(value)
        })
        return
      }
      res.writeHead(incoming.statusCode, incoming.headers)
      if (stream && scenario.mode === 'sse-silent' && scenario.streamFault) {
        // Preserve the TCP connection but swallow every frame. Only the real
        // snapshot endpoint can reveal the eventual terminal state.
        incoming.resume()
      } else incoming.pipe(res)
    })
    upstream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.destroy() })
    res.once('close', () => upstream.destroy())
    if (stream) { streams.add(res); res.once('close', () => streams.delete(res)) }
    req.pipe(upstream)
  }
  if (status && scenario.mode === 'identity') setTimeout(forward, 1000)
  else forward()
})
const server = createServer(proxy), sockets = new WebSocketServer({ server, path: '/ws' })
await new Promise(resolve => server.listen(5199, '127.0.0.1', resolve))
console.log('Recovery fault proxy ready at http://127.0.0.1:5199; real PostgreSQL/WuKongIM; fixture login only.')
const stop = async () => {
  for (const stream of streams) stream.destroy()
  for (const socket of sockets.clients) socket.close()
  provider.closeAllConnections(); product.closeAllConnections()
  await teardownAll(server)
  process.exit(0)
}
process.once('SIGTERM', stop); process.once('SIGINT', stop)
