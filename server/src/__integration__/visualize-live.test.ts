import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { createHash, randomUUID } from 'node:crypto'
import type { RunIdentity } from '@lyyzka/lingxios'
import { env } from '../env.js'
import { pool } from '../db/pool.js'
import { lingxiOSControl, startLingxiOSWorker } from '../agent-runtime/runtime.js'
import { syncProductChannel } from '../agent-runtime/conversations.js'
import { receiveAgentRequest } from '../agent-runtime/receive.js'
import { flushAgentWakes } from '../agent-runtime/ingress.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { readVisualizeReference, visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { readAuthorizedVisualizeDocument } from '../im/visualize.js'
import { imMessagesApplication } from '../im/messages-facade.js'
import { createNativeMessage } from '../im/message-types.js'
import { wukongWebhookRouter } from '../im/webhook.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model precedes this live fixture: fabricated HTML, mocked provider,
// missing skill/reference reads, unmetered tools, state changes starting a model
// turn, callback forgery, incomplete continuation, or a simulated HTML export.
test('real provider generates, adjusts, continues and exports a visualization through the production Web host', {
  skip: process.env.LINGXIOS_LIVE_VISUALIZE !== '1', timeout: 1_800_000,
}, async () => {
  assert.equal(env.OPENAI_MODEL, 'zai-org/GLM-5.3-Flash')
  assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  assert.match(new URL(env.DATABASE_URL).pathname, /^\/lingxiloop_issue193_model\d*_test$/)
  const resume = process.env.LINGXIOS_VISUALIZE_RESUME === '1'
  const preserveHistory = process.env.LINGXIOS_VISUALIZE_KEEP_HISTORY === '1'
  await ensureSchemaOnce(); if (!resume && !preserveHistory) await resetAllTables()
  const output = process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-live'
  await mkdir(output, { recursive: true })
  const report: Record<string, unknown> = { status: 'running', provider: env.OPENAI_MODEL, modelMock: false, browserMock: false, resumedDurableWork: resume, preservedPriorHistory: preserveHistory }
  let worker: Awaited<ReturnType<typeof startLingxiOSWorker>> | undefined
  let server: ReturnType<typeof createServer> | undefined, flush: ReturnType<typeof setInterval> | undefined
  let browser: ReturnType<typeof spawn> | undefined
  try {
    const previous = resume ? (await pool.query<{ company_id: string; project_id: string; id: string }>("SELECT company_id,project_id,id FROM conversations WHERE company_id='visualize-live-company' AND title='Visualize live' ORDER BY created_at DESC LIMIT 1")).rows[0] : undefined
    if (resume) assert.ok(previous, 'resume requires the existing isolated fixture conversation')
    const { companyId, projectId, agentId } = previous
      ? { companyId: previous.company_id, projectId: previous.project_id, agentId: 'visualize-live-agent' }
      : await seedCompanyWithAgent({ companyId: 'visualize-live-company', agentId: 'visualize-live-agent' })
    const channelId = previous?.id ?? `visualize-live-${randomUUID()}`, members = ['test-owner', agentId]
    if (!resume) {
      await seedUserMembership('test-owner', companyId)
      await pool.query("UPDATE participants SET capabilities='[]'::jsonb WHERE company_id=$1 AND id=$2", [companyId, agentId])
      await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Visualize live',$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile,leader_agent_id) VALUES($1,$2,$3::jsonb,$4)', [channelId, companyId, JSON.stringify({ channelType: 2, members }), agentId])
    }
    const api = await lingxiOSControl()
    await syncProductChannel({ channelId, channelType: 2, kind: 'group', title: 'Visualize live', members, leaderAgentId: agentId })
    const port = await api.listenControlPlane({ serviceToken: process.env.LINGXIOS_SERVICE_TOKEN!, port: 0 })
    process.env.LINGXIOS_CONTROL_URL = `http://127.0.0.1:${port}`
    const identities = async (): Promise<RunIdentity[]> => (await pool.query<{ run_id: string; session_id: string; thread_id: string | null }>('SELECT run_id,session_id,thread_id FROM agent_run_bindings WHERE company_id=$1 AND conversation_id=$2 ORDER BY created_at', [companyId, channelId])).rows.map(row => ({ tenantId: companyId, agentId, principalId: 'test-owner', sessionId: row.session_id, runId: row.run_id, ...(row.thread_id ? { threadId: row.thread_id } : {}) }))
    const stats = async () => {
      const ledger = (await pool.query<{ modelCalls: number; measuredCalls: number; unmeasuredCalls: number; measured: boolean; costUSD: string }>('SELECT count(*)::int AS "modelCalls",count(*) FILTER(WHERE measured)::int AS "measuredCalls",count(*) FILTER(WHERE NOT measured)::int AS "unmeasuredCalls",COALESCE(bool_and(measured),false) AS measured,COALESCE(sum(cost_usd),0)::text AS "costUSD" FROM llm_calls WHERE company_id=$1 AND conversation_id=$2', [companyId, channelId])).rows[0]
      const assistantCount = (await pool.query<{ count: number }>("SELECT count(*)::int AS count FROM im_send_acceptances WHERE company_id=$1 AND channel_id=$2 AND user_id=$3 AND status='accepted'", [companyId, channelId, agentId])).rows[0].count
      const states = (await pool.query('SELECT path,state FROM im_visualize_states WHERE company_id=$1 AND channel_id=$2 AND user_id=$3 ORDER BY path', [companyId, channelId, 'test-owner'])).rows
      return { ...ledger, costUSD: Number(ledger.costUSD), assistantCount, states }
    }
    let path = '', sourceMessageId = ''
    const app = await buildApiTestApp('test-owner')
    app.use('/webhooks/wukong', wukongWebhookRouter)
    app.get('/__visualize_live/manifest', (_req, res) => { res.json({ companyId, projectId, agentId, channelId, path, sourceMessageId }) })
    app.get('/__visualize_live/stats', async (_req, res) => { res.json(await stats()) })
    server = createServer(app)
    await new Promise<void>(resolve => server!.listen(Number(process.env.E2E_VISUALIZE_LIVE_API_PORT ?? 5194), '0.0.0.0', resolve))
    let flushing = false
    flush = setInterval(() => { if (!flushing) { flushing = true; void flushAgentWakes().catch(() => {}).finally(() => { flushing = false }) } }, 500)
    worker = await startLingxiOSWorker()
    async function settled(identity: RunIdentity) {
      const signal = AbortSignal.timeout(900_000)
      while (true) {
        signal.throwIfAborted()
        const state = await api.readRunState(identity)
        assert.ok(state)
        if (state.delivery === 'delivered') { assert.equal(state.run.status, 'succeeded'); return state }
        assert.ok(!['failed', 'cancelled'].includes(state.run.status), `live run terminated: ${state.run.error ?? state.run.status}`)
        await delay(250)
      }
    }
    async function ask(text: string) {
      assert.ok((await stats()).costUSD < 5, 'live scenario budget exceeded')
      const clientNonce = `visualize-question-${randomUUID()}`
      const result = await imMessagesApplication.acceptUserMessage({ companyId, channelId, userId: 'test-owner', clientNonce,
        payload: createNativeMessage({ id: clientNonce, role: 'user', content: [{ type: 'text', text: `@${agentId} ${text}` }], custom: { mentionedIds: [agentId] } }) })
      assert.equal(result.kind, 'accepted')
      const accepted = await receiveAgentRequest({ companyId, channelId, agentId, clientMsgNo: clientNonce, authenticatedUserId: 'test-owner' })
      assert.ok('runs' in accepted && accepted.runs[0])
      return { identity: accepted.runs[0], state: await settled(accepted.runs[0]) }
    }
    const existingRun = resume ? (await identities())[0] : undefined
    if (resume) assert.ok(existingRun, 'resume cannot accept a replacement user request')
    const generated = existingRun ? { identity: existingRun, state: await settled(existingRun) }
      : await ask('请在对话里做一个数量与总价的交互讲解：单价固定10元，数量1到10，初始5。只要一个标注“数量”的滑杆（id=count）、实时总价和一个文字恰好为“继续讲解”的按钮。拖动后保存数量状态。按钮点击才向你追问“请根据当前数量解释总价，用一句话回答，不用新图”。请用可视化技能，阅读完整技能、页面API和样式参考；任何截断结果都要用observations.read逐段全部读取至next=null，不能只读preview。保存后读回，再在最终答复展示。')
    assert.ok(generated.state.message)
    path = visualizeReferences(generated.state.message.body)[0]?.reference.path ?? ''
    assert.ok(path, 'real model must produce an authorized visualize reference')
    const receipt = (await pool.query<{ client_nonce: string }>('SELECT client_nonce FROM im_send_acceptances WHERE company_id=$1 AND channel_id=$2 AND user_id=$3 ORDER BY updated_at DESC LIMIT 1', [companyId, channelId, agentId])).rows[0]
    sourceMessageId = receipt.client_nonce
    const document = await readAuthorizedVisualizeDocument({ companyId, channelId, userId: 'test-owner', path })
    await writeFile(`${output}/generated-fragment.html`, document.html)
    await writeFile(`${output}/manifest.json`, JSON.stringify({ companyId, projectId, agentId, channelId, path, sourceMessageId }, null, 2))
    report.generated = { runId: generated.identity.runId, path, sourceMessageId }
    // Recover exactly the text exposed through public tool events, not private
    // runtime tables or an invented model declaration of having read the skill.
    const observedValues: Array<Record<string, unknown>> = []
    const ranges = new Map<string, Array<{ start: number; end: number; characters: number; text: string }>>()
    let eventCursor = 0
    while (true) {
      const page = await api.readEvents(generated.identity, eventCursor)
      for (const event of page.events) {
        const result = event.data.result as { value?: Record<string, unknown> } | undefined
        const value = event.kind === 'tool.completed' ? result?.value : undefined
        if (!value || value.truncated) continue
        if (typeof value.actionKey === 'string' && typeof value.start === 'number' && typeof value.end === 'number'
          && typeof value.characters === 'number' && typeof value.text === 'string') {
          const entries = ranges.get(value.actionKey) ?? []
          entries.push({ start: value.start, end: value.end, characters: value.characters, text: value.text }); ranges.set(value.actionKey, entries)
        } else observedValues.push(value)
      }
      if (page.events.length < 100) break
      eventCursor = page.nextSeq
    }
    for (const entries of ranges.values()) {
      let end = 0, text = ''
      for (const entry of entries.sort((a, b) => a.start - b.start)) {
        if (entry.start < end) continue
        if (entry.start !== end) break
        text += entry.text; end = entry.end
      }
      if (end === entries[0]?.characters) observedValues.push(JSON.parse(text))
    }
    assert.ok(observedValues.some(value => value.body === visualizeSkill.body || value.path === 'SKILL.md' && value.text === visualizeSkill.body), 'real model must consume every original skill character')
    const referenceEvidence = []
    for (const referencePath of ['references/api.md', 'references/styles.md']) {
      const expected = await readVisualizeReference(referencePath)
      assert.ok(observedValues.some(value => value.path === referencePath && value.text === expected), `real model must read complete ${referencePath}`)
      referenceEvidence.push({ path: referencePath, sha256: createHash('sha256').update(expected).digest('hex'), bytes: Buffer.byteLength(expected) })
    }
    report.completeSkill = { sha256: createHash('sha256').update(visualizeSkill.body).digest('hex'), bytes: Buffer.byteLength(visualizeSkill.body), references: referenceEvidence }
    browser = spawn(process.execPath, ['e2e/visualize/run-live-browser.mjs'], { stdio: 'inherit', env: { ...process.env, E2E_VISUALIZE_LIVE_OUTPUT: output } })
    const code = await new Promise<number | null>((resolve, reject) => { browser!.once('error', reject); browser!.once('exit', resolve) })
    assert.equal(code, 0, 'official browser acceptance failed')
    const runs = await identities(); assert.ok(runs.length >= 2, 'follow-up must create a real model turn')
    await settled(runs.at(-1)!)
    const exported = await ask('请把刚才这张可视化导出为独立HTML文件，文件名为quantity-export.html。保留数量滑杆和总价，移除仅宿主可用的继续讲解按钮；用原有导出流程实际生成并交付文件。')
    const artifact = await api.readArtifact(exported.identity, 'visualize/quantity-export.html')
    assert.ok(artifact, 'real model must execute visualize.export and deliver its artifact')
    assert.match(artifact.bytes.toString(), /sandbox="allow-scripts"/)
    await writeFile(`${output}/quantity-export.html`, artifact.bytes)
    report.export = { runId: exported.identity.runId, bytes: artifact.bytes.length, sha256: createHash('sha256').update(artifact.bytes).digest('hex') }
    browser = spawn(process.execPath, ['e2e/visualize/run-live-export.mjs'], { stdio: 'inherit', env: { ...process.env, E2E_VISUALIZE_LIVE_OUTPUT: output } })
    const exportCode = await new Promise<number | null>((resolve, reject) => { browser!.once('error', reject); browser!.once('exit', resolve) })
    assert.equal(exportCode, 0, 'actual standalone HTML browser acceptance failed')
    report.exportBrowser = JSON.parse(await readFile(`${output}/live-export-interaction.json`, 'utf8'))
    const finalStats = await stats(); assert.ok(finalStats.modelCalls > 0 && finalStats.measuredCalls > 0)
    if (!resume) assert.equal(finalStats.measured, true)
    const toolNames = new Set<string>()
    for (const identity of await identities()) {
      let cursor = 0
      while (true) {
        const page = await api.readEvents(identity, cursor)
        for (const event of page.events) if (event.kind === 'tool.started' && typeof event.data.name === 'string') toolNames.add(event.data.name)
        if (page.events.length < 100) break
        cursor = page.nextSeq
      }
    }
    for (const action of ['skills.load', 'visualize.read_reference', 'visualize.save', 'visualize.read', 'visualize.export']) assert.ok(toolNames.has(action), `live action missing: ${action}`)
    report.status = 'passed'; report.stats = finalStats; report.tools = [...toolNames]
    report.browser = JSON.parse(await readFile(`${output}/live-interaction.json`, 'utf8'))
  } catch (error) { report.status = 'failed'; report.error = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await writeFile(`${output}/live-runtime.json`, JSON.stringify(report, null, 2))
    browser?.kill('SIGTERM'); if (flush) clearInterval(flush)
    await worker?.stop()
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())) }
    await teardownAll()
  }
})
