import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { assistantRunResponse, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText, type NativeMessage } from '../../../src/lib/nativeMessage.js'
import type { RunDisplayState } from '../../../src/lib/agentRunSnapshot.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model: docs/evidence/issue-215-public/FAILURE-MODEL.md, cases 2/3/5.
// Real public Worker/control/SQL/SSE; synthetic driver; no provider credentials.
before(async () => { await ensureSchemaOnce(); await resetAllTables(); installFakeWukong() })
after(async () => { await teardownAll() })

for (const outcome of ['complete','cancelled','revoked','unsafe','final-stream'] as const) test(`durable prefix crosses real Worker/SSE and state-first reload (${outcome})`, { timeout: 20000 }, async () => {
  const completes = outcome === 'complete' || outcome === 'final-stream'
  const { companyId,projectId,agentId } = await seedCompanyWithAgent()
  const principalId = `issue215-public-human-${outcome}`, conversationId = `issue215-public-room-${outcome}`
  await seedUserMembership(principalId,companyId)
  await pool.query("UPDATE participants SET capabilities='[\"files\"]'::jsonb WHERE id=$1",[agentId])
  const members = [principalId,agentId]
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)",[conversationId,companyId,projectId,JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)',[conversationId,companyId,JSON.stringify({ channelType: 2,members })])
  const api = await lingxiOSControl(), policy = await syncConversationPolicy(api,companyId,conversationId)
  const accepted = await api.conversations.ingest({ tenantId: companyId,conversationId,policyVersion: policy.version,messageId: 'issue215-public-source',
    version: 1,author: { id: principalId,kind: 'human' },text: 'Inspect the available files and answer briefly.',mentions: [agentId] },
  { mode: 'execute',deliveryMode: 'text',executionClass: 'conversation',codeExecution: 'disabled' })
  const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool,identity,conversationId,false,'issue215-public-source')
  let release!: () => void, emitted!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), firstDelta = new Promise<void>(resolve => { emitted = resolve })
  const usage = { available: true,inputTokens: 20,outputTokens: 10 }
  let calls = 0
  const worker = createWorker({ controlPlane: api,policy: new ProductRuntimePolicy(),worker: { id: 'issue215-public-worker',concurrency: 1,shutdownGraceMs: 1000 },
    model: { modelId: 'issue215-public-fixture',previewFormat: 'user-text',contextWindowTokens: 200000,
      async run(request) {
        calls++
        if (calls === 1) {
          await request.onTextDelta?.('I will inspect the available files.'); emitted(); await gate
          if (outcome === 'unsafe') {
            for (const chunk of ['\n<','th','ink>','PRIVATE_STREAM_SENTINEL','</think>']) await request.onTextDelta?.(chunk)
            return { text: 'I will inspect the available files.\n<think>PRIVATE_STREAM_SENTINEL</think>',output: [],usage }
          }
          if (!completes) await request.onTextDelta?.('PRIVATE_AFTER_REVOKE_OR_CANCEL')
          return { text: 'I will inspect the available files.',output: [{ type: 'function_call',callId: 'issue215-files',name: 'files__list',arguments: '{}' }],usage }
        }
        if (outcome === 'final-stream') await request.onTextDelta?.('The inspection is complete.')
        return { text: 'The inspection is complete.',output: [{ role: 'assistant',content: 'The inspection is complete.' }],usage }
      },
      async structured() { return { model: 'issue215-public-fixture',value: { missing: [] },usage } },
      async compact() { throw new Error('short public activity fixture must not compact') },
    } })
  const cancellation = new AbortController()
  let running: Promise<boolean> | undefined
  let streamRead: Promise<void> | undefined
  try {
    const projection = await readRunProjection(api,identity,true), upstream = await api.streamRun(identity,{ signal: cancellation.signal })
    assert.ok(upstream.body)
    const response = assistantRunResponse(upstream.body,projection,{ api,identity,signal: cancellation.signal })
    const reader = AssistantStream.fromResponse(response,new AssistantTransportDecoder()).getReader(), tracker = new AssistantTransportDeltaTracker()
    let sawPrefix!: () => void
    let sawTerminal!: (message: NativeMessage) => void
    const visible = new Promise<void>(resolve => { sawPrefix = resolve })
    const terminal = new Promise<NativeMessage>(resolve => { sawTerminal = resolve })
    streamRead = (async () => {
      try {
        while (true) {
          const next = await reader.read(); if (next.done) break
          if (next.value.type !== 'update-state') continue
          tracker.append(next.value.operations)
          const message = (tracker.state as unknown as { message?: NativeMessage }).message
          if (message?.content.some(part => part.type === 'text' && part.text === 'I will inspect the available files.' && activityAnnotation(part)?.kind === 'answer')) sawPrefix()
          if (message?.status?.type === 'complete') sawTerminal(message)
        }
      } finally { await reader.cancel(); reader.releaseLock() }
    })()
    running = worker.runNext()
    await Promise.race([firstDelta,running.then(() => { throw new Error('Worker returned before its first public prefix') })])
    const page = await api.readEvents(identity)
    assert.ok(page.events.some(event => event.kind === 'public.text.delta'),'the prefix must commit before driver/tool completion')
    assert.equal(page.events.some(event => event.kind === 'tool.started'),false)
    await Promise.race([visible,running.then(() => { throw new Error('Worker returned before the public prefix reached SSE') })])
    const beforeTool = (await readRunProjection(api,identity,true)).snapshot.message
    assert.equal(nativeText(beforeTool),'I will inspect the available files.','an unresolved public prefix must remain a live answer candidate')
    assert.equal(beforeTool.status?.type,'running','the visible candidate is not a committed final answer')
    const published = beforeTool.content.filter(part => activityAnnotation(part)?.kind === 'answer')
    assert.equal(published.length,1)
    if (outcome === 'cancelled') await api.cancel(identity)
    if (outcome === 'revoked') await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1",
      [conversationId,JSON.stringify([...members,'new-recipient'])])
    release(); await running
    const replayProjection = await readRunProjection(api,identity,true), replay = replayProjection.snapshot.message
    if (outcome !== 'unsafe') assert.equal(nativeText(replay),completes ? 'The inspection is complete.' : 'I will inspect the available files.')
    const retained = replay.content.filter(part => activityAnnotation(part)?.kind === 'commentary')
    if (outcome === 'final-stream') {
      const copies = replay.content.filter(part => part.type === 'text' && part.text === 'The inspection is complete.')
      const latestCommentary = retained.at(-1)
      await mkdir('artifacts/issue215-public',{ recursive: true })
      await writeFile('artifacts/issue215-public/captured-final-message.json',JSON.stringify(replay))
      await writeFile('artifacts/issue215-public/captured-final-activity.json',JSON.stringify(replayProjection.activityPage(0)))
      await writeFile('artifacts/issue215-public/final-stream-foreground.json',JSON.stringify({ runtime: releaseVersions.runtime,
        finalAnswerCopiesInSnapshot: copies.length,latestCommentaryIsFinalAnswer: latestCommentary?.type === 'text' && latestCommentary.text === nativeText(replay),
        realLocalPostgres: true,realWorker: true,syntheticDriver: true,productionRequests: 0 },null,2))
      assert.equal(copies.length,1,'the accepted streamed final answer must not be duplicated as the latest foreground explanation')
      const history = replayProjection.activityPage(0)
      assert.equal(history.message.content.filter(part => activityAnnotation(part)?.kind === 'commentary').length,2)
      assert.ok(history.message.content.some(part => part.type === 'text' && part.text === 'The inspection is complete.'))
      assert.equal((replay.metadata.custom.activityHistory as { total: number }).total,history.total)
      const streamedFinal = await terminal
      assert.equal(streamedFinal.content.filter(part => part.type === 'text' && part.text === 'The inspection is complete.').length,1)
    }
    if (outcome === 'unsafe') {
      // A safe prefix from the rejected candidate remains in RunActivity after
      // replacement, with its identity intact and only the committed answer in the body.
      const current = await api.readRunState(identity)
      assert.ok(current?.message && current.run.resultId)
      assert.equal(current.run.status,'succeeded')
      assert.equal(current.message.agentId,identity.agentId)
      assert.equal(current.message.envelope.requestVersion,current.run.requestVersion)
      assert.equal(current.message.envelope.body,'The inspection is complete.')
      const harness = replay.metadata.custom.harness as unknown as RunDisplayState
      assert.equal(harness.resultId,current.run.resultId)
      assert.equal(harness.messageFence,current.run.resultFence)
      assert.deepEqual(replay.status,{ type: 'complete',reason: 'stop' })
      assert.equal(nativeText(replay),'The inspection is complete.')
      assert.ok(calls >= 2,'the unsafe candidate must be replaced by a later successful response')
      assert.equal(retained.length,1,'the replaced safe prefix belongs in RunActivity')
      assert.equal(activityAnnotation(retained[0])?.id,activityAnnotation(published[0])?.id)
      assert.equal(activityAnnotation(retained[0])?.label,'已替换的答复草稿')
      const publishedId = activityAnnotation(published[0])?.id
      assert.ok(publishedId)
      const history = replayProjection.activityPage(0)
      const archived = history.message.content.filter(part => activityAnnotation(part)?.id === publishedId)
      assert.equal(archived.length,1)
      assert.ok(archived[0].type === 'text')
      assert.equal(archived[0].text,'I will inspect the available files.')
      assert.doesNotMatch(JSON.stringify(history),/candidate-json|PRIVATE_REASONING|PRIVATE_ARGUMENTS|PRIVATE_AFTER_REVOKE_OR_CANCEL|PRIVATE_STREAM_SENTINEL/)
    } else if (completes) {
      assert.equal(retained.length,1)
      assert.equal(activityAnnotation(retained[0])?.id,activityAnnotation(published[0])?.id)
    } else {
      assert.equal(retained.length,0,'cancellation or revocation does not turn the already authorized partial answer into process')
      const partial = replay.content.filter(part => activityAnnotation(part)?.kind === 'answer')
      assert.equal(partial.length,1)
      assert.equal(activityAnnotation(partial[0])?.id,activityAnnotation(published[0])?.id)
      const history = replayProjection.activityPage(0)
      assert.equal(history.message.content.filter(part => activityAnnotation(part)?.id === activityAnnotation(published[0])?.id).length,1)
      assert.doesNotMatch(JSON.stringify(history),/PRIVATE_AFTER_REVOKE_OR_CANCEL|PRIVATE_STREAM_SENTINEL/)
    }
    assert.equal(replay.content.some(part => part.type === 'tool-call' && part.toolName === 'files.list'),completes)
    if (outcome === 'cancelled' || outcome === 'revoked') assert.deepEqual(replay.status,{ type: 'incomplete',reason: outcome === 'cancelled' ? 'cancelled' : 'error' })
    const allEvents = await api.readEvents(identity)
    const joinedPublic = allEvents.events.filter(event => event.kind === 'public.text.delta').map(event => String(event.data.text)).join('')
    assert.doesNotMatch(joinedPublic,/PRIVATE_STREAM_SENTINEL|PRIVATE_AFTER_REVOKE_OR_CANCEL/)
    assert.doesNotMatch(JSON.stringify(replay),/candidate-json|PRIVATE_REASONING|PRIVATE_ARGUMENTS|PRIVATE_AFTER_REVOKE_OR_CANCEL|PRIVATE_STREAM_SENTINEL/)
    await mkdir('artifacts/issue215-public',{ recursive: true })
    await writeFile(`artifacts/issue215-public/worker-stream-${outcome}.json`,JSON.stringify({ passed: true,runtime: releaseVersions.runtime,outcome,
      realLocalPostgres: true,realWorker: true,syntheticDriver: true,publicBeforeTool: true,officialAssistantTransport: true,
      stateFirstReload: true,commentaryCount: retained.length,modelCalls: calls,productionRequests: 0 },null,2))
  } finally { release(); cancellation.abort(); await running; await streamRead; await worker.stop() }
})
