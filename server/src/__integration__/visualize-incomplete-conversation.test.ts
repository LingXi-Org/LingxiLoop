import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions, skillIndex } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { readRunProjection } from '../agent-runtime/assistant-transport.js'
import { buildNativeRunTrace } from '../agent-runtime/run-trace.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText } from '../../../src/lib/nativeMessage.js'
import { runTraceSchema } from '../../../src/lib/runTrace.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model: docs/evidence/issue-298/FAILURE-MODEL.md. Uses the published
// Worker and OpenAI HTTP driver, real local PostgreSQL, and synthetic responses.
// Pre-fix receipt is preserved separately; these assertions require formal3.8.2.
test('ordinary and activated conversations repair missing delivery; exhausted repair remains partial', { timeout: 60000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const principalId = 'incomplete-visual-owner'
  await seedUserMembership(principalId, companyId)
  const api = await lingxiOSControl(), receipts: object[] = []
  const requestText = 'Create an interactive comparison of network layers and explain their differences.'
  const answer = 'Each layer inspects a different header. Use the interactive comparison below.'
  const commentary = 'Preparing an interactive comparison.'
  const usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
  let worker: ReturnType<typeof createWorker> | undefined
  try {
    for (const scenario of ['ordinary','activated','exhausted','quoted-peer','protocol-exhausted','handoff'] as const) {
      const activated = scenario === 'activated', exhausted = scenario === 'exhausted', handoff = scenario === 'handoff', protocolExhausted = scenario === 'protocol-exhausted'
      const protocolFailures = activated || handoff || protocolExhausted ? 2 : exhausted ? 0 : 1
      const firstCandidate = protocolFailures+1+(activated ? 1 : 0), partial = exhausted || handoff || protocolExhausted
      const peer = `visual-peer-${scenario}`
      await pool.query("INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status) VALUES($1,$2,'agent',$1,'reviewer','P','#abcdef','avail')",[peer,companyId])
      const room = `incomplete-visual-${scenario}`, members = [principalId, agentId, peer]
      await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [room,companyId,projectId,JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [room,companyId,JSON.stringify({ channelType: 2,members })])
      const policy = await syncConversationPolicy(api,companyId,room)
      let calls = 0, reviews = 0, repairs = 0, reference = '', path = ''
      const providerErrors: unknown[] = []
      const provider = createServer((req,res) => { void (async () => {
        let raw = ''; for await (const chunk of req) raw += chunk
        const input = JSON.parse(raw)
        if (!input.stream) {
          reviews++
          const instructions = input.messages.filter((m: { role: string }) => m.role === 'system').map((m: { content: string }) => m.content).join('\n')
          const value = instructions.includes('proposed content-review finding') ? { deferred: [] }
            : reference ? { missing: [] } : { missing: [{ quote: requestText, reason: 'The requested interactive comparison has not been delivered.' }] }
          res.writeHead(200,{ 'content-type': 'application/json' })
          res.end(JSON.stringify({ model: 'synthetic-visual',choices: [{ message: { role: 'assistant',content: JSON.stringify(value) },finish_reason: 'stop' }],usage })); return
        }
        const n = ++calls
        res.writeHead(200,{ 'content-type': 'text/event-stream' })
        const send = (delta: object, finish: string | null = null) => res.write(`data: ${JSON.stringify({ model: 'synthetic-visual',choices: [{ index: 0,delta,finish_reason: finish }],...(finish ? { usage } : {}) })}\n\n`)
        const tool = (name: string,args: object) => send({ tool_calls: [{ index: 0,id: `call-${n}`,type: 'function',function: { name,arguments: JSON.stringify(args) } }] },'tool_calls')
        // Two different malformed purpose envelopes demonstrate why a red
        // model attempt alone cannot identify the original provider failure.
        if (n <= protocolFailures && n === 1) send({ content: 'Unframed synthetic content.' },'stop')
        else if (n <= protocolFailures && n === 2) send({ content: '{"commentary":"","answer":42}' },'stop')
        else if (activated && n === protocolFailures+1) {
          const { name,version,hash } = skillIndex(visualizeSkill)
          tool('skills__activate',{ name,version,hash })
        } else if (n === firstCandidate || exhausted) {
          const candidate = handoff ? `- Reviewer \`@${peer}\` Verify the comparison.` : scenario === 'quoted-peer' ? `> @${peer} This is a quoted example.\n\n${answer}` : answer
          send({ content: JSON.stringify({ commentary,answer: candidate }) },'stop')
        } else if (n === firstCandidate+1) {
          assert.ok(JSON.stringify(input.messages).includes(activated ? 'product:visualize-authoring' : 'fix the omissions'))
          repairs++
          tool('visualize__save',{ name: 'network-comparison',html: '<div><button type="button" onclick="this.nextElementSibling.hidden=false">Compare layers</button><p hidden>Link: frames. Network: packets.</p></div>' })
        } else if (n === firstCandidate+2) {
          const last = input.messages.filter((m: { role: string }) => m.role === 'tool').at(-1)
          const saved = JSON.parse(last.content)
          path = saved.value.path; reference = saved.value.reference
          assert.ok(reference && path)
          tool('visualize__read',{ path })
        } else if (n === firstCandidate+3) {
          send({ content: JSON.stringify({ commentary: '',answer: `Link switches forward frames; network switches route packets.\n\n${reference}` }) },'stop')
        } else throw new Error(`unexpected synthetic provider call ${n}`)
        res.end('data: [DONE]\n\n')
      })().catch(error => { providerErrors.push(error); res.destroy() }) })
      await new Promise<void>(resolve => provider.listen(0,'127.0.0.1',resolve))
      try {
        const address = provider.address(); assert.ok(address && typeof address !== 'string')
        worker = createWorker({ controlPlane: api,policy: new ProductRuntimePolicy(),worker: { id: `incomplete-visual-${scenario}`,shutdownGraceMs: 1000 },
          model: { id: 'synthetic-visual',apiKey: 'synthetic-local-provider',baseUrl: `http://127.0.0.1:${address.port}/v1`,publicTextProtocol: 'purpose-json-v1',
            requestTimeoutMs: 10000,firstByteTimeoutMs: 2000,streamIdleTimeoutMs: 2000,contextWindowTokens: 1_000_000 },
          // Native handoff reserves a default 120s child call and a 120s closing call.
          // Give the fixture that real admission budget; correction limits are unchanged.
          modelBudget: { maxModelCalls: 16,maxTokens: 1_000_000,wallClockMs: 300000 } })
        const accepted = await api.conversations.ingest({ tenantId: companyId,conversationId: room,policyVersion: policy.version,
          messageId: `incomplete-visual-request-${scenario}`,version: 1,author: { id: principalId,kind: 'human' },mentions: [agentId],text: requestText },
        { mode: 'execute',deliveryMode: 'auto',executionClass: 'conversation',codeExecution: 'disabled' })
        const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool,identity,room)
        const deadline = AbortSignal.timeout(25000)
        while (!await worker.runNext()) { deadline.throwIfAborted(); await delay(10) }
        let state = await api.readRunState(identity)
        while (state?.delivery === 'pending') { deadline.throwIfAborted(); await delay(10); state = await api.readRunState(identity) }
        assert.deepEqual(providerErrors,[])
        const projection = await readRunProjection(api,identity,true,undefined,undefined,undefined,true)
        const replay = projection.snapshot.message
        const ledger = (await pool.query('SELECT purpose,status,extras FROM llm_calls WHERE company_id=$1 AND run_id=$2 ORDER BY created_at,id',[companyId,identity.runId])).rows
        const failed = ledger.filter(row => row.status === 'failed')
        assert.equal(failed.length,protocolFailures)
        assert.ok(failed.every(row => row.extras.failure?.category === 'protocol'))
        assert.equal(state?.delivery,'delivered')
        assert.equal(nativeText(replay).includes(commentary),false,'process text must not enter the answer projection')
        assert.ok(replay.content.some(part => part.type === 'text' && part.text === commentary && activityAnnotation(part)?.kind === 'commentary'))
        assert.equal(state?.run.status,partial ? 'partial' : 'succeeded')
        const nativeTrace = await api.readRunTrace(identity), rootTrace = nativeTrace?.spans.find(span => span.spanId === nativeTrace.rootSpanId)
        assert.equal(rootTrace?.state,partial ? 'partial' : 'complete')
        assert.ok(rootTrace?.startedAt && rootTrace.completedAt && rootTrace.completedAt >= rootTrace.startedAt,'execution really ended, independently of goal satisfaction')
        const viewerTrace = runTraceSchema.parse(replay.metadata.custom.runTrace)
        assert.equal(viewerTrace.timingBasis,'execution'); assert.equal(viewerTrace.root.status,rootTrace.state)
        assert.equal(viewerTrace.startedAt,rootTrace.startedAt); assert.equal(viewerTrace.root.start,0)
        assert.equal(viewerTrace.root.end,rootTrace.completedAt-rootTrace.startedAt)
        assert.deepEqual(runTraceSchema.parse((await readRunProjection(api,identity,true,undefined,undefined,undefined,true)).snapshot.message.metadata.custom.runTrace),viewerTrace,'refresh and replay preserve the complete native viewer trace')
        if (!partial) {
          assert.equal(calls,firstCandidate+3); assert.equal(repairs,1)
          assert.equal(state?.run.goalOutcome?.status,'satisfied')
          assert.equal(replay.status?.type,'complete')
          assert.ok(nativeText(replay).includes(reference))
          assert.equal((await pool.query('SELECT resolution FROM lingxios.agent_skill_activations WHERE work_id=$1',[identity.runId])).rows[0].resolution,'delivered')
        } else {
          assert.equal(calls,exhausted ? 3 : firstCandidate); assert.equal(repairs,0)
          assert.equal(state?.run.goalOutcome?.status,'partial')
          assert.equal(replay.status?.type,'incomplete')
          if(exhausted || protocolExhausted)assert.equal(nativeText(replay),answer)
          assert.equal((await pool.query('SELECT count(*)::int n FROM im_visualize_documents WHERE run_id=$1',[identity.runId])).rows[0].n,0)
          if(handoff){
            assert.ok(nativeText(replay).includes(`@${peer}`))
            assert.ok((await pool.query('SELECT 1 FROM lingxios.agent_work_items WHERE tenant_id=$1 AND agent_id=$2',[companyId,peer])).rowCount,'committed authorized mention dispatches actual peer work')
          }
        }
        receipts.push({ scenario,activated,initialProtocolFailures: protocolFailures,execution: state?.run.status,traceState: rootTrace?.state,actualExecutionEnd: !!rootTrace?.completedAt,generationCalls: calls,reviews,repairs,failedProtocolAttempts: failed.length,outcome: state?.run.goalOutcome?.status,
          delivery: state?.delivery,renderedReferencePresent: !!reference && nativeText(replay).includes(reference),commentaryOutsideAnswer: true })
      } finally {
        await worker?.stop(); worker = undefined
        provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
      }
    }
    // Exercise the installed public reader for blocked completion as well as
    // the actual Worker partial cases above. No native table/state patching.
    const blocked = { runId: 'visual-blocked-trace',tenantId: companyId,agentId,principalId,sessionId: 'blocked-trace-room' }
    await api.enqueueJob({ ...blocked,id: blocked.runId,text: 'Synthetic blocked boundary',kind: 'trace_probe',lane: 'interactive' })
    const traceHost = api.connectWorker({ workerId: 'blocked-trace-probe',workKinds: ['trace_probe'] })
    const blockedWork = await traceHost.claimWork(); assert.equal(blockedWork?.id,blocked.runId); assert.ok(blockedWork)
    await traceHost.emitEvent(blockedWork,{ runId: blocked.runId,seq: 1,kind: 'run.started',stage: 'started',visibility: 'user',data: {} })
    await traceHost.completeWork(blockedWork,{ status: 'completed',goalOutcome: { requestVersion: 1,status: 'blocked',verification: 'inconclusive',gaps: ['Synthetic external dependency unavailable'] } })
    const blockedState = await api.readRunState(blocked), blockedTrace = await api.readRunTrace(blocked); assert.ok(blockedTrace)
    const blockedRoot = blockedTrace.spans.find(span=>span.spanId===blockedTrace.rootSpanId)!
    assert.equal(blockedState?.run.status,'blocked'); assert.equal(blockedState?.run.goalOutcome?.status,'blocked')
    assert.equal(blockedRoot.state,'blocked'); assert.ok(blockedRoot.startedAt && blockedRoot.completedAt && blockedRoot.completedAt >= blockedRoot.startedAt)
    const blockedDto = buildNativeRunTrace(blockedTrace)
    assert.equal(blockedDto.root.status,'blocked'); assert.equal(blockedDto.root.durationMs,blockedRoot.completedAt-blockedRoot.startedAt)
    assert.deepEqual(await api.readRunTrace(blocked),blockedTrace)
    receipts.push({ scenario: 'blocked-public-reader',execution: blockedState?.run.status,traceState: blockedRoot.state,actualExecutionEnd: true,replayStable: true })
    await mkdir('artifacts/issue-298',{ recursive: true })
    await writeFile('artifacts/issue-298/incomplete-conversation.json',JSON.stringify({ runtime: releaseVersions.runtime,syntheticOnly: true,
      realPostgres: true,publishedWorker: true,publishedOpenAIDriver: true,productionRequests: 0,originalCaseVerified: false,receipts },null,2)+'\n')
  } finally { await worker?.stop(); await teardownAll(); await im.close() }
})
