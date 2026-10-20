import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions } from '@lyyzka/lingxios'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool } from '../db/pool.js'
import { lingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { assistantRunResponse, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { activityAnnotation } from '../../../src/lib/runActivity.js'
import { nativeText, type NativeMessage } from '../../../src/lib/nativeMessage.js'
import { ensureSchemaOnce, installFakeWukong, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'

// Failure model: docs/evidence/issue-215-public/FAILURE-MODEL.md, cases 2/3/5.
// Real public Worker/control/SQL/SSE; synthetic driver; no provider credentials.
before(async () => { await ensureSchemaOnce(); await resetAllTables(); installFakeWukong() })
after(async () => { await teardownAll() })

for (const outcome of ['complete','cancelled','revoked'] as const) test(`durable prefix crosses real Worker/SSE and state-first reload (${outcome})`, { timeout: 20000 }, async () => {
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
  const worker = createWorker({ controlPlane: api,worker: { id: 'issue215-public-worker',concurrency: 1,shutdownGraceMs: 1000 },
    model: { modelId: 'issue215-public-fixture',previewFormat: 'user-text',contextWindowTokens: 200000,
      async run(request) {
        calls++
        if (calls === 1) {
          await request.onTextDelta?.('I will inspect the available files.'); emitted(); await gate
          if (outcome !== 'complete') await request.onTextDelta?.('PRIVATE_AFTER_REVOKE_OR_CANCEL')
          return { text: '',output: [{ type: 'function_call',callId: 'issue215-files',name: 'files__list',arguments: '{}' }],usage }
        }
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
    const visible = new Promise<void>(resolve => { sawPrefix = resolve })
    streamRead = (async () => {
      try {
        while (true) {
          const next = await reader.read(); if (next.done) break
          if (next.value.type !== 'update-state') continue
          tracker.append(next.value.operations)
          const message = (tracker.state as unknown as { message?: NativeMessage }).message
          if (message?.content.some(part => part.type === 'text' && part.text === 'I will inspect the available files.' && activityAnnotation(part)?.kind === 'commentary')) sawPrefix()
        }
      } finally { await reader.cancel(); reader.releaseLock() }
    })()
    running = worker.runNext()
    await firstDelta
    const page = await api.readEvents(identity)
    assert.ok(page.events.some(event => event.kind === 'public.text.delta'),'the prefix must commit before driver/tool completion')
    assert.equal(page.events.some(event => event.kind === 'tool.started'),false)
    await visible
    const beforeTool = (await readRunProjection(api,identity,true)).snapshot.message
    assert.equal(nativeText(beforeTool),'','public commentary cannot masquerade as a validated answer')
    const published = beforeTool.content.filter(part => activityAnnotation(part)?.kind === 'commentary')
    assert.equal(published.length,1)
    if (outcome === 'cancelled') await api.cancel(identity)
    if (outcome === 'revoked') await pool.query("UPDATE im_channel_bindings SET profile=jsonb_set(profile,'{members}',$2::jsonb) WHERE channel_id=$1",
      [conversationId,JSON.stringify([...members,'new-recipient'])])
    release(); await running
    const replay = (await readRunProjection(api,identity,true)).snapshot.message
    assert.equal(nativeText(replay),outcome === 'complete' ? 'The inspection is complete.' : '')
    const retained = replay.content.filter(part => activityAnnotation(part)?.kind === 'commentary')
    assert.equal(retained.length,1); assert.equal(activityAnnotation(retained[0])?.id,activityAnnotation(published[0])?.id)
    assert.equal(replay.content.some(part => part.type === 'tool-call' && part.toolName === 'files.list'),outcome === 'complete')
    if (outcome !== 'complete') assert.deepEqual(replay.status,{ type: 'incomplete',reason: outcome === 'cancelled' ? 'cancelled' : 'error' })
    assert.doesNotMatch(JSON.stringify(replay),/candidate-json|PRIVATE_REASONING|PRIVATE_ARGUMENTS|PRIVATE_AFTER_REVOKE_OR_CANCEL/)
    await mkdir('artifacts/issue215-public',{ recursive: true })
    await writeFile(`artifacts/issue215-public/worker-stream-${outcome}.json`,JSON.stringify({ passed: true,runtime: releaseVersions.runtime,outcome,
      realLocalPostgres: true,realWorker: true,syntheticDriver: true,publicBeforeTool: true,officialAssistantTransport: true,
      stateFirstReload: true,commentaryCount: retained.length,modelCalls: calls,productionRequests: 0 },null,2))
  } finally { release(); cancellation.abort(); await running; await streamRead; await worker.stop() }
})
