import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'
import { createLingxiOS, skillIndex, type AssistantMessage, type SkillDefinition, type ToolDefinition, type WorkItem } from '@lyyzka/lingxios'
import { createWorker, type HostPort, type ModelDriver } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { lingxiOSControl, prepareLingxiOSWorkerContext, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { RETIRED_VISUALIZE_NOTICE } from '../agent-runtime/retired-capabilities.js'
import { createNativeMessage, nativeText } from '../im/message-types.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async () => { await teardownAll() })

test('persisted old activation cannot resume across a changed harness, and native host resolves it only as unsupported partial delivery', { timeout: 30_000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const userId = 'retirement-user', channelId = 'retirement-restart'
  const members = [userId, agentId]
  await seedUserMembership(userId, companyId)
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Retirement restart',$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  // This is historical metadata only. Neither the former authoring tool nor
  // frontend is restored, and the single fixture action must never execute.
  const skill: SkillDefinition = { name: 'visualize', version: 'historical-metadata-fixture', description: 'Historical activation fixture',
    body: 'Historical metadata fixture. No legacy implementation is available.', actions: ['fixture.inspect'], delivery: { checker: 'product:visualize-delivery' } }
  const index = skillIndex(skill)
  let forbiddenExecution = 0, modelCalls = 0
  const tool: ToolDefinition = { name: 'fixture__inspect', action: 'fixture.inspect', description: 'Unexecuted metadata fixture',
    effect: 'read', approval: false, parameters: { type: 'object', properties: {}, additionalProperties: false }, parse: () => ({}),
    async authorize() {}, async execute() { forbiddenExecution++; throw new Error('historical fixture has no executable implementation') } }
  const old = await createLingxiOS({ database: pool, background: { role: 'passive' },
    harness: { id: 'historical-retirement-fixture', version: 'old', mode: 'execute', capabilities: [{ id: 'fixture', tools: [tool], skills: [skill] }] },
    modelBudget: { inputCostMicrosPerMillion: 1, outputCostMicrosPerMillion: 1 },
    capabilityResolver: { async resolve() { return [{ name: 'fixture', methods: ['inspect'] }] } },
    contextProvider: { async loadContext(work) { return { persona: { name: 'Historical fixture', role: 'test', instructions: 'Activate historical metadata only.' }, capabilities: ['fixture'],
      messages: [{ ref: work.triggerRef, authorId: userId, authorName: 'Fixture user', authorKind: 'human' as const, body: 'Retain this original request.', createdAt: work.createdAt ?? '' }] } } } })
  let session: Parameters<HostPort['saveSession']>[1] | undefined, heldWork: WorkItem | undefined
  let releaseOldAction!: () => void, activationReached!: () => void
  const oldActionHeld = new Promise<void>(resolve => { releaseOldAction = resolve })
  const activationPersisted = new Promise<void>(resolve => { activationReached = resolve })
  const model: ModelDriver = { modelId: 'synthetic-retirement-activation',
    async run() { modelCalls++; assert.equal(modelCalls, 1); return { text: '', usage: { available: true, inputTokens: 10, outputTokens: 10 },
      output: [{ type: 'function_call', callId: 'historical-activation', name: 'skills__activate', arguments: JSON.stringify({ name: index.name, version: index.version, hash: index.hash }) }] } },
    async compact() { throw new Error('fixture must not compact') }, async structured() { throw new Error('fixture must not review') } }
  const worker = createWorker({ model, controlPlane: { connectWorker(input) {
    const host = old.connectWorker(input)
    return { ...host, async saveSession(work, value) { await host.saveSession(work, value); session = structuredClone(value) },
      async executeAction(work, action, signal) {
        const result = await host.executeAction(work, action, signal)
        if (action.action === 'skills.activate' && result.ok) {
          heldWork = work; activationReached()
          // Simulate disconnect after the native transaction committed but
          // before the old Worker observed/journaled its acknowledgment.
          await oldActionHeld
        }
        return result
      } }
  } }, worker: { id: 'historical-activation', concurrency: 1 } })
  let oldAttempt: Promise<boolean> | undefined
  try {
    const policy = await syncConversationPolicy(old, companyId, channelId)
    const identity = (await old.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version, messageId: 'original-request', version: 1,
      author: { id: userId, kind: 'human' }, text: 'Retain this original request.', mentions: [agentId] }, { mode: 'execute', codeExecution: 'disabled', executionClass: 'conversation' })).runs[0]
    assert.ok(identity); await bindProductRun(pool, identity, channelId)
    const retainedHtml = '<p>Historical source remains intact.</p><script>neverExecute()</script>'
    const retainedBody = 'Original historical body. ::visualize{path="/retained/visualize/restart.html"}'
    await pool.query(`INSERT INTO im_visualize_documents(company_id,channel_id,path,run_id,agent_id,created_by,html,source_hash)
      VALUES($1,$2,'/retained/visualize/restart.html',$3,$4,$5,$6,$7)`, [companyId, channelId, identity.runId, agentId, userId, retainedHtml, createHash('sha256').update(retainedHtml).digest('hex')])
    await pool.query(`INSERT INTO im_visualize_states(company_id,channel_id,path,user_id,state) VALUES($1,$2,'/retained/visualize/restart.html',$3,$4::jsonb)`, [companyId, channelId, userId, JSON.stringify({ annotation: 'retained' })])
    im.messages.push({ channelId, channelType: 2, messageId: 'retained-message', clientMsgNo: 'retained-client', messageSeq: 1,
      fromUid: agentId, timestamp: Date.now() / 1000, payload: createNativeMessage({ id: 'retained-client', role: 'assistant', content: [{ type: 'text', text: retainedBody }], custom: { runId: identity.runId } }) })
    oldAttempt = worker.runNext(); await activationPersisted
    assert.equal(modelCalls, 1); assert.equal(forbiddenExecution, 0)
    assert.equal((await old.readRun(identity))?.status, 'leased')
    assert.ok(heldWork)
    const pending = await old.connectWorker({ workerId: 'historical-reader', workKinds: ['turn'] }).verifyCandidate(heldWork, { body: 'Not delivered yet.', requestVersion: 1, artifacts: [] })
    assert.ok(pending.records.some(record => record.checker.startsWith('skill-delivery:') && record.status === 'inconclusive' && record.evidence.available === true))
    assert.ok(session?.request); const saved = session, originalRequest = saved.request; assert.ok(originalRequest)
    assert.equal(originalRequest.originalText, 'Retain this original request.')
    await old.stop()

    // Reconnect through the actual current product registry and harness. The
    // native SDK pins the old harness; do not rewrite its hash or replay code.
    prepareLingxiOSWorkerContext()
    const current = await lingxiOSControl()
    const host = current.connectWorker({ workerId: 'current-retirement-host', workKinds: ['turn'] })
    // Public host reconnect uses the still-valid fenced proof of the same
    // in-flight attempt; it neither claims a second writer nor changes pins.
    const work = heldWork; assert.ok(work); assert.equal(work.id, identity.runId)
    await assert.rejects(host.loadContext(work), /harness version mismatch; resume with the pinned deployment or drain the old run/)
    assert.equal(forbiddenExecution, 0); assert.equal(modelCalls, 1)
    assert.equal((await current.readRun(identity))?.resultId, null)
    const restored = await host.loadSession(work, saved.key); assert.ok(restored?.request)
    assert.equal(restored.request.originalText, originalRequest.originalText)

    // This explicit trusted-host resolution proves the public native delivery
    // boundary; it is not a product auto-resume path or a harness-pin bypass.
    const unsupportedBody = `${RETIRED_VISUALIZE_NOTICE}\n原始说明与历史存档保留，可继续阅读文字。`
    const dishonest = await host.verifyCandidate(work, { body: 'The old interactive result is delivered.', requestVersion: 1, artifacts: [] })
    assert.ok(dishonest.records.some(record => record.checker.startsWith('skill-delivery:') && record.status !== 'passed'))
    const candidate = { body: unsupportedBody, requestVersion: 1, artifacts: [] }
    const checked = await host.verifyCandidate(work, candidate)
    const native = checked.records.find(record => record.checker.startsWith('skill-delivery:'))
    assert.ok(native); assert.equal(native.status, 'passed'); assert.equal(native.evidence.outcome, 'unsupported'); assert.equal(native.evidence.available, false)
    assert.ok(checked.records.some(record => record.checker === 'product:retired-capability' && record.status === 'inconclusive'))
    const goalOutcome = { status: 'partial' as const, verification: 'inconclusive' as const, requestVersion: 1, gaps: ['Historical interactive capability retired without delivery.'] }
    const envelope = { version: 1 as const, ...candidate, evidenceSnapshotId: restored.request.evidence.id, citations: [], citationEvidence: [],
      ...(restored.request.contract ? { taskContract: restored.request.contract } : {}), ...(restored.request.resourceChecks?.length ? { resourceChecks: restored.request.resourceChecks } : {}), goalOutcome }
    const message: AssistantMessage = { version: 2, runId: work.id, agentId, sessionId: work.sessionId, body: unsupportedBody, envelope }
    await host.commitResult(work, message)
    releaseOldAction(); assert.equal(await oldAttempt, true); await worker.stop()
    const final = await current.readRunState(identity)
    assert.equal(final?.run.status, 'partial'); assert.equal(final.message?.body, unsupportedBody)
    assert.equal(final.run.goalOutcome?.status, 'partial')
    assert.equal(forbiddenExecution, 0); assert.equal(modelCalls, 1)
    assert.equal(nativeText(im.messages.find(value => value.messageId === 'retained-message')!.payload), retainedBody)
    assert.deepEqual((await pool.query('SELECT html FROM im_visualize_documents WHERE run_id=$1', [identity.runId])).rows, [{ html: retainedHtml }])
    assert.deepEqual((await pool.query('SELECT state FROM im_visualize_states WHERE company_id=$1', [companyId])).rows, [{ state: { annotation: 'retained' } }])
  } finally { releaseOldAction(); await oldAttempt; await worker.stop(); await old.stop(); await stopLingxiOSControl(); await im.close() }
})
