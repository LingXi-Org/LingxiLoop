import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { skillIndex } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { artifactSkills } from '../modules/artifacts/skills.js'
import { ensureConversationDesign } from '../modules/artifacts/facade.js'
import { checkArtifact } from '../modules/artifacts/check.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async () => { await teardownAll() })

const live = process.env.LINGXIOS_LIVE_ARTIFACTS === '1'
test(live ? 'real provider creates and checks the FlashAttention canvas with zero contract failures'
  : 'native Worker loads guidance before reference, existing-file read, artboard write and check', { timeout: live ? 300_000 : 40_000 }, async () => {
  await ensureSchemaOnce(); await resetAllTables()
  const im = await installRecordingWukong()
  const { companyId, projectId, agentId } = await seedCompanyWithAgent()
  const userId = 'test-owner', channelId = 'issue593-artboard', members = [userId, agentId]
  await seedUserMembership(userId, companyId)
  await pool.query('UPDATE participants SET capabilities=$1 WHERE company_id=$2 AND id=$3', [JSON.stringify(['design']), companyId, agentId])
  await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','FlashAttention',$4::jsonb)", [channelId, companyId, projectId, JSON.stringify(members)])
  await pool.query('INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb)', [channelId, companyId, JSON.stringify({ channelType: 2, members })])
  const canvas = await ensureConversationDesign(companyId, channelId, userId)
  const fixture = await readFile(new URL('./fixtures/design/flashattention.dc.html', import.meta.url), 'utf8')
  const index = skillIndex(artifactSkills.find(skill => skill.name === 'claude-design')!)
  let calls = 0, handlerError: unknown
  const decisions: Array<{ call: number; names: string[]; fullGuidance: boolean; referenceSchema: boolean }> = []
  const observe = (input: { messages: Array<{ role: string; content?: string }>; tools: Array<{ function: { name: string; parameters: { properties?: { page?: { enum?: string[] } } } } }> }) => {
    calls++
    const instructions = input.messages.filter(message => message.role === 'system').map(message => message.content ?? '').join('\n')
    const names = input.tools.map(tool => tool.function.name)
    const reference = input.tools.find(tool => tool.function.name === 'design__read_reference')
    const fullGuidance = instructions.includes('Complete registered system skill') && instructions.includes('One artboard: the skeleton')
    const referenceSchema = reference?.function.parameters.properties?.page?.enum?.includes('format.md') === true
    decisions.push({ call: calls, names: names.filter(name => name.startsWith('design__') || name.startsWith('skills__')), fullGuidance, referenceSchema })
    if (calls === 1) {
      assert.equal(names.some(name => name.startsWith('design__') && index.actions.some(action => action.replace('.', '__') === name)), false)
      assert.ok(instructions.includes(index.hash)); assert.ok(instructions.includes('format.md'))
      assert.ok(instructions.includes('skills.load')); assert.ok(instructions.includes('no delivery'))
    }
  }
  const provider = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw); observe(input); assert.ok(calls <= 7)
      const business: Array<{ name: string; args: unknown }> = []
      if (calls === 1) business.push({ name: 'skills__load', args: { name: index.name, version: index.version, hash: index.hash } })
      if (calls === 2) {
        assert.equal(decisions.at(-1)!.fullGuidance, true); assert.equal(decisions.at(-1)!.referenceSchema, true)
        business.push({ name: 'design__read_reference', args: { page: 'format.md' } })
      }
      if (calls === 3) business.push({ name: 'design__current', args: {} })
      if (calls === 4) business.push({ name: 'design__read_file', args: { path: 'project/canvas.json' } })
      if (calls === 5) {
        const file = (await pool.query("SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path='project/canvas.json'", [canvas.id])).rows[0]
        const content = JSON.parse(file.body.toString('utf8'))
        content.boards['FlashAttention.dc.html'] = { x: 0, y: 0, w: 1200, h: 820, title: 'FlashAttention' }
        content.order = ['FlashAttention.dc.html']
        business.push({ name: 'design__write_files', args: { files: { 'project/canvas.json': { content: JSON.stringify(content), ifMatch: file.sha256 }, 'project/FlashAttention.dc.html': { content: fixture, ifMatch: null } } } })
      }
      if (calls === 6) business.push({ name: 'design__check', args: {} })
      const output = { index: 0, id: `answer-${calls}`, type: 'function', function: { name: 'public_answer', arguments: JSON.stringify({ operation: { kind: 'append', supersedes: [] }, answer: calls === 7 ? 'FlashAttention 讲解已写入画板，格式检查通过。' : ['FlashAttention 保持精确注意力并减少数据搬运。','\n计算按块处理 Q、K、V。','\n在线 softmax 重标定累积量。','\n避免写回完整 N×N 矩阵。','\nIO 优化减少显存读写。','\n计算量仍保持二次量级。'][calls - 1], commentary: '', outcome: calls === 7 ? { status: 'satisfied', gaps: [] } : null }) } }
      const toolCalls = [output, ...business.map((item, index) => ({ index: index + 1, id: `business-${calls}-${index}`, type: 'function', function: { name: item.name, arguments: JSON.stringify(item.args) } }))]
      for (const call of toolCalls) assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === call.function.name), call.function.name)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: toolCalls }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
    } catch (error) { handlerError ??= error; console.info({ fixtureFailure: error instanceof Error ? error.message : String(error) }); response.writeHead(500); response.end('{}') }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const originalFetch = globalThis.fetch
  const wire: Array<{ call: number; status: number; tools: Array<{ index: number; name: string; fields: string[] }>; finish: string[]; closed: string }> = []
  if (live) globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    let schema: Map<string, Set<string>> | undefined
    if (url.startsWith(env.OPENAI_BASE_URL) && url.endsWith('/chat/completions') && init?.body) {
      const request = JSON.parse(String(init.body))
      if (request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer')) {
        observe(request)
        schema = new Map(request.tools.map((tool: { function: { name: string; parameters: { properties: object } } }) =>
          [tool.function.name, new Set(Object.keys(tool.function.parameters.properties))]))
      }
    }
    const response = await originalFetch(input, init)
    if (!schema || !response.ok || !response.body) return response
    const record = { call: calls, status: response.status, tools: [] as Array<{ index: number; name: string; fields: string[] }>, finish: [] as string[], closed: 'reading' }
    wire.push(record)
    const reader = response.body.getReader(), decoder = new TextDecoder(), argumentsByIndex = new Map<number, { name: string; args: string }>()
    let buffer = '', finalized = false
    const collect = (bytes: Uint8Array) => {
      buffer += decoder.decode(bytes, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1)
        if (!line.startsWith('data:') || line === 'data: [DONE]') continue
        try {
          const choice = JSON.parse(line.slice(5)).choices?.[0]
          if (choice?.finish_reason) record.finish.push(['stop', 'tool_calls', 'length'].includes(choice.finish_reason) ? choice.finish_reason : 'other')
          for (const part of choice?.delta?.tool_calls ?? []) {
            const value = argumentsByIndex.get(part.index) ?? { name: '', args: '' }
            value.name += typeof part.function?.name === 'string' ? part.function.name : ''
            value.args += typeof part.function?.arguments === 'string' ? part.function.arguments : ''
            argumentsByIndex.set(part.index, value)
          }
        } catch { /* Metadata only; the real driver still owns stream validation. */ }
      }
    }
    const finish = (closed: string) => {
      if (finalized) return; finalized = true; record.closed = closed
      record.tools = [...argumentsByIndex].map(([index, value]) => {
        let fields: string[] = []
        try { fields = Object.keys(JSON.parse(value.args)).map(key => schema!.get(value.name)?.has(key) ? key : '[unrecognized]') } catch { /* incomplete arguments */ }
        return { index, name: schema!.has(value.name) ? value.name : '[unknown]', fields }
      })
      argumentsByIndex.clear(); buffer = ''
    }
    // Pass through original bytes and cancellation. Persist only catalog names,
    // indices and schema field names; never bodies, prompts or argument values.
    return new Response(new ReadableStream({ async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) { finish('complete'); controller.close() }
        else { collect(chunk.value); controller.enqueue(chunk.value) }
      } catch (error) { finish('failed'); controller.error(error) }
    }, cancel(reason) { finish('cancelled'); return reader.cancel(reason) } }), { status: response.status, headers: response.headers })
  }
  let worker: ReturnType<typeof createWorker> | undefined
  const started = Date.now()
  try {
    const api = await lingxiOSControl(), policy = await syncConversationPolicy(api, companyId, channelId)
    const address = provider.address(); assert.ok(address && typeof address !== 'string')
    const model = runtimeModelConfiguration({ id: live ? env.OPENAI_MODEL : 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: live ? env.OPENAI_API_KEY : 'synthetic-only', baseUrl: live ? env.OPENAI_BASE_URL : 'https://api.siliconflow.cn/v1' }, 90_000)
    worker = createWorker({ modelBudget: { maxModelCalls: live ? 24 : 7, wallClockMs: live ? 240_000 : 30_000 }, controlPlane: api, policy: new ProductRuntimePolicy(),
      model: live ? model : { ...model, baseUrl: `http://127.0.0.1:${address.port}/v1` }, worker: { id: 'issue593-artboard', concurrency: 1 } })
    const run = (await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version, messageId: 'question', version: 1, author: { id: userId, kind: 'human' }, text: '为我在画板中讲解flashattention', mentions: [agentId] }, { mode: 'execute', codeExecution: 'disabled', deliveryMode: 'auto', executionClass: 'conversation' })).runs[0]
    assert.ok(run); await bindProductRun(pool, run, channelId); await worker.runNext(); assert.equal(handlerError, undefined)
    const deadline = AbortSignal.timeout(5_000); let state = await api.readRunState(run)
    while (state?.delivery === 'pending') { deadline.throwIfAborted(); await delay(20); state = await api.readRunState(run) }
    const receipts = (await pool.query("SELECT i.intent->'action'->>'action' AS action,i.intent->'action'->'args' AS args,r.result FROM lingxios.agent_action_intents i JOIN lingxios.agent_action_ledger r USING(idempotency_key) WHERE i.intent->>'workId'=$1 ORDER BY i.recorded_at,i.idempotency_key", [run.runId])).rows
    const failures = receipts.filter(row => !row.result.ok)
    const steps = (await pool.query('SELECT kind,output FROM lingxios.agent_steps WHERE work_id=$1 ORDER BY step_seq', [run.runId])).rows
    const modelFailures = (await pool.query("SELECT data->'modelDiagnostics' AS diagnostics FROM lingxios.agent_run_events WHERE run_id=$1 AND kind='model.failed'", [run.runId])).rows
    const protocolFailures = steps.filter(step => step.output && (() => { try { return JSON.parse(step.output).protocolError === true } catch { return false } })())
      .length + modelFailures.filter(row => row.diagnostics?.kind === 'protocol').length
    const files = (await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [canvas.id])).rows
    const checked = await checkArtifact(pool, { id: canvas.id, kind: 'design' }) as { problems: number }
    const evidence = { qualification: live ? 'real-provider-native-product' : 'synthetic-provider-native-product', runtime: '3.8.19', binding: 'native-v2', model: live ? env.OPENAI_MODEL : 'scripted', runId: run.runId,
      accepted: failures.length === 0 && protocolFailures === 0 && checked.problems === 0 && state?.run.status === 'succeeded' && state?.delivery === 'delivered'
        && receipts.some(row => row.action === 'design.check') && files.some(row => row.path.endsWith('.dc.html')),
      elapsedMs: Date.now() - started, decisions, wire, actions: receipts.map(row => ({ action: row.action, ok: row.result.ok, code: row.result.code ?? null, ...(row.action === 'design.read_reference' ? { page: row.args.page } : {}) })),
      contractFailures: failures.map(row => ({ action: row.action, code: row.result.code })), protocolFailures, providerFailures: modelFailures.filter(row => row.diagnostics?.kind !== 'protocol').length,
      protocolCodes: modelFailures.filter(row => row.diagnostics?.kind === 'protocol').map(row => row.diagnostics.protocolCode),
      files: files.map(row => ({ path: row.path, sha256: row.sha256 })), checkProblems: checked.problems, status: state?.run.status, delivery: state?.delivery, browserValidated: false }
    console.info(JSON.stringify(evidence))
    if (process.env.ISSUE593_EVIDENCE_PATH) {
      const directory = process.env.ISSUE593_EVIDENCE_PATH; await mkdir(directory, { recursive: true })
      await writeFile(`${directory}/${live ? 'real-provider' : 'synthetic'}.json`, JSON.stringify(evidence, null, 2) + '\n')
      if (live) for (const file of files) await writeFile(`${directory}/${file.path.replaceAll('/', '-')}`, file.body)
    }
    assert.equal(failures.length, 0); assert.equal(protocolFailures, 0)
    assert.ok(receipts.some(row => row.action === 'skills.load' && row.args.name === 'claude-design'))
    assert.equal(receipts.some(row => row.action === 'skills.activate' && row.args.name === 'claude-design'), false)
    assert.ok(receipts.some(row => row.action === 'design.read_reference' && row.args.page === 'format.md'))
    assert.ok(receipts.some(row => row.action === 'design.read_file' && row.args.path === 'project/canvas.json'))
    assert.ok(receipts.some(row => row.action === 'design.write_files')); assert.ok(receipts.some(row => row.action === 'design.check'))
    assert.ok(files.some(row => row.path.endsWith('.dc.html') && /FlashAttention/i.test(row.body.toString('utf8'))))
    assert.equal(checked.problems, 0); assert.equal(state?.run.status, 'succeeded'); assert.equal(state?.delivery, 'delivered')
  } finally {
    globalThis.fetch = originalFetch; await worker?.stop(); await stopLingxiOSControl(); await im.close()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
