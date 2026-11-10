import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { skillIndex } from '@lingxi-org/lingxios'
import { createWorker } from '@lingxi-org/lingxios/worker'
import { createNode } from '../../../shared/artifact-document.js'
import { artifactVersionKey, prepareBatch } from '../../../shared/artifact-operations.js'
import { DESIGN_INCOMPLETE_NOTICE, ProductRuntimePolicy } from '../agent-runtime/context.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { lingxiOSControl, runtimeModelConfiguration } from '../agent-runtime/runtime.js'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { nativeText } from '../im/message-types.js'
import { ensureConversationDesign } from '../modules/artifacts/facade.js'
import { readNativeDocument, submitNativeOperations } from '../modules/artifacts/native-document.js'
import { artifactSkills } from '../modules/artifacts/skills.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async () => { await teardownAll() })

function annotateFixtureFailure(error: unknown, calls: number) {
  if (process.env.GITHUB_ACTIONS !== 'true') return
  // Emit only a fixed repository path, numeric source line and fixture stage.
  // Error messages and provider requests can contain private runtime context.
  const match = error instanceof Error ? /runtime-design-failure\.test\.ts:(\d+):\d+/.exec(error.stack ?? '') : null
  const line = match ? Number(match[1]) : undefined
  console.error(`::error file=server/src/__integration__/runtime-design-failure.test.ts${line && Number.isSafeInteger(line) ? `,line=${line}` : ''}::Native Design fixture failed at provider stage ${calls}`)
}

test('failed native Design save rejects false partial completion before publication and preserves truthful text and existing files', { timeout: 40_000 }, async context => {
  let calls = 0, finished = false, humanTitleVersion = 0
  context.signal.addEventListener('abort', () => { if (!finished) annotateFixtureFailure(undefined, calls) }, { once: true })
  try {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const channelId = 'design-failed-save', userId = 'design-failure-user', members = [userId, agentId]
  await seedUserMembership(userId, companyId)
  await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3', [JSON.stringify(['design']), companyId, agentId])
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Failed Design save',$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const canvas = await ensureConversationDesign(companyId, channelId, userId)
  let original = (await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [canvas.id])).rows
  const snapshot = await readNativeDocument(pool, canvas.id); assert.ok(snapshot)
  const pageId = snapshot.document.pageOrder[0]!
  const batch = prepareBatch(snapshot.document, [
    { type: 'page.patch', pageId, patch: { title: 'Uncommitted browser explanation' } },
    { type: 'node.insert', pageId, node: { ...createNode('text', 'browser-flow'), text: 'Uncommitted browser explanation' } },
  ], 'conflicting-save')
  const titleVersion = artifactVersionKey.page(pageId, 'field/title')
  const index = skillIndex(artifactSkills.find(skill => skill.name === 'claude-design')!)
  const falseClaim = '浏览器流程画板已经准备好了，所有内容已保存并检查通过。'
  const explanation = '浏览器先通过 DNS 找到地址，再建立连接，服务器返回内容，最后浏览器解析并渲染页面。'
  const fallback = `${DESIGN_INCOMPLETE_NOTICE}\n${explanation}\n本次保存发生版本冲突，新画板没有保存；原有内容保持完整。`
  let providerError: unknown, streamingCorrectionSeen = false
  const provider = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw); calls++; assert.ok(calls <= 11, 'one bounded false candidate correction only')
      const business: Array<{ name: string; args: unknown }> = []
      if (calls === 1) { assert.equal(input.tool_choice?.function?.name, 'design__plan_explanation'); business.push({ name: 'design__plan_explanation', args: { delivery: 'canvas' } }) }
      if (calls === 2) { assert.equal(input.tool_choice?.function?.name, 'skills__load'); business.push({ name: 'skills__load', args: { name: index.name, version: index.version, hash: index.hash } }) }
      if (calls === 3) business.push({ name: 'design__read_reference', args: { page: 'native-model.md' } })
      if (calls === 4) business.push({ name: 'design__current', args: {} })
      if (calls === 5) business.push({ name: 'design__read_document', args: {} })
      if (calls === 6) business.push({ name: 'design__read_page', args: { pageId, version: snapshot.pageVersions[pageId], atSeq: snapshot.document.seq } })
      // One schema-valid stale target rejects the entire operation batch:
      // neither its page title nor its new node may enter the saved document.
      if (calls === 7) business.push({ name: 'design__prepare_ops', args: { baseSeq: batch.baseSeq, operations: batch.operations } })
      if (calls === 8) {
        const outputs = input.messages.filter((message: { role: string }) => message.role === 'tool').map((message: { content: string }) => JSON.parse(message.content))
        const planId = outputs.findLast((output: { receipt?: { action?: string } }) => output.receipt?.action === 'design.prepare_ops')?.receipt?.idempotencyKey
        assert.equal(typeof planId, 'string')
        const human = await withTransaction(pool, db => submitNativeOperations(db, { artifactId: canvas.id, companyId, actorId: userId, actorKind: 'user',
          request: prepareBatch(snapshot.document, [{ type: 'page.patch', pageId, patch: { title: '人的并发修改' } }], 'human-concurrent') }))
        humanTitleVersion = human.document.versions[titleVersion]
        original = (await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [canvas.id])).rows
        business.push({ name: 'design__apply_ops', args: { planId } })
      }
      if (calls <= 5) assert.equal(input.tool_choice?.function?.name, business[0]?.name, 'initial native prerequisites use their published required tool selections')
      // The theme-bearing document read is represented by a bounded observation.
      // Policy must not derive a forced page target from its truncated preview;
      // the model can select native tools or return strict structured content.
      if (calls === 6) assert.equal(input.tool_choice, 'auto', 'bounded document observations leave the next native tool selection to the model')
      if (calls === 9) {
        const outputs = input.messages.filter((message: { role: string }) => message.role === 'tool').map((message: { content: string }) => JSON.parse(message.content))
        const rejected = outputs.find((output: { receipt?: { action?: string }; ok?: boolean }) => output.receipt?.action === 'design.apply_ops' && output.ok === false)
        assert.deepEqual(rejected?.value?.conflicts, [{ key: titleVersion, expected: snapshot.document.versions[titleVersion] ?? 0, actual: humanTitleVersion }], 'the SDK must receive structured conflict fields after sanitizing exception text')
        assert.equal(rejected.diagnostics?.recovery, 'refresh')
        assert.ok(JSON.stringify(input.messages).includes('version_conflict'),'model must receive the supported conflict code')
        assert.ok(JSON.stringify(input.messages).includes('refresh'),'model must receive refresh recovery guidance')
        assert.equal(input.tool_choice, 'auto', 'a failed write stops forcing prerequisite actions while preserving native business tools'); business.push({ name: 'design__check', args: {} }) }
      const toolCalls = business.map((tool, position) => ({ index: position, id: `design-failure-business-${calls}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }))
      let content: string | undefined
      if (calls >= 10) {
        const operation = { kind: 'append', supersedes: [] }
        if (calls === 11) {
          streamingCorrectionSeen = (input.messages as Array<{ content?: unknown }>).some(message => typeof message.content === 'string' && message.content.includes('The public response was withheld by the trusted streaming safety policy.'))
          assert.equal(streamingCorrectionSeen, true, 'the failed streaming candidate must receive the native bounded correction')
          // SDK 4 records failed replacement targets only after a public delta
          // was acknowledged. This candidate fails its first safety assessment,
          // so there is no published part to replace; the truthful answer appends.
        }
        content = JSON.stringify({ operation,
          commentary: '', answer: calls === 10 ? falseClaim : fallback, outcome: { status: 'partial', gaps: ['Requested new canvas was not saved because its version changed.'] } })
      }
      for (const call of toolCalls) assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === call.function.name), call.function.name)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      if (calls === 11) {
        // Split the required notice itself. A partial valid prefix must be
        // held until its remainder arrives, not rejected as unsupported text.
        const args = content!, cut = args.indexOf(DESIGN_INCOMPLETE_NOTICE) + 4
        response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: args.slice(0, cut) }, finish_reason: null }] })}\n\n`)
        await delay(70)
        response.end(`data: ${JSON.stringify({ choices: [{ delta: { content: args.slice(cut) }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
        return
      }
      response.end(`data: ${JSON.stringify({ choices: [{ delta: content === undefined ? { tool_calls: toolCalls } : { content }, finish_reason: content === undefined ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
    } catch (error) { providerError ??= error; annotateFixtureFailure(error, calls); response.writeHead(500); response.end('{}') }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    worker = createWorker({ controlPlane: api, policy: new ProductRuntimePolicy(), modelBudget: { maxModelCalls: 11, wallClockMs: 30_000 }, model: {
      ...runtimeModelConfiguration({ id: 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: 'synthetic-design-failure', baseUrl: 'https://api.siliconflow.cn/v1' }, 90_000),
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
    }, worker: { id: 'design-failure-worker', concurrency: 1 } })
    const identity = (await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version,
      messageId: 'browser-explanation', version: 1, author: { id: userId, kind: 'human' }, text: '请在画板中拆开讲解浏览器加载网页的全过程。', mentions: [agentId] },
    { mode: 'execute', codeExecution: 'disabled', executionClass: 'conversation' })).runs[0]
    assert.ok(identity); await bindProductRun(pool, identity, channelId); assert.equal(await worker.runNext(), true)
    assert.equal(providerError, undefined); assert.equal(calls, 11)
    const deadline = AbortSignal.timeout(5000)
    let final = await api.readRunState(identity)
    while (final?.delivery === 'pending') { deadline.throwIfAborted(); await delay(20); final = await api.readRunState(identity) }
    assert.equal(final?.run.status, 'partial'); assert.equal(final.delivery, 'delivered')
    assert.equal(final.message?.body, fallback); assert.ok(final.message.body.includes(explanation)); assert.equal(final.message.body.includes(falseClaim), false)
    const receipts = (await pool.query(`SELECT i.intent->'action'->>'action' AS action,r.result FROM lingxios.agent_action_intents i
      JOIN lingxios.agent_action_ledger r USING(idempotency_key) WHERE i.intent->>'workId'=$1 ORDER BY i.recorded_at,i.idempotency_key`, [identity.runId])).rows
    for (const action of ['design.read_document', 'design.read_page']) assert.ok(receipts.some(receipt => receipt.action === action && receipt.result.ok), `successful native prerequisite: ${action}`)
    const writes = receipts.filter(receipt => receipt.action === 'design.apply_ops')
    assert.equal(writes.length, 1); assert.equal(writes[0].result.ok, false)
    assert.equal(writes[0].result.code, 'version_conflict'); assert.equal(writes[0].result.executionState, 'no_effect')
    assert.equal(writes[0].result.diagnostics.category, 'version')
    assert.equal(writes[0].result.diagnostics.recovery, 'refresh')
    assert.ok(receipts.some(receipt => receipt.action === 'design.check' && receipt.result.ok && receipt.result.value.problems === 0), 'checking the old canvas cannot certify the failed save')
    assert.deepEqual((await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [canvas.id])).rows, original)
    const events = (await api.readEvents(identity)).events
    const rejected = (await pool.query("SELECT data FROM lingxios.agent_run_events WHERE run_id=$1 AND kind='model.failed'", [identity.runId])).rows
    assert.equal(rejected.length, 1); assert.equal(rejected[0].data.hop, 10)
    assert.equal(rejected[0].data.modelDiagnostics.outputCallback, 'delta', 'the unsupported candidate must fail inside streaming before final sealing')
    const provisionalFalseClaimObserved = JSON.stringify(events.filter(event => event.visibility === 'user')).includes(falseClaim)
    assert.equal(provisionalFalseClaimObserved, false)
    assert.equal(events.filter(event => event.kind === 'public.text.delta').map(event => event.data.text).join(''), fallback, 'only truthful text may enter user-visible deltas')
    assert.equal(events.filter(event => event.kind === 'public.text.ended' && event.data.reason === 'failed').length, 0, 'a fully withheld candidate must not create a failed public source to replace')
    const seals = events.filter(event => event.kind === 'public.text.sealed')
    assert.equal(seals.length, 1, 'the rejected false candidate must never acquire a sealed source')
    assert.equal(seals[0].data.attemptId, `${identity.runId}:1:model:11`)
    assert.equal(seals[0].data.operation, 'append')
    assert.deepEqual(seals[0].data.supersedes, [])
    assert.equal(final.message.publicTextSources?.segments.length, 1)
    assert.equal(final.message.publicTextSources.segments[0].partId, seals[0].data.partId)
    const delivered = im.messages.filter(message => message.channelId === channelId && message.payload.role === 'assistant').map(message => nativeText(message.payload))
    assert.deepEqual(delivered, [fallback]); assert.equal(delivered.some(body => body.includes(falseClaim)), false)
    console.info(JSON.stringify({ qualification: 'synthetic-native-design-save-failure', failedSave: writes[0].result.code, calls,
      streamingCorrectionSeen, status: final.run.status, delivery: final.delivery, falseClaimInAcceptedBody: false,
      provisionalFalseClaimObserved, originalFilesUnchanged: true }))
  } catch (error) { annotateFixtureFailure(error, calls); throw error }
  finally { await worker?.stop(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); await im.close() }
  } catch (error) { annotateFixtureFailure(error, calls); throw error }
  finally { finished = true }
})
