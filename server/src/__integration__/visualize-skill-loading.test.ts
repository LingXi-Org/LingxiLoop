import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createWorker } from '@lyyzka/lingxios/worker'
import { releaseVersions, skillIndex } from '@lyyzka/lingxios'
import { AssistantStream, AssistantTransportDecoder, AssistantTransportDeltaTracker } from 'assistant-stream'
import { pool } from '../db/pool.js'
import { lingxiOSControl, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { visualizeSkill } from '../agent-runtime/visualize-skill.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { assistantRunResponse, readRunProjection } from '../agent-runtime/assistant-transport.js'
import { readAuthorizedVisualizeDocument } from '../im/visualize.js'
import type { AgentRunSnapshot } from '../../../src/lib/agentRunSnapshot.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

// Failure model precedes this test: docs/evidence/feedback-272/FAILURE-MODEL.md.
// These are scripted LOCAL provider observations, not measurements of production
// latency, natural model behavior, browser rendering, or provider prompt caching.
const deferred = () => {
  let resolve!: () => void
  return { promise: new Promise<void>(done => { resolve = done }), resolve: () => resolve() }
}
const first = 'VLAN 将同一台交换机划分为不同的广播域；同一 VLAN 的端口能够收到该域内的广播。'
const final = '跨 VLAN 通信需要三层转发；改变端口所属 VLAN 会改变它所在的广播域。'
const html = '<div id="vlan-fixture" role="img" aria-label="两个独立广播域"><span>VLAN 10：端口 1、2</span><span>VLAN 20：端口 3、4</span></div>'
type Output = { ok?: boolean; truncated?: boolean; value?: { path?: string; html?: string; text?: string; next?: number | null; start?: number; end?: number }; observations?: Array<{ actionKey: string; sha256: string; characters: number }> }

test('selected authorized skill enables substantive SSE before tools without pagination, retaining native read compatibility', { timeout: 90000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables(); const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  // Match the scoped visualization fixture: unrelated optional product tools do
  // not belong to this request. Use the same bounded synthetic 256k context for
  // all modes. Formal 3.8.2 reaches 111921 input bytes in the direct path; with
  // 4096 output + 512 protocol reservation that exceeds the 128k hard limit.
  // This fixture checks delivery, not compaction or a real provider's capacity.
  await pool.query("UPDATE participants SET capabilities='[]'::jsonb WHERE company_id=$1 AND id=$2", [companyId, agentId])
  const principalId = 'test-owner'; await seedUserMembership(principalId, companyId)
  const api = await lingxiOSControl()
  const metrics: object[] = []
  try {
    for (const mode of ['direct', 'redundant-load-failure', 'pagination-compatibility'] as const) {
      const conversationId = `skill-loading-${mode}`, members = [principalId, agentId]
      await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group',$1,$4::jsonb)", [conversationId, companyId, projectId, JSON.stringify(members)])
      await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [conversationId, companyId, JSON.stringify({ channelType: 2, members })])
      const policy = await syncConversationPolicy(api, companyId, conversationId)
      const accepted = await api.conversations.ingest({ tenantId: companyId, conversationId, policyVersion: policy.version,
        messageId: `skill-loading-${mode}-source`, version: 1, author: { id: principalId, kind: 'human' }, text: '用可视化说明 VLAN 的广播域。', mentions: [agentId] },
      { mode: 'execute', deliveryMode: 'text', executionClass: 'conversation', codeExecution: 'disabled' })
      const identity = accepted.runs[0]; assert.ok(identity); await bindProductRun(pool, identity, conversationId)
      const releasePrefix = deferred(), releaseFinal = deferred(), prefixVisible = deferred(), finalVisible = deferred(), providerFailed = deferred()
      const errors: unknown[] = [], frames: AgentRunSnapshot[] = [], actions: string[] = []
      let calls = 0, contextBytes = 0, firstSubstantiveMs: number | undefined, completionMs = 0, path = '', phase = 'initial'
      let maxContextBytes = 0
      let ref: { actionKey: string; sha256: string; characters: number } | undefined
      let rangeText = '', firstRange = '', cursor = 0, rangeCalls = 0, oversizedTruncated = false, repeatedRangeEqual = false, eofEmpty = false, pastEofFailed = false
      let redundantLoadTruncated = false, referenceReadFailed = false
      const started = performance.now(), usage = { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
      const provider = createServer((req, res) => { void (async () => {
        let raw = ''; for await (const chunk of req) raw += chunk
        const request = JSON.parse(raw) as { stream?: boolean; messages: Array<{ role: string; content: string }> }
        if (!request.stream) {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ model: 'gpt-4o-mini', choices: [{ message: { content: '{"missing":[]}' }, finish_reason: 'stop' }], usage })); return
        }
        calls++
        const instructions = request.messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
        assert.equal(instructions.includes(visualizeSkill.body), calls > 1, 'full skill is absent until selected, then reaches every authorized hop')
        if (calls > 1) assert.equal(instructions.split(visualizeSkill.body).length - 1, 1, 'one complete current skill, without duplicate prompt injection')
        if (calls === 1) contextBytes = Buffer.byteLength(raw)
        const last = request.messages.filter(message => message.role === 'tool').at(-1)
        const output: Output | undefined = last ? JSON.parse(last.content) : undefined
        res.setHeader('content-type', 'text/event-stream'); res.flushHeaders()
        const send = (delta: object, finish: string | null = null) => res.write(`data: ${JSON.stringify({ model: 'gpt-4o-mini', choices: [{ index: 0, delta, finish_reason: finish }], ...(finish ? { usage } : {}) })}\n\n`)
        const call = (name: string, input: object) => {
          actions.push(name)
          if (name === 'observations__read') rangeCalls++
          send({ tool_calls: [{ index: 0, id: `skill-${mode}-${calls}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] }, 'tool_calls')
        }
        const range = (start: number, length = 4000) => { assert.ok(ref); call('observations__read', { actionKey: ref.actionKey, sha256: ref.sha256, start, length }) }
        const save = () => { phase = 'saved'; call('visualize__save', { name: `vlan-${mode}`, html }) }
        if (phase === 'initial') {
          send({ reasoning_content: 'PRIVATE_REASONING_SENTINEL' }); send({ content: first }); await releasePrefix.promise
          const { name, version, hash } = skillIndex(visualizeSkill)
          phase = 'loaded'; call('skills__load', { name, version, hash })
        } else if (phase === 'loaded') {
          assert.equal(output?.truncated, true, 'long native skills.load remains explicitly truncated')
          redundantLoadTruncated = true
          if (mode === 'direct') save()
          else if (mode === 'redundant-load-failure') {
            phase = 'failed-reference'; call('visualize__read_reference', { path: 'references/does-not-exist.md' })
          } else {
            ref = output.observations?.[0]; assert.ok(ref)
            phase = 'oversized'; range(0, 8000)
          }
        } else if (phase === 'failed-reference') {
          assert.equal(output?.ok, false, 'unknown reference must remain a failure')
          referenceReadFailed = true
          send({ content: '补充参考未能读取；当前上下文中已有完整制作规范，下面直接说明广播域。' })
          save()
        } else if (phase === 'oversized') {
          assert.equal(output?.truncated, true, 'an 8000-character range plus its JSON envelope still exceeds the tool budget')
          oversizedTruncated = true; phase = 'first-range'; range(0)
        } else if (phase === 'first-range') {
          assert.equal(output?.ok, true); assert.equal(output.truncated, undefined)
          firstRange = output.value!.text!; cursor = output.value!.next!; assert.ok(cursor > 0)
          phase = 'repeat-range'; range(0)
        } else if (phase === 'repeat-range') {
          assert.equal(output?.ok, true); assert.equal(output.value!.text, firstRange); assert.equal(output.value!.next, cursor)
          repeatedRangeEqual = true; rangeText = firstRange; phase = 'ranges'; range(cursor)
        } else if (phase === 'ranges') {
          assert.equal(output?.ok, true); assert.equal(output.truncated, undefined)
          assert.equal(output.value!.start, cursor, 'continue at the returned next offset')
          rangeText += output.value!.text
          if (output.value!.next !== null) { assert.ok(output.value!.next! > cursor); cursor = output.value!.next!; range(cursor) }
          else {
            assert.equal(JSON.parse(rangeText).body, visualizeSkill.body, 'every source character survives pagination')
            phase = 'eof'; range(ref!.characters)
          }
        } else if (phase === 'eof') {
          assert.equal(output?.ok, true); assert.equal(output.value!.text, ''); assert.equal(output.value!.next, null)
          eofEmpty = true; phase = 'past-eof'; range(ref!.characters + 1)
        } else if (phase === 'past-eof') {
          assert.equal(output?.ok, false, 'out-of-range access must fail, not invent another page')
          pastEofFailed = true; save()
        } else if (phase === 'saved') {
          assert.equal(output?.ok, true); path = output.value!.path!; assert.ok(path)
          phase = 'read'; send({ content: '两个广播域的图解已保存，接下来核对保存内容。' }); call('visualize__read', { path })
        } else {
          assert.equal(phase, 'read'); assert.equal(output?.ok, true); assert.equal(output.value!.html, html)
          phase = 'finished'; send({ content: final }); await releaseFinal.promise
          send({ content: `\n::visualize${JSON.stringify({ path })}` }); send({}, 'stop')
        }
        res.end('data: [DONE]\n\n')
      })().catch(error => { errors.push(error); providerFailed.resolve(); res.destroy() }) })
      await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
      const address = provider.address(); assert.ok(address && typeof address === 'object')
      const worker = createWorker({ controlPlane: api, policy: new ProductRuntimePolicy(), worker: { id: `skill-loading-${mode}`, shutdownGraceMs: 1000 },
        model: { id: 'gpt-4o-mini', apiKey: 'synthetic-local-provider', baseUrl: `http://127.0.0.1:${address.port}/v1`, requestTimeoutMs: 20000, firstByteTimeoutMs: 5000, streamIdleTimeoutMs: 15000, maxOutputTokens: 4096,
          countTokens(text) { const bytes = Buffer.byteLength(text); maxContextBytes = Math.max(maxContextBytes, bytes); return bytes },
          contextWindowTokens: 256000 } })
      const cancellation = new AbortController(), signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(mode === 'pagination-compatibility' ? 60000 : 25000)])
      let running: Promise<boolean> | undefined, reading: Promise<void> | undefined
      try {
        const projection = await readRunProjection(api, identity, true), upstream = await api.streamRun(identity, { signal }); assert.ok(upstream.body)
        const response = assistantRunResponse(upstream.body, projection, { api, identity, signal }), tracker = new AssistantTransportDeltaTracker()
        reading = (async () => {
          for await (const chunk of AssistantStream.fromResponse(response, new AssistantTransportDecoder())) {
            if (chunk.type !== 'update-state' || !chunk.operations.length) continue
            tracker.append(chunk.operations)
            const snapshot = structuredClone(tracker.state) as unknown as AgentRunSnapshot; frames.push(snapshot)
            const text = snapshot.message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('')
            if (text.includes(first)) { firstSubstantiveMs ??= Math.round(performance.now() - started); prefixVisible.resolve() }
            if (text.includes(final)) finalVisible.resolve()
          }
        })()
        running = worker.runNext()
        const visible = (gate: ReturnType<typeof deferred>) => Promise.race([gate.promise, providerFailed.promise.then(() => { throw errors[0] }), running!.then(async () => { const state = await api.readRunState(identity); throw new Error(`Worker ended before substantive public SSE: ${JSON.stringify(state?.run.goalOutcome)}`) })])
        await visible(prefixVisible)
        assert.ok(!actions.includes('visualize__save'), 'substantive explanation reaches the client before save arguments are sent')
        if (mode === 'direct') assert.deepEqual(actions, [], 'substantive explanation is visible before the skill selection call')
        releasePrefix.resolve(); await visible(finalVisible)
        assert.equal(frames.at(-1)!.message.status?.type, 'running', 'public text is not buffered to final completion')
        releaseFinal.resolve(); await running
        cancellation.abort(); await reading
        let state = await api.readRunState(identity)
        const deliveryDeadline = AbortSignal.timeout(5000)
        while (state?.delivery === 'pending') { deliveryDeadline.throwIfAborted(); await delay(20); state = await api.readRunState(identity) }
        completionMs = Math.round(performance.now() - started)
        assert.equal(state?.run.status, 'succeeded', JSON.stringify(state?.run.goalOutcome)); assert.equal(state?.delivery, 'delivered')
        assert.match(state?.message?.body ?? '', /::visualize/)
        assert.equal((await readAuthorizedVisualizeDocument({ companyId, channelId: conversationId, userId: principalId, path })).html, html)
        assert.deepEqual(errors, []); assert.doesNotMatch(JSON.stringify(frames), /PRIVATE_REASONING_SENTINEL/)
        if (mode === 'direct') { assert.equal(calls, 4); assert.equal(rangeCalls, 0); assert.equal(actions.filter(action => action === 'skills__load').length, 1) }
        if (mode === 'redundant-load-failure') { assert.equal(calls, 5); assert.equal(rangeCalls, 0); assert.ok(redundantLoadTruncated && referenceReadFailed) }
        if (mode === 'pagination-compatibility') assert.ok(oversizedTruncated && repeatedRangeEqual && eofEmpty && pastEofFailed)
        assert.ok(maxContextBytes + 4096 + 512 <= Math.floor(256000 * 0.9), 'all model inputs retain the conservative byte-based context guard')
        metrics.push({ mode, modelCalls: calls, readCalls: actions.filter(action => ['skills__load', 'observations__read', 'visualize__read_reference'].includes(action)).length,
          observationRangeCalls: rangeCalls, firstRequestBytes: contextBytes, firstSubstantiveMs, completionMs, frames: frames.length,
          contextWindowTokens: 256000, maxOutputTokens: 4096, maxContextBytes,
          redundantLoadTruncated, referenceReadFailed, oversizedTruncated, repeatedRangeEqual, eofEmpty, pastEofFailed,
          substantiveBeforeSkillLoad: true, substantiveBeforeSave: true, streamedBeforeFinalCompletion: true, delivered: true })
        await mkdir('artifacts/feedback272', { recursive: true })
        await writeFile('artifacts/feedback272/skill-loading-progress.json', JSON.stringify({ localProvider: true, metrics }, null, 2) + '\n')
      } finally {
        releasePrefix.resolve(); releaseFinal.resolve(); cancellation.abort()
        await worker.stop(); await running; await reading
        provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve()))
      }
    }
    await mkdir('artifacts/feedback272', { recursive: true })
    await writeFile('artifacts/feedback272/skill-loading.json', JSON.stringify({ passed: true, runtime: releaseVersions.runtime,
      realWorker: true, realPostgres: true, publishedOpenAIDriver: true, localProvider: true, productionRequests: 0, paidProviderRequests: 0,
      timingScope: 'Local scripted-provider measurements; includes test gates. Not production or natural-model latency.',
      paginationScope: 'Native compatibility probe deliberately repeats a range and probes EOF; it is not an unmodified legacy latency benchmark.',
      skillCharacters: visualizeSkill.body.length, skillBytes: Buffer.byteLength(visualizeSkill.body), skillSha256: createHash('sha256').update(visualizeSkill.body).digest('hex'), metrics }, null, 2) + '\n')
  } finally { await stopLingxiOSControl(); await teardownAll(); await im.close() }
})
