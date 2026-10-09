import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { createRunView } from '@lyyzka/lingxios/ui'
import { pool } from '../db/pool.js'
import { createNativeMessage } from '../im/message-types.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { _setWukongClientForTests, wukongClient } from '../im/wukong.js'
import { getUiState, reconcileUiDelivery, reserveUiRevisions, submitUiAction } from '../im/interactive-ui.js'
import { messageLessons, projectLessonText } from '../agent-runtime/interactive-ui-projection.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Real transport failures: durable send with lost ACK, a duplicate retry, pending UI
// becoming interactive too soon, duplicate human actions after an unknown ACK,
// browser state not surviving reload, or local exploration unexpectedly calling a model.
test('real pinned WuKong reconciles UI and action ACK loss without a second durable message', {
  skip: process.env.LINGXIOS_REAL_WUKONG !== '1', timeout: 300_000,
}, async t => {
  assert.equal(new URL(process.env.DATABASE_URL!).pathname, '/lingxiloop_ui_model_test')
  const output = 'artifacts/interactive-ui/wukong'
  await mkdir(output, { recursive: true })
  await writeFile(`${output}/results.json`, JSON.stringify({ passed: false }))
  await writeFile(`${output}/browser-checks.json`, JSON.stringify({ passed: false }))
  let server: Server | undefined, preview: ChildProcess | undefined
  try {
    await ensureSchemaOnce(); await resetAllTables(); _setWukongClientForTests(null)
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    await seedUserMembership('test-owner', companyId)
    const channelId = `ui-wukong-${randomUUID()}`, members = ['test-owner', agentId]
    await pool.query(`INSERT INTO conversations(id,company_id,project_id,kind,title,members)
      VALUES($1,$2,$3,'group','Synthetic ACK test',$4::jsonb)`, [channelId, companyId, projectId, JSON.stringify(members)])
    await pool.query(`INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)`,
      [channelId, companyId, JSON.stringify({ channelType: 2, members }), agentId])
    const client = wukongClient()
    await client.upsertChannel({ channelId, channelType: 2, title: 'Synthetic ACK test', members })
    const runId = randomUUID()
    await pool.query(`INSERT INTO agent_run_bindings(run_id,company_id,conversation_id,session_id,agent_id,principal_id,message_protocol)
      VALUES($1,$2,$3,$3,$4,'test-owner',2)`, [runId, companyId, channelId, agentId])
    const source = '$angle = 30\nroot = Lesson("抛射运动", "同高无阻力抛射在45度时射程最大。", [angle,plot,check])\nangle = Parameter("angle", "角度", $angle, 0, 90, 1, "°", "projectile.angle")\nplot = ProjectilePlot($angle, 20, 9.81, 0)\ncheck = LearningAction("check", "check-prediction", "检查预测")'
    const payload = createNativeMessage({ id: `run-${runId}`, role: 'assistant',
      content: projectLessonText(`\`\`\`lingxiloop-openui-v1\n${source}\n\`\`\``, runId, false),
      custom: { runId, controlPrincipalId: 'test-owner', refs: { runId, agentId },
        harness: { ...createRunView(runId), requestVersion: 1, lifecycle: 'succeeded', delivery: 'delivered',
          resultId: `ui-result-${runId}`, fence: 1, messageFence: 1 } } })
    const envelope = messageLessons(payload)[0]
    assert.ok(envelope)
    const identity = { companyId, channelId, agentId, runId, clientNonce: `ui-delivery-${runId}`, resultId: `ui-result-${runId}`, fence: 1, envelopes: [envelope] }
    await reserveUiRevisions(identity)
    const send = client.sendMessage.bind(client)
    let sendCalls = 0
    const dropAck = () => t.mock.method(client, 'sendMessage', async (...args: Parameters<typeof send>) => {
      sendCalls++; await send(...args); throw new Error('synthetic loss after real durable WuKong write')
    })
    const lost = dropAck()
    await assert.rejects(imMessagesApplication.acceptAgentMessage({ companyId, userId: agentId, channelId,
      clientNonce: identity.clientNonce, payload }), /synthetic loss/)
    lost.mock.restore()
    const pending = await pool.query('SELECT status FROM im_ui_revisions WHERE company_id=$1 AND ui_id=$2', [companyId, envelope.uiId])
    assert.equal(pending.rows[0].status, 'pending')
    const reconciled = await reconcileUiDelivery(identity)
    assert.ok(reconciled)
    assert.equal(await reserveUiRevisions(identity), 'committed')
    const reference = { messageId: envelope.messageId, revision: envelope.revision, sourceHash: envelope.sourceHash }
    const actor = { companyId, channelId, userId: 'test-owner', uiId: envelope.uiId }
    assert.equal((await getUiState({ ...actor, reference })).readOnly, false)
    const action = { ...actor, request: { ...reference, actionId: 'check', idempotencyKey: randomUUID(), state: { $angle: 60 } } }
    const actionLost = dropAck()
    await assert.rejects(submitUiAction(action), /synthetic loss/)
    actionLost.mock.restore()
    const retried = await submitUiAction(action)
    assert.equal(retried.duplicate, true)
    await submitUiAction(action)
    const history = await imMessagesApplication.history({ companyId, userId: 'test-owner', channelId, limit: 100, beforeSequence: 0 })
    assert.equal(history?.length, 2)
    assert.equal(new Set(history.map(item => item.clientMsgNo)).size, 2)
    assert.equal(sendCalls, 2)

    const app = await buildApiTestApp('test-owner')
    app.get('/__ui_live/manifest', (_request, response) => response.json({ companyId, projectId, agentId, channelId,
      ready: true, runs: [], lesson: { uiId: envelope.uiId, ...reference } }))
    app.get('/__ui_live/stats', async (_request, response) => {
      const calls = await pool.query('SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1 AND conversation_id=$2', [companyId, channelId])
      const actions = await pool.query(`SELECT count(*)::int AS count FROM im_send_acceptances
        WHERE company_id=$1 AND channel_id=$2 AND payload->'metadata'->'custom' ? 'uiInteraction'`, [companyId, channelId])
      response.json({ modelCalls: calls.rows[0].count, actions: actions.rows[0].count, measured: true })
    })
    server = createServer(app)
    await new Promise<void>(resolve => server!.listen(52996, '127.0.0.1', resolve))
    const command = (args: string[], extraEnv: Record<string, string> = {}) => new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, args, { env: { ...process.env, ...extraEnv }, stdio: 'inherit', windowsHide: true })
      child.once('error', reject)
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Real-WuKong browser command exited ${code}`)))
    })
    await command(['node_modules/vite/bin/vite.js', 'build', '--config', 'e2e/vite.interactive-live.config.ts'])
    preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'e2e/vite.interactive-live.config.ts'],
      { env: process.env, stdio: 'inherit', windowsHide: true })
    const deadline = AbortSignal.timeout(30_000)
    while (true) {
      deadline.throwIfAborted()
      if (await fetch('http://127.0.0.1:52995/e2e/interactive-ui-live.html').then(response => response.ok).catch(() => false)) break
      await delay(200)
    }
    await command(['e2e/web/run.mjs', 'e2e/web/interactive-ui-wukong.e2e.ts', '--output', `${output}/browser`], {
      E2E_PROJECT: 'web', E2E_BASE_URL: 'http://127.0.0.1:52995', E2E_BUILD_INDEX: '.e2e/interactive-live-build/e2e/interactive-ui-live.html',
    })
    const browser = JSON.parse(await readFile(`${output}/browser-checks.json`, 'utf8'))
    assert.equal(browser.passed, true)
    const afterBrowser = await imMessagesApplication.history({ companyId, userId: 'test-owner', channelId, limit: 100, beforeSequence: 0 })
    assert.equal(afterBrowser?.length, 3)
    assert.equal((await getUiState({ ...actor, reference })).state.$angle, browser.savedAngle)
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM llm_calls WHERE company_id=$1', [companyId])).rows[0].count, 0)
    await writeFile(`${output}/results.json`, JSON.stringify({ passed: true, realTransport: true,
      pinnedCommit: 'c7f663fa23a4ee2c6f7e08c68423f50f0f6e9c47', sendCalls, durableMessages: history.length,
      uiPublication: 'pending → reconciled → committed', actionRetries: 2, modelCalls: 0,
      browser: { passed: true, report: `${output}/browser/report.json`, checks: `${output}/browser-checks.json`,
        durableMessagesAfterBrowser: afterBrowser.length, modelWorker: false },
      reproduce: 'node e2e/server/interactive-ui-live.mjs --live-generative-ui --transport-only',
    }, null, 2))
  } finally { preview?.kill(); await teardownAll(server) }
})
