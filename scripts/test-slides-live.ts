// Explicit opt-in, metered provider; only the dedicated local test database may be reset.
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import express from 'express'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { gatewayFixture } from '../server/scripts/slides-acceptance-gateway.mjs'

assert.equal(process.env.NODE_ENV, 'test')
assert.equal(new URL(process.env.DATABASE_URL!).hostname, '127.0.0.1')
assert.equal(new URL(process.env.DATABASE_URL!).port, '15432')
assert.equal(new URL(process.env.DATABASE_URL!).search, '')
assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/issue_601_test')
assert.equal(process.env.DATABASE_URL, process.env.INTEGRATION_DATABASE_URL)
assert.equal(process.env.LINGXIOS_LIVE_PROTOCOL, '1')
assert.equal(new URL(process.env.REDIS_URL!).hostname, '127.0.0.1')
assert.equal(new URL(process.env.REDIS_URL!).port, '16379')
assert.equal(process.env.REDIS_URL, process.env.LINGXIOS_TEST_REDIS_URL)
// Import infrastructure only after the destructive-fixture and live-call guards.
const { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } = await import(
  '../server/src/__integration__/_helpers.js'
)
const { installRecordingWukong } = await import('../server/src/__integration__/_recording-wukong.js')
const { pool } = await import('../server/src/db/pool.js')
const { env } = await import('../server/src/env.js')
const { api } = await import('../server/src/api/router.js')
const { artifactEditorRouter, artifactBlobRouter } = await import('../server/src/modules/artifacts/editor-router.js')
const { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } = await import(
  '../server/src/agent-runtime/runtime.js'
)
const { ProductRuntimePolicy } = await import('../server/src/agent-runtime/context.js')
const { receiveAgentRequest } = await import('../server/src/agent-runtime/receive.js')
const { createNativeMessage, nativeText } = await import('../server/src/im/message-types.js')
const { startNativeEventWorker } = await import('../server/src/agents/native-event-worker.js')
await ensureSchemaOnce()
await resetAllTables()
const im = await installRecordingWukong()
const { companyId, projectId } = await seedCompanyWithAgent()
const userId = 'slides-live-601-person'
await seedUserMembership(userId, companyId, { isAdmin: false })
await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role)VALUES($1,$2,$3,'TEACHER')", [
  projectId,
  companyId,
  userId,
])
const app = express()
app.use('/artifact-editor', artifactEditorRouter)
app.use('/_blob', artifactBlobRouter)
app.use(express.json())
app.use('/api', api)
const server = createServer(app)
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const address = server.address()
assert.ok(address && typeof address !== 'string')
const origin = `http://127.0.0.1:${address.port}`
const gateway = await gatewayFixture({ origin, userId, gatewaySecret: env.GATEWAY_HMAC_SECRET })
console.info('Real credential sign-in and formal product61/schema14 bootstrap passed.')
const request = (path: string, method = 'GET', body?: unknown) =>
  fetch(gateway.url + '/api' + path, {
    method,
    headers: {
      cookie: gateway.cookie,
      'content-type': 'application/json',
      'x-company-id': companyId,
      'x-project-id': projectId,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
let worker: ReturnType<typeof createWorker> | undefined
try {
  const created = await request(`/projects/${projectId}/slides`, 'POST', { title: '隔离模型验收' })
  assert.equal(created.status, 201)
  const deck = (await created.json()) as { id: string }
  const opened = await request(`/artifacts/${deck.id}/slides-workspace`, 'POST')
  assert.equal(opened.status, 200)
  const workspace = (await opened.json()) as { conversationId: string; agentId: string }
  const granted = await request(`/artifacts/${deck.id}/editor-grant`, 'POST')
  assert.equal(granted.status, 200)
  const grant = (await granted.json()) as { url: string }
  const old = await (await fetch(origin + grant.url + 'project/deck.json')).text()
  const html =
    '<section id="one" style="background:#faf8f4;padding:80px"><h1>原始标题</h1><p>这一段必须保留。</p><aside>讲者备注必须保留。</aside></section>'
  const deckJson = JSON.stringify({
    v: 4,
    lists: 'css',
    title: '隔离模型验收',
    order: ['one'],
    sections: {},
    faces: {},
    designSystems: [],
  })
  const publish = await fetch(origin + grant.url + '__deck/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      files: {
        'project/deck.json': {
          base64: Buffer.from(deckJson).toString('base64'),
          contentType: 'application/json',
          ifMatch: createHash('sha256').update(old).digest('hex'),
        },
        'project/slides/one.html': {
          base64: Buffer.from(html).toString('base64'),
          contentType: 'text/html',
          ifMatch: null,
        },
      },
    }),
  })
  assert.equal(publish.status, 200)
  const view = await request(`/artifacts/${deck.id}/editor-context`, 'PUT', {
    slideId: 'one',
    slideIndex: 1,
    slideCount: 1,
    slideTitle: '原始标题',
    selectedElementIds: ['heading'],
    selectedText: '原始标题',
    selection: [{ id: 'heading', kind: 'text', label: '原始标题' }],
    mode: 'edit',
    dirty: false,
    version: null,
  })
  assert.equal(view.status, 200)
  const nonce = randomUUID(),
    payload = createNativeMessage({
      id: nonce,
      role: 'user',
      content: [
        {
          type: 'text',
          text: '请只把当前选中页的标题“原始标题”改成“云端真实模型验收”，保留其他正文、备注和页序。先读适用的完整技能及当前编辑上下文，读取文件后再修改；保存后重新读取确认，最后用中文回复。不要新增稿件或发起协作。',
        },
      ],
    })
  const accepted = await request(`/im/channels/${workspace.conversationId}/messages/accept`, 'POST', {
    clientNonce: nonce,
    payload,
  })
  assert.equal(accepted.status, 202)
  const received = await receiveAgentRequest({
    companyId,
    agentId: workspace.agentId,
    channelId: workspace.conversationId,
    clientMsgNo: nonce,
    authenticatedUserId: userId,
  })
  assert.ok('runs' in received && received.runs.length === 1)
  const run = received.runs[0],
    control = await lingxiOSControl(),
    started = Date.now()
  worker = createWorker({
    controlPlane: control,
    policy: new ProductRuntimePolicy(),
    model: runtimeModelConfiguration(
      { id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL },
      90_000,
    ),
    worker: { id: 'slides-601-live', concurrency: 1 },
  })
  console.info('Executing the metered provider request against isolated fixtures.')
  assert.equal(await worker.runNext(), true)
  const state = await control.readRun(run),
    events = await control.readEvents(run, 0)
  const actions = events.events.filter((e) => e.kind === 'tool.started').map((e) => e.data.name)
  const saved = (
    await pool.query('SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [
      deck.id,
      'project/slides/one.html',
    ])
  ).rows[0]
  const text = saved.body.toString('utf8')
  const deadline = AbortSignal.timeout(10_000)
  while (state?.status === 'succeeded' && (await control.readRunState(run))?.delivery !== 'delivered') {
    deadline.throwIfAborted()
    await delay(50)
  }
  const replay = await request(`/im/channels/${workspace.conversationId}/agents/${workspace.agentId}/runs/${run.runId}`)
  const checks = {
    login: true,
    formalRuntime: releaseVersions.runtime === '3.8.20',
    accepted: state?.status === 'succeeded',
    title: text.includes('云端真实模型验收'),
    body: text.includes('这一段必须保留。'),
    notes: text.includes('讲者备注必须保留。'),
    replay: replay.status === 200,
    delivered: im.messages.some(
      (m) =>
        m.channelId === workspace.conversationId && m.fromUid === workspace.agentId && nativeText(m.payload).length > 0,
    ),
  }
  const ledgerFor = async (id: string) =>
    Object.fromEntries(
      (
        await pool.query('SELECT purpose,count(*)::int AS n FROM llm_calls WHERE run_id=$1 GROUP BY purpose', [id])
      ).rows.map((row) => [row.purpose, row.n]),
    )
  const ledger = await ledgerFor(run.runId)
  assert.ok(Object.values(checks).every(Boolean), 'live product editing failed')
  const editDurationMs = Date.now() - started,
    commentStarted = Date.now()
  const posted = await fetch(origin + grant.url + '__comments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      anchor: 'slide:one',
      label: '当前页标题',
      text: '请读取当前评论与已保存的第一页，核对标题“云端真实模型验收”及原有正文和备注。不要再修改文件。通过 slides.comment_reply 回复“已核对选区标题与备注”，并设 resolve:true 关闭这条评论。',
      send: true,
    }),
  })
  assert.equal(posted.status, 201)
  const thread = ((await posted.json()) as { thread: { id: string } }).thread
  const event = (
    await pool.query("SELECT event FROM agent_native_event_outbox WHERE event->>'commentId'=$1", [thread.id])
  ).rows[0].event
  const nativeDelivery = startNativeEventWorker()
  try {
    const deadline = AbortSignal.timeout(10_000)
    while (!im.messages.some((message) => message.clientMsgNo === event.clientNonce)) {
      deadline.throwIfAborted()
      await delay(25)
    }
  } finally {
    await nativeDelivery.stop()
  }
  const commentReceived = await receiveAgentRequest({
    companyId,
    agentId: workspace.agentId,
    channelId: workspace.conversationId,
    clientMsgNo: event.clientNonce,
    authenticatedUserId: userId,
  })
  assert.ok('runs' in commentReceived && commentReceived.runs.length === 1)
  const commentRun = commentReceived.runs[0]
  assert.equal(await worker.runNext(), true)
  const commentState = await control.readRun(commentRun),
    commentEvents = await control.readEvents(commentRun, 0)
  const commentDeadline = AbortSignal.timeout(10_000)
  while (commentState?.status === 'succeeded' && (await control.readRunState(commentRun))?.delivery !== 'delivered') {
    commentDeadline.throwIfAborted()
    await delay(50)
  }
  const commentReplay = await request(
    `/im/channels/${workspace.conversationId}/agents/${workspace.agentId}/runs/${commentRun.runId}`,
  )
  const snapshot = (await (await fetch(origin + grant.url + '__comments')).json()) as {
    threads: {
      id: string
      status: string
      agent?: { status: string }
      messages: { author: { kind: string }; text: string }[]
    }[]
  }
  const updated = snapshot.threads.find((item) => item.id === thread.id)
  const savedAfterComment = (
    await pool.query('SELECT sha256 FROM artifact_files WHERE artifact_id=$1 AND path=$2', [
      deck.id,
      'project/slides/one.html',
    ])
  ).rows[0].sha256
  const commentChecks = {
    deliveredToDedicatedRoom: event.channelId === workspace.conversationId,
    succeeded: commentState?.status === 'succeeded',
    replied: updated?.agent?.status === 'replied',
    resolved: updated?.status === 'resolved',
    replay: commentReplay.status === 200,
    answerDelivered: (await control.readRunState(commentRun))?.delivery === 'delivered',
    visibleReply:
      updated?.messages.some(
        (message) => message.author.kind === 'agent' && message.text.includes('已核对选区标题与备注'),
      ) === true,
    fileUnchanged: savedAfterComment === saved.sha256,
  }
  const comment = {
    durationMs: Date.now() - commentStarted,
    status: commentState?.status,
    actions: commentEvents.events.filter((event) => event.kind === 'tool.started').map((event) => event.data.name),
    ledger: await ledgerFor(commentRun.runId),
    checks: commentChecks,
  }
  const evidence = {
    measuredAt: new Date().toISOString(),
    scope:
      'Real local Better Auth/D1 credential sign-in, gateway, product API, PostgreSQL, formal SDK and metered provider; recording HTTP IM and isolated in-memory blob provider; no production deployment or data',
    sdk: releaseVersions.runtime,
    model: env.OPENAI_MODEL,
    durationMs: editDurationMs,
    status: state?.status,
    actions,
    ledger,
    checks,
    savedSha256: saved.sha256,
    comment,
  }
  await mkdir('artifacts/slides-acceptance', { recursive: true })
  await writeFile('artifacts/slides-acceptance/live-model.json', JSON.stringify(evidence, null, 2) + '\n')
  console.info(JSON.stringify(evidence))
  assert.ok(Object.values(commentChecks).every(Boolean), 'live comment acceptance failed')
} finally {
  await worker?.stop()
  await stopLingxiOSControl()
  await gateway.worker.dispose()
  await teardownAll(server)
  await im.close()
}
