import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
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
import { assertLocalQualificationTarget } from './_local-qualification-target.js'
import { retainedAppendText } from './_retained-answer-measurement.js'
import { qualificationModelDiagnostics } from './_qualification-model-diagnostics.js'
import { openNotebookClient } from '../modules/knowledge/provider.js'

// Opt-in only. Preparation/typechecking never executes a provider call.
// Failure model: docs/evidence/issue-342/FAILURE-MODEL.md.
test('real provider activates and delivers a synthetic interactive diagram without semantic review', {
  skip: process.env.LINGXIOS_LIVE_VISUALIZE_342 !== '1', timeout: 300000,
}, async t => {
  assertLocalQualificationTarget(env.DATABASE_URL)
  assert.equal(process.env.LINGXILOOP_DISABLE_EMBEDDINGS, '1', 'Keep unrelated embedding calls disabled in this narrow provider gate')
  assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  assert.ok(process.env.ISSUE342_RUNTIME_VERSION, 'Require the exact candidate runtime version')
  assert.equal(releaseVersions.runtime, process.env.ISSUE342_RUNTIME_VERSION)
  const [major, minor, patch] = releaseVersions.runtime.split('.').map(Number)
  assert.ok(major > 3 || major === 3 && (minor > 8 || minor === 8 && patch >= 7), 'Stable answer sources require runtime 3.8.7 or newer')
  const model = runtimeModelConfiguration({ id: env.OPENAI_MODEL, apiKey: env.OPENAI_API_KEY, baseUrl: env.OPENAI_BASE_URL }, 30000)
  // This opt-in diagnostic runs once; preserve bounded runtime corrections but
  // do not silently retry a transport failure inside a logical provider call.
  model.recovery = { ...model.recovery, maxAttempts: 1 }
  assert.equal(model.publicTextProtocol, 'purpose-json-v3', 'Require the sealed source producer before a provider call')
  assert.equal(releaseVersions.publicText, 3)
  const pricing = siliconFlowPricingForModel(env.OPENAI_BASE_URL, env.OPENAI_MODEL, false)
  assert.ok(pricing, 'Require the existing product price snapshot for the actual provider/model')
  if (env.OPENAI_MODEL === 'deepseek-ai/DeepSeek-V4.1-Flash') {
    assert.equal(Reflect.get(model.capabilities, 'jsonObjectWithTools'), false, 'Require the qualified tools/wire configuration before calling the provider')
  }
  await ensureSchemaOnce(); await resetAllTables()
  const output = process.env.E2E_VISUALIZE_LIVE_OUTPUT ?? '.e2e/visualize-provider-342'
  const outputRelative = relative(process.cwd(), resolve(output))
  assert.ok(outputRelative && outputRelative !== '..' && !outputRelative.startsWith('../') && !isAbsolute(outputRelative),
    'The official browser output must be inside this project; fail before provider execution')
  await mkdir(output, { recursive: true })
  const report: Record<string, unknown> = { status: 'running', runtime: releaseVersions.runtime, publicText: releaseVersions.publicText, syntheticRequest: true,
    productionOperations: 0, realProvider: true, semanticReview: 'selective', originalCaseVerified: false }
  // Real model calls remain on their existing provider. Knowledge fixtures stay
  // local, with enabled sources so a zero-search result is not empty coverage.
  let knowledgeSearches = 0
  t.mock.method(openNotebookClient, 'search', async () => { knowledgeSearches++; return [] })
  t.mock.method(openNotebookClient, 'getSource', async () => ({ id: 'source:latency-local', full_text: 'Gather collects items. Check reviews those items.' }))
  const previousNotebook = process.env.OPEN_NOTEBOOK_ENABLED
  process.env.OPEN_NOTEBOOK_ENABLED = 'true'
  t.after(() => { if (previousNotebook === undefined) delete process.env.OPEN_NOTEBOOK_ENABLED; else process.env.OPEN_NOTEBOOK_ENABLED = previousNotebook })
  const im = await installRecordingWukong()
  let worker: ReturnType<typeof createWorker> | undefined, server: ReturnType<typeof createServer> | undefined
  let browser: ReturnType<typeof spawn> | undefined
  try {
    const { companyId, projectId, agentId } = await seedCompanyWithAgent()
    const principalId = 'test-owner', channelId = 'visualize-provider-342', members = [principalId, agentId]
    await seedUserMembership(principalId, companyId)
    await pool.query("UPDATE participants SET capabilities='[\"knowledge\"]'::jsonb WHERE company_id=$1 AND id=$2", [companyId, agentId])
    await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
    await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
    await pool.query(`INSERT INTO knowledge_notebook_bindings(project_id,company_id,external_key,external_notebook_id,state)
      VALUES($1,$2,'latency-live-notebook','notebook:latency-local','ready')`, [projectId, companyId])
    await pool.query(`INSERT INTO knowledge_sources(id,company_id,project_id,kind,title,external_source_id,status,stage,
      visibility_scope,owner_user_id,created_by_user_id,created_via)
      VALUES('latency-live-source',$1,$2,'text','Local fixture','source:latency-local','ready','ready','PROJECT',$3,$3,'USER')`,
    [companyId, projectId, principalId])
    // Direct in-process control and Worker share this one installed runtime.
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
    const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: 'visualize-provider-342-source', version: 1, author: { id: principalId, kind: 'human' }, mentions: [agentId],
    text: 'The invented workflow has two stages: Gather collects items, and Check reviews those items. First explain in English what each stage contributes and how the two work together, using only these given facts. Then create a small interactive diagram of Gather and Check. Show exactly one stage at a time, initially Gather. Use the current stage name as its visible heading. Under Gather show the exact description "Collect the items."; under Check show "Review the items." Include one button labeled Switch stage that toggles the visible stage and description in both directions.' },
    { mode: 'execute', deliveryMode: 'auto', executionClass: 'conversation', codeExecution: 'disabled' })
    const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool, identity, channelId)
    const measureAnswer = async (runId: string, isUseful: (text: string) => boolean) => {
      const finalState = await api.readRunState({ ...identity, runId })
      const acceptedSources = finalState?.message?.publicTextSources
      const acceptedIds = new Set(acceptedSources?.segments.map(source => source.partId) ?? [])
      const rows = (await pool.query<{ kind: string; data: Record<string, unknown>; elapsed_ms: number }>(`SELECT event.kind,event.data,
        EXTRACT(EPOCH FROM (event.recorded_at-work.created_at))*1000 AS elapsed_ms
        FROM lingxios.agent_run_events event JOIN lingxios.agent_work_items work ON work.id=event.run_id
        WHERE event.tenant_id=$1 AND event.run_id=$2 AND event.kind IN ('public.text.delta','public.text.sealed','tool.started','tool.completed') ORDER BY event.seq`,
      [companyId, runId])).rows
      const parts = new Map<string, {text:string;operation:string}>()
      const seals = new Map<string, string>()
      const saveCalls = new Set<string>()
      let firstAnswerMs: number | null = null, firstUsefulAnswerMs: number | null = null
      let firstSaveStartedMs: number | null = null, firstSaveCompletedMs: number | null = null
      let usefulAnswerExcerpt: string | null = null
      for (const event of rows) {
        const elapsed = Number(event.elapsed_ms)
        assert.ok(Number.isFinite(elapsed) && elapsed >= 0, 'Timing must come from recorded events')
        if (event.kind === 'tool.started' && ['visualize.save','visualize.chart','visualize.diagram','visualize.sliding_window'].includes(String(event.data.name))) {
          saveCalls.add(String(event.data.toolCallId)); firstSaveStartedMs ??= elapsed
        }
        if (event.kind === 'tool.completed' && saveCalls.has(String(event.data.toolCallId)) && event.data.isError === false
          && event.data.result && typeof event.data.result === 'object' && Reflect.get(event.data.result, 'status') === 'completed') firstSaveCompletedMs ??= elapsed
        if (event.kind === 'public.text.sealed' && event.data.version === 3 && typeof event.data.bodyHash === 'string') {
          seals.set(String(event.data.partId),event.data.bodyHash)
        }
        if (event.kind !== 'public.text.delta' || event.data.purpose !== 'answer' || typeof event.data.text !== 'string') continue
        firstAnswerMs ??= elapsed
        const id = String(event.data.partId), text = (parts.get(id)?.text ?? '') + event.data.text
        parts.set(id, {text,operation:String(event.data.operation)})
        // Only new deltas from sources retained by this request's committed
        // answer can qualify. Failed/replaced drafts and copied history cannot.
        const retainedText = retainedAppendText(acceptedSources?.segments ?? [],parts)
        if (acceptedIds.has(id) && event.data.operation==='append' && firstUsefulAnswerMs === null && isUseful(retainedText)) {
          firstUsefulAnswerMs = elapsed; usefulAnswerExcerpt = retainedText.trimStart().slice(0, 600)
        }
      }
      const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')
      const sourceProof = acceptedSources?.segments.map(source=>({ segmentId:source.segmentId,partId:source.partId,
        sealed:seals.get(source.partId)===source.bodyHash,
        exactRawHash:parts.has(source.partId) && sha256(parts.get(source.partId)!.text)===source.bodyHash })) ?? []
      const exactBody = !!acceptedSources && acceptedSources.segments.map(source=>parts.get(source.partId)?.text ?? '').join('').trim()===finalState?.message?.body
        && sha256(finalState?.message?.body ?? '')===acceptedSources.bodyHash
      return { basis: 'durable-public-event-recorded-at', browserPaintMeasured: false,
        firstAnswerMs, firstUsefulCandidateMs: firstUsefulAnswerMs, firstSaveStartedMs, firstSaveCompletedMs,
        usefulAnswerExcerpt, semanticAcceptance: 'requires-independent-excerpt-review',
        retainedSources: sourceProof, finalSourcesVerified:sourceProof.length>0 && sourceProof.every(source=>source.sealed && source.exactRawHash) && exactBody,
        usefulCandidateBeforeSave: firstUsefulAnswerMs !== null && firstSaveCompletedMs !== null && firstUsefulAnswerMs < firstSaveCompletedMs }
    }
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
    const saveCalls = new Set<string>(), saveReceipts: Array<Record<string, unknown>> = []
    let cursor = 0
    const modelFailures: Array<Record<string, unknown>> = []
    while (true) {
      const page = await api.readEvents(identity, cursor)
      actions.push(...page.events.flatMap(event => event.kind === 'tool.started' && typeof event.data.name === 'string' ? [event.data.name] : []))
      for (const event of page.events) {
        if (event.kind === 'run.failed') modelFailures.push({ stage: 'run.failed',
          diagnostics: qualificationModelDiagnostics(event.data.modelDiagnostics) })
        if (event.kind === 'tool.started' && event.data.name === 'visualize.save') saveCalls.add(String(event.data.toolCallId))
        if (event.kind === 'tool.completed' && saveCalls.has(String(event.data.toolCallId)) && event.data.isError === false) {
          const result = event.data.result as { status?: string; value?: Record<string, unknown> } | undefined
          if (result?.status === 'completed' && result.value) saveReceipts.push(result.value)
        }
      }
      if (!page.events.length || page.nextSeq === cursor) break
      cursor = page.nextSeq
    }
    report.actions = actions
    report.modelFailures = modelFailures
    report.modelReadCalled = actions.includes('visualize.read')
    // This filter locates a candidate, not semantic proof. Retain the actual
    // synthetic excerpt for independent review of role attribution and tense.
    report.timing = await measureAnswer(identity.runId, text => /\bGather\b/i.test(text) && /\bCheck\b/i.test(text)
      && /\bcollect(?:s|ed|ing|ion)?\b|\bbring(?:s|ing)?\s+together\b/i.test(text)
      && /\breview(?:s|ed|ing)?\b|\bexamin(?:e|es|ing|ation)\b|\binspect(?:s|ed|ing|ion)?\b/i.test(text))
    const settledLedger = async (runId: string) => {
      const deadline = AbortSignal.timeout(3000)
      for (;;) {
        const rows = (await pool.query(`SELECT purpose,status,measured,extras->>'operation' AS operation,
          latency_ms,extras->>'firstContentMs' AS provider_first_content_ms
          FROM llm_calls WHERE company_id=$1 AND run_id=$2 ORDER BY created_at,id`, [companyId, runId])).rows
        if (rows.length && rows.every(row => ['succeeded', 'failed'].includes(row.status))) return rows
        deadline.throwIfAborted(); await delay(20)
      }
    }
    const ledger = () => settledLedger(identity.runId)
    const before = await ledger()
    report.modelCalls = before.length
    report.calls = before
    assert.equal(actions.find(action => action.startsWith('skills.') || action.startsWith('visualize.')), 'skills.activate')
    assert.equal(state?.run.status, 'succeeded'); assert.equal(state.delivery, 'delivered')
    assert.equal((report.timing as { finalSourcesVerified: boolean }).finalSourcesVerified, true,
      'Useful text must be sealed, hash-matched and retained by the committed final source collection')
    const references = visualizeReferences(state.message?.body ?? '')
    assert.equal(references.length, 1)
    const path = references[0].reference.path
    const documents = await pool.query('SELECT version FROM im_visualize_documents WHERE run_id=$1', [identity.runId])
    assert.equal(documents.rowCount, 1)
    const stored = await readAuthorizedVisualizeSnapshot({ companyId, channelId, userId: principalId, path })
    assert.equal(saveReceipts.length, 1, 'One successful literal save, without repeating the side effect for a reference')
    const saved = saveReceipts[0]
    assert.equal(saved.path, path)
    assert.equal(saved.version, stored.version)
    assert.equal(saved.sourceHash, stored.source_hash)
    assert.deepEqual(saved.readback, { status: 'matched', requestVersion: 1, version: stored.version,
      sourceHash: stored.source_hash, completeLiteralInput: true, semanticValidation: false, browserValidation: false },
    'The public save result must prove its exact synchronous storage readback; it is not a semantic pass')
    report.resource = { count: 1, version: stored.version, sourceHash: stored.source_hash, literalReferencePresent: true }
    report.storageReadback = saved.readback
    assert.ok(before.length > 0)
    assert.ok(before.every(row => row.operation !== 'content-review'), 'No semantic review call in the measured operation ledger')
    assert.ok(before.every(row => row.status !== 'succeeded' || row.measured), 'Every successful generation must retain measured usage')
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
    assert.equal((report.timing as { usefulCandidateBeforeSave: boolean }).usefulCandidateBeforeSave, true,
      'A candidate explanation must arrive before the diagram save completes; its actual meaning still needs excerpt review')
    // A new ordinary request must not inherit the previous visual workflow's
    // selective gate, add a judge, or revise an already correct short answer.
    const priorKnowledgeSearches = knowledgeSearches
    const question = await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: 'direct-question-385', version: 1, author: { id: principalId, kind: 'human' }, mentions: [agentId],
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
    const questionCalls = await settledLedger(questionIdentity.runId)
    const questionEvents = await api.readEvents(questionIdentity, 0)
    report.directQuestion = { status: questionState?.run.status, delivery: questionState?.delivery, calls: questionCalls,
      modelFailures: questionEvents.events.filter(event => event.kind === 'run.failed').map(event => ({ stage: 'run.failed',
        diagnostics: qualificationModelDiagnostics(event.data.modelDiagnostics) })),
      timing: await measureAnswer(questionIdentity.runId, text => text.trim() === '43') }
    assert.equal(questionState?.run.status, 'succeeded')
    assert.equal(questionState?.message?.body.trim(), '43')
    assert.equal((report.directQuestion as { timing: { finalSourcesVerified: boolean } }).timing.finalSourcesVerified, true)
    assert.equal(questionCalls.length, 1, 'One useful answer generation, with no semantic judge or correction')
    assert.ok(questionCalls.every(row => row.operation !== 'content-review' && row.status === 'succeeded' && row.measured))
    assert.equal(questionEvents.events.filter(event => event.kind === 'tool.started' && String(event.data.name).startsWith('knowledge.')).length, 0)
    assert.equal(knowledgeSearches, priorKnowledgeSearches, 'Ordinary arithmetic does not run automatic text/vector retrieval despite authorized enabled sources')
    report.directQuestion = { status: 'passed', correct: true, measuredCalls: 1, semanticReviewCalls: 0,
      knowledgeTools: 0, automaticKnowledgeSearches: 0, enabledKnowledgeSources: 1,
      calls: questionCalls, timing: await measureAnswer(questionIdentity.runId, text => text.trim() === '43') }
    report.status = 'passed'
  } catch (error) { report.status = 'failed'; report.failure = 'required-live-delivery-check-failed'; throw error }
  finally {
    await writeFile(`${output}/provider-runtime.json`, JSON.stringify(report, null, 2) + '\n')
    browser?.kill('SIGTERM'); await worker?.stop()
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())) }
    await teardownAll(); await im.close()
  }
})
