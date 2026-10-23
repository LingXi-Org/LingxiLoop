import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions } from '@lyyzka/lingxios'
import { createWorker, type WorkerOptions } from '@lyyzka/lingxios/worker'
import { env } from '../env.js'
import { pool } from '../db/pool.js'
import { lingxiOSControl, runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { visualizeReferences } from '../agent-runtime/visualize-projection.js'
import { readAuthorizedVisualizeSnapshot } from '../im/visualize.js'
import { siliconFlowPricingForModel } from '../agent-runtime/pricing.js'
import { buildApiTestApp, ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Opt-in only. Preparation/typechecking never executes a provider call.
// Failure model: docs/evidence/issue-342/FAILURE-MODEL.md.
test('real provider activates and delivers a synthetic interactive diagram without semantic review', {
  skip: process.env.LINGXIOS_LIVE_VISUALIZE_342 !== '1', timeout: 300000,
}, async () => {
  const database = new URL(env.DATABASE_URL)
  assert.equal(database.hostname, '127.0.0.1')
  assert.match(database.pathname, /^\/runtime342_[a-z0-9_]*test$/)
  assert.equal(process.env.LINGXILOOP_DISABLE_EMBEDDINGS, '1', 'Keep unrelated embedding calls disabled in this narrow provider gate')
  assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  assert.ok(process.env.ISSUE342_RUNTIME_VERSION, 'Require the exact candidate runtime version')
  assert.equal(releaseVersions.runtime, process.env.ISSUE342_RUNTIME_VERSION)
  const [major, minor, patch] = releaseVersions.runtime.split('.').map(Number)
  assert.ok(major > 3 || major === 3 && (minor > 8 || minor === 8 && patch >= 4), 'Selective semantic review requires runtime 3.8.4 or newer')
  const model = runtimeModelConfiguration({ id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, 30000)
  const pricing = siliconFlowPricingForModel(env.OPENAI_BASE_URL, env.OPENAI_MODEL, false)
  assert.ok(pricing, 'Require the existing product price snapshot for the actual provider/model')
  if (env.OPENAI_MODEL === 'deepseek-ai/DeepSeek-V4.1-Flash') {
    assert.equal(Reflect.get(model.capabilities, 'jsonObjectWithTools'), false, 'Require the qualified tools/wire configuration before calling the provider')
  }
  await ensureSchemaOnce(); await resetAllTables()
  const output = process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-provider-342'
  await mkdir(output, { recursive: true })
  const report: Record<string, unknown> = { status: 'running', runtime: releaseVersions.runtime, syntheticRequest: true,
    productionOperations: 0, realProvider: true, semanticReview: 'selective', originalCaseVerified: false }
  const im = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined, server: ReturnType<typeof createServer> | undefined
  let browser: ReturnType<typeof spawn> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    const principalId = 'test-owner', channelId = 'visualize-provider-342', members = [principalId, agentId]
    await seedUserMembership(principalId, companyId)
    await pool.query("UPDATE participants SET capabilities='[]'::jsonb WHERE company_id=$1 AND id=$2", [companyId, agentId])
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
    // Direct in-process control and Worker share this one installed runtime.
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: 'visualize-provider-342-source', version: 1, author: { id: principalId, kind: 'human' }, mentions: [agentId],
      text: 'Create a small interactive diagram comparing two invented stages, Gather and Check. Include one button labeled Switch stage that toggles between them and shows a short description.' },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool, identity, channelId)
    const options: WorkerOptions & { semanticReview: 'selective' } = { controlPlane: api, policy: new ProductRuntimePolicy(),
      worker: { id: 'visualize-provider-342', shutdownGraceMs: 1000 }, model, semanticReview: 'selective',
      modelBudget: { maxModelCalls: 12, maxTokens: 250000, maxCostMicros: 1_000_000, wallClockMs: 180000,
        inputCostMicrosPerMillion: Math.ceil(pricing.inputPerMillion * 1_000_000 / pricing.usdCny),
        outputCostMicrosPerMillion: Math.ceil(pricing.outputPerMillion * 1_000_000 / pricing.usdCny) } }
    worker = createWorker(options)
    const signal = AbortSignal.timeout(190000)
    while (!await worker.runNext()) { signal.throwIfAborted(); await delay(20) }
    let state = await api.readRunState(identity)
    while (state?.delivery === 'pending') { signal.throwIfAborted(); await delay(20); state = await api.readRunState(identity) }
    report.execution = state?.run.status; report.delivery = state?.delivery
    const actions: string[] = []
    let cursor = 0
    while (true) {
      const page = await api.readEvents(identity, cursor)
      actions.push(...page.events.flatMap(event => event.kind === 'tool.started' && typeof event.data.name === 'string' ? [event.data.name] : []))
      if (!page.events.length || page.nextSeq === cursor) break
      cursor = page.nextSeq
    }
    report.actions = actions
    assert.equal(actions.find(action => action.startsWith('skills.') || action.startsWith('visualize.')), 'skills.activate')
    assert.equal(state?.run.status, 'succeeded'); assert.equal(state.delivery, 'delivered')
    const references = visualizeReferences(state.message?.body ?? '')
    assert.equal(references.length, 1)
    const path = references[0].reference.path
    const documents = await pool.query('SELECT version FROM im_visualize_documents WHERE run_id=$1', [identity.runId])
    assert.equal(documents.rowCount, 1)
    assert.ok(actions.includes('visualize.read'))
    const stored = await readAuthorizedVisualizeSnapshot({ companyId, channelId, userId: principalId, path })
    report.resource = { count: 1, version: stored.version, sourceHash: stored.source_hash, literalReferencePresent: true }
    const settledLedger = async (runId: string) => {
      const deadline = AbortSignal.timeout(3000)
      for (;;) {
        const rows = (await pool.query('SELECT purpose,status FROM llm_calls WHERE company_id=$1 AND run_id=$2 ORDER BY created_at,id', [companyId, runId])).rows
        if (rows.length) return rows
        deadline.throwIfAborted(); await delay(20)
      }
    }
    const ledger = () => settledLedger(identity.runId)
    const before = await ledger()
    assert.ok(before.length > 0)
    assert.ok(before.every(row => !/content|review/.test(row.purpose)), 'No semantic review call')
    report.modelCalls = before.length
    const source = im.messages.find(message => message.channelId === channelId && message.fromUid === agentId)
    assert.ok(source)
    const app = await buildApiTestApp(principalId)
    app.get('/__visualize_live/manifest', (_req, res) => res.json({ companyId, projectId, channelId, path, sourceMessageId: source.clientMsgNo }))
    server = createServer(app)
    await new Promise<void>(resolve => server!.listen(Number(process.env.E2E_VISUALIZE_LIVE_API_PORT ?? 5194), '127.0.0.1', resolve))
    browser = spawn(process.execPath, ['node_modules/e2e/dist/cli/bin.js', 'run', '--config', 'e2e.visualize-provider-342.config.ts'], {
      stdio: 'inherit', env: { ...process.env, E2E_TELEMETRY_DISABLED: '1', E2E_VISUALIZE_LIVE_OUTPUT: output } })
    const exit = await new Promise<number | null>((resolve, reject) => { browser!.once('error', reject); browser!.once('exit', resolve) })
    assert.equal(exit, 0, 'Official browser resource/readback gate')
    assert.deepEqual(await ledger(), before, 'Browser interaction performs no extra model call')
    report.browser = JSON.parse(await readFile(`${output}/provider-browser.json`, 'utf8'))
    // A new ordinary request must not inherit the previous visual workflow's
    // selective gate, add a judge, or revise an already correct short answer.
    const question = await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: 'direct-question-384', version: 1, author: { id: principalId, kind: 'human' }, mentions: [agentId],
      text: 'Reply with only the numeric result of 17 + 26.' },
    { mode: 'execute', deliveryMode: 'text', executionClass: 'conversation', codeExecution: 'disabled' })
    const questionIdentity = question.runs[0]; assert.ok(questionIdentity)
    await bindProductRun(pool, questionIdentity, channelId)
    const questionDeadline = AbortSignal.timeout(60000)
    while (!await worker.runNext()) { questionDeadline.throwIfAborted(); await delay(20) }
    let questionState = await api.readRunState(questionIdentity)
    while (questionState?.delivery === 'pending') {
      questionDeadline.throwIfAborted(); await delay(20); questionState = await api.readRunState(questionIdentity)
    }
    assert.equal(questionState?.run.status, 'succeeded')
    assert.equal(questionState?.message?.body.trim(), '43')
    const questionCalls = await settledLedger(questionIdentity.runId)
    assert.equal(questionCalls.length, 1, 'One useful answer generation, with no semantic judge or correction')
    assert.ok(questionCalls.every(row => !/content|review/.test(row.purpose)))
    report.directQuestion = { status: 'passed', correct: true, measuredCalls: 1, semanticReviewCalls: 0 }
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.failure = 'required-live-delivery-check-failed'; throw error }
  finally {
    await writeFile(`${output}/provider-runtime.json`, JSON.stringify(report, null, 2) + '\n')
    browser?.kill('SIGTERM'); await worker?.stop()
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())) }
    await teardownAll(); await im.close()
  }
})
