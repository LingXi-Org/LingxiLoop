import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions, skillIndex } from '@lyyzka/lingxios'
import { createWorker } from '@lyyzka/lingxios/worker'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { artifactSkills } from '../modules/artifacts/skills.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { ensureConversationDesign } from '../modules/artifacts/facade.js'
import { checkArtifact } from '../modules/artifacts/check.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async () => { await teardownAll() })

const live = process.env.LINGXIOS_LIVE_ARTIFACTS === '1'
for (const recoveredLength of live ? [false] : [false, true]) test(recoveredLength ? 'a recovered truncation never qualifies as zero-failure artifact delivery' : live ? 'real provider creates and checks the FlashAttention canvas with zero contract failures'
  : 'native Worker loads guidance before reference, existing-file read, artboard write and check', { timeout: live ? 300_000 : 40_000 }, async () => {
  if (live) {
    assert.equal(env.OPENAI_MODEL, 'deepseek-ai/DeepSeek-V4.1-Flash')
    assert.equal(new URL(env.OPENAI_BASE_URL).hostname, 'api.siliconflow.cn')
  }
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
  let calls = 0, lengthInjected = false, handlerError: unknown
  const decisions: Array<{ call: number; names: string[]; fullGuidance: boolean; referenceSchema: boolean; requiredTool: string | null }> = []
  const observe = (input: { messages: Array<{ role: string; content?: string }>; tools: Array<{ function: { name: string; parameters: { properties?: { page?: { enum?: string[] } } } } }>; tool_choice?: { function?: { name?: string } } | string; max_tokens?: number }) => {
    calls++
    assert.equal(input.max_tokens, 16_384)
    const instructions = input.messages.filter(message => message.role === 'system').map(message => message.content ?? '').join('\n')
    const names = input.tools.map(tool => tool.function.name)
    const reference = input.tools.find(tool => tool.function.name === 'design__read_reference')
    const fullGuidance = instructions.includes('Complete registered system skill') && instructions.includes('One artboard: the skeleton')
    const referenceSchema = reference?.function.parameters.properties?.page?.enum?.includes('format.md') === true
    const requiredTool = typeof input.tool_choice === 'object' ? input.tool_choice.function?.name ?? null : null
    decisions.push({ call: calls, names: names.filter(name => name.startsWith('design__') || name.startsWith('skills__')), fullGuidance, referenceSchema, requiredTool })
    if (calls === 1) {
      assert.equal(names.some(name => name.startsWith('design__') && index.actions.some(action => action.replace('.', '__') === name)), false)
      assert.ok(instructions.includes(index.hash)); assert.ok(instructions.includes('format.md'))
      assert.ok(instructions.includes('skills.load')); assert.ok(instructions.includes('no delivery'))
      assert.equal(requiredTool, 'skills__load')
    }
  }
  const provider = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw); observe(input); assert.ok(calls <= (recoveredLength ? 8 : 7))
      const phase = calls - (lengthInjected ? 1 : 0)
      if (recoveredLength && !lengthInjected && phase === 5) {
        lengthInjected = true
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'truncated-write', type: 'function', function: { name: 'design__write_files', arguments: '{"files":' } }] }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 16384 } })}\n\ndata: [DONE]\n\n`)
        return
      }
      const business: Array<{ name: string; args: unknown }> = []
      if (phase === 1) business.push({ name: 'skills__load', args: { name: index.name, version: index.version, hash: index.hash } })
      if (phase === 2) {
        assert.equal(decisions.at(-1)!.fullGuidance, true); assert.equal(decisions.at(-1)!.referenceSchema, true)
        business.push({ name: 'design__read_reference', args: { page: 'format.md' } })
      }
      if (phase === 3) business.push({ name: 'design__current', args: {} })
      if (phase === 4) business.push({ name: 'design__read_file', args: { path: 'project/canvas.json' } })
      if (phase === 5) {
        const file = (await pool.query("SELECT body,sha256 FROM artifact_files WHERE artifact_id=$1 AND path='project/canvas.json'", [canvas.id])).rows[0]
        const content = JSON.parse(file.body.toString('utf8'))
        content.boards['FlashAttention.dc.html'] = { x: 0, y: 0, w: 1200, h: 820, title: 'FlashAttention' }
        content.order = ['FlashAttention.dc.html']
        business.push({ name: 'design__write_files', args: { files: { 'project/canvas.json': { content: JSON.stringify(content), ifMatch: file.sha256 }, 'project/FlashAttention.dc.html': { content: fixture, ifMatch: null } } } })
      }
      if (phase === 6) business.push({ name: 'design__check', args: {} })
      const output = { index: 0, id: `answer-${calls}`, type: 'function', function: { name: 'public_answer', arguments: JSON.stringify({ operation: { kind: 'append', supersedes: [] }, answer: phase === 7 ? 'FlashAttention 讲解已写入画板，格式检查通过。' : ['FlashAttention 保持精确注意力并减少数据搬运。','\n计算按块处理 Q、K、V。','\n在线 softmax 重标定累积量。','\n避免写回完整 N×N 矩阵。','\nIO 优化减少显存读写。','\n计算量仍保持二次量级。'][phase - 1], commentary: '', outcome: phase === 7 ? { status: 'satisfied', gaps: [] } : null }) } }
      const toolCalls = [...(phase === 1 ? [] : [output]), ...business.map((item, index) => ({ index: index + (phase === 1 ? 0 : 1), id: `business-${calls}-${index}`, type: 'function', function: { name: item.name, arguments: JSON.stringify(item.args) } }))]
      for (const call of toolCalls) assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === call.function.name), call.function.name)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: toolCalls }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
    } catch (error) { handlerError ??= error; console.info({ fixtureFailure: error instanceof Error ? error.message : String(error) }); response.writeHead(500); response.end('{}') }
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  const originalFetch = globalThis.fetch
  const parsers = new Map(createProductTools(() => { throw new Error('diagnostic parser never executes') }).map(tool => [tool.name, tool.parse]))
  const wire: Array<{ call: number; status: number; tools: Array<{ index: number; name: string; fields: string[]; argumentBytes: number; argumentType: string | null; jsonError: string | null; jsonErrorPosition: number | null; cumulativeArgumentFrames: number; jsonValid: boolean; parserValid: boolean | null; issues: Array<{ code: string; path: string[] }> }>; finish: string[]; closed: string }> = []
  let persistWire = Promise.resolve()
  if (live) globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    let schema: Map<string, Set<string>> | undefined
    const schemaFields = new Set<string>()
    const collectFields = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      const object = value as Record<string, unknown>
      if (object.properties && typeof object.properties === 'object') for (const key of Object.keys(object.properties)) schemaFields.add(key)
      for (const child of Object.values(object)) collectFields(child)
    }
    if (url.startsWith(env.OPENAI_BASE_URL) && url.endsWith('/chat/completions') && init?.body) {
      const request = JSON.parse(String(init.body))
      if (request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer')) {
        observe(request)
        schema = new Map(request.tools.map((tool: { function: { name: string; parameters: { properties: object } } }) =>
          [tool.function.name, new Set(Object.keys(tool.function.parameters.properties))]))
        collectFields(request.tools)
      }
    }
    const response = await originalFetch(input, init)
    if (!schema || !response.ok || !response.body) return response
    const record: (typeof wire)[number] = { call: calls, status: response.status, tools: [], finish: [], closed: 'reading' }
    wire.push(record)
    const reader = response.body.getReader(), decoder = new TextDecoder(), argumentsByIndex = new Map<number, { name: string; args: string; cumulativeArgumentFrames: number }>()
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
            const value = argumentsByIndex.get(part.index) ?? { name: '', args: '', cumulativeArgumentFrames: 0 }
            value.name += typeof part.function?.name === 'string' ? part.function.name : ''
            const delta = typeof part.function?.arguments === 'string' ? part.function.arguments : ''
            if (value.args.length > 128 && delta.startsWith(value.args)) value.cumulativeArgumentFrames++
            value.args += delta
            argumentsByIndex.set(part.index, value)
          }
        } catch { /* Metadata only; the real driver still owns stream validation. */ }
      }
    }
    const finish = (closed: string) => {
      if (finalized) return; finalized = true; record.closed = closed
      record.tools = [...argumentsByIndex].map(([index, value]) => {
        let fields: string[] = [], jsonValid = false, parserValid: boolean | null = null, argumentType: string | null = null, jsonError: string | null = null, jsonErrorPosition: number | null = null
        const issues: Array<{ code: string; path: string[] }> = []
        try {
          const args = JSON.parse(value.args); jsonValid = true
          argumentType = args === null ? 'null' : Array.isArray(args) ? 'array' : typeof args
          fields = args && typeof args === 'object' && !Array.isArray(args) ? Object.keys(args).slice(0, 64).map(key => schema!.get(value.name)?.has(key) ? key : '[unrecognized]') : []
          const parse = parsers.get(value.name)
          if (parse) {
            try { parse(args); parserValid = true } catch (error) {
              parserValid = false
              const collect = (items: unknown) => {
                if (!Array.isArray(items)) return
                for (const issue of items) {
                  if (issues.length >= 16) return
                  if (issue && typeof issue.code === 'string' && Array.isArray(issue.path)) issues.push({ code: issue.code, path: issue.path.map((key: unknown) => typeof key === 'string' && schemaFields.has(key) ? key : '[entry]') })
                  collect(issue?.issues); if (Array.isArray(issue?.errors)) for (const branch of issue.errors) collect(branch)
                }
              }
              collect((error as { issues?: unknown }).issues)
            }
          }
        } catch (error) {
          if (!jsonValid) {
            const message = error instanceof SyntaxError ? error.message : ''
            jsonError = /Bad escaped character/.test(message) ? 'invalid_escape' : /Bad control character/.test(message) ? 'unescaped_control'
              : /Unterminated string|Unexpected end/.test(message) ? 'incomplete_json' : /Expected ',' or '}'/.test(message) ? 'object_separator'
                : /Expected ',' or '\]'/ .test(message) ? 'array_separator' : /Unexpected non-whitespace/.test(message) ? 'trailing_content' : 'json_syntax'
            const position = /position (\d+)/.exec(message)
            jsonErrorPosition = position ? Number(position[1]) : null
          }
        }
        return { index, name: schema!.has(value.name) ? value.name : '[unknown]', fields, argumentBytes: Buffer.byteLength(value.args), argumentType, jsonError, jsonErrorPosition, cumulativeArgumentFrames: value.cumulativeArgumentFrames, jsonValid, parserValid, issues }
      })
      argumentsByIndex.clear(); buffer = ''
      if (process.env.ISSUE593_EVIDENCE_PATH) {
        const directory = process.env.ISSUE593_EVIDENCE_PATH, snapshot = JSON.stringify({ measurementComplete: false, wire }, null, 2) + '\n'
        persistWire = persistWire.then(async () => { await mkdir(directory, { recursive: true }); await writeFile(`${directory}/wire.partial.json`, snapshot) })
      }
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
    const model = runtimeModelConfiguration({ id: live ? env.OPENAI_MODEL : 'deepseek-ai/DeepSeek-V4.1-Flash', apiKey: live ? env.OPENAI_API_KEY : 'synthetic-only', baseUrl: live ? env.OPENAI_BASE_URL : 'https://api.siliconflow.cn/v1' }, live ? 180_000 : 90_000)
    worker = createWorker({ modelBudget: { maxModelCalls: live ? 24 : recoveredLength ? 8 : 7, wallClockMs: live ? 240_000 : 30_000 }, controlPlane: api, policy: new ProductRuntimePolicy(),
      model: live ? model : { ...model, baseUrl: `http://127.0.0.1:${address.port}/v1` }, worker: { id: 'issue593-artboard', concurrency: 1 } })
    const run = (await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version, messageId: 'question', version: 1, author: { id: userId, kind: 'human' }, text: '为我在画板中讲解flashattention', mentions: [agentId] }, { mode: 'execute', codeExecution: 'disabled', deliveryMode: 'auto', executionClass: 'conversation' })).runs[0]
    assert.ok(run); await bindProductRun(pool, run, channelId); await worker.runNext(); assert.equal(handlerError, undefined)
    const deadline = AbortSignal.timeout(5_000); let state = await api.readRunState(run)
    while (state?.delivery === 'pending') { deadline.throwIfAborted(); await delay(20); state = await api.readRunState(run) }
    const receipts = (await pool.query("SELECT i.intent->'action'->>'action' AS action,i.intent->'action'->'args' AS args,r.result FROM lingxios.agent_action_intents i JOIN lingxios.agent_action_ledger r USING(idempotency_key) WHERE i.intent->>'workId'=$1 ORDER BY i.recorded_at,i.idempotency_key", [run.runId])).rows
    const failures = receipts.filter(row => !row.result.ok)
    const steps = (await pool.query('SELECT kind,output FROM lingxios.agent_steps WHERE work_id=$1 ORDER BY step_seq', [run.runId])).rows
    const modelFailures = (await pool.query("SELECT data->'modelDiagnostics' AS diagnostics,data->'budgetLimit' AS budget FROM lingxios.agent_run_events WHERE run_id=$1 AND kind='model.failed'", [run.runId])).rows
    const modelAttempts = (await pool.query("SELECT observation->>'status' AS status,observation->>'purpose' AS purpose,observation->>'attempt' AS attempt,observation->'failure'->>'category' AS category FROM lingxios.agent_model_budget_calls WHERE work_id=$1 ORDER BY call_id", [run.runId])).rows
    const failedModelAttempts = modelAttempts.filter(attempt => attempt.status !== 'succeeded')
    const wireContractFailures = wire.flatMap(record => record.tools.filter(tool => record.finish.includes('length') || !tool.jsonValid || tool.parserValid === false).map(tool => ({ call: record.call, name: tool.name, truncated: record.finish.includes('length'), jsonValid: tool.jsonValid, issues: tool.issues })))
    const protocolFailures = steps.filter(step => step.output && (() => { try { return JSON.parse(step.output).protocolError === true } catch { return false } })())
      .length + modelFailures.filter(row => row.diagnostics?.kind === 'protocol').length
    const files = (await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [canvas.id])).rows
    const checked = await checkArtifact(pool, { id: canvas.id, kind: 'design' }) as { problems: number }
    const evidence = { qualification: recoveredLength ? 'synthetic-recovered-truncation-negative' : live ? 'real-provider-native-product' : 'synthetic-provider-native-product', measurementComplete: true, runtime: releaseVersions.runtime, binding: model.publicAnswerTool, maxOutputTokens: model.maxOutputTokens, model: live ? env.OPENAI_MODEL : 'scripted', runId: run.runId,
      accepted: failures.length === 0 && modelFailures.length === 0 && failedModelAttempts.length === 0 && wireContractFailures.length === 0 && protocolFailures === 0 && checked.problems === 0 && state?.run.status === 'succeeded' && state?.delivery === 'delivered'
        && receipts.some(row => row.action === 'design.check') && files.some(row => row.path.endsWith('.dc.html')),
      elapsedMs: Date.now() - started, decisions, wire, actions: receipts.map(row => ({ action: row.action, ok: row.result.ok, code: row.result.code ?? null, ...(row.action === 'design.read_reference' ? { page: row.args.page } : {}) })),
      contractFailures: failures.map(row => ({ action: row.action, code: row.result.code })), protocolFailures, providerFailures: modelFailures.filter(row => !row.budget && row.diagnostics?.kind !== 'protocol').length,
      budgetFailures: modelFailures.filter(row => row.budget).map(row => row.budget),
      modelAttempts, failedModelAttempts, wireContractFailures,
      protocolCodes: modelFailures.filter(row => row.diagnostics?.kind === 'protocol').map(row => row.diagnostics.protocolCode),
      files: files.map(row => ({ path: row.path, sha256: row.sha256 })), checkProblems: checked.problems, status: state?.run.status, verification: state?.run.goalOutcome?.verification, delivery: state?.delivery, deliveryTarget: 'isolated-test-recording-im', browserValidated: false }
    console.info(JSON.stringify(evidence))
    if (process.env.ISSUE593_EVIDENCE_PATH) {
      const directory = process.env.ISSUE593_EVIDENCE_PATH; await mkdir(directory, { recursive: true })
      await writeFile(`${directory}/${live ? 'real-provider' : recoveredLength ? 'synthetic-recovered-length' : 'synthetic'}.json`, JSON.stringify(evidence, null, 2) + '\n')
      if (live) for (const file of files) await writeFile(`${directory}/${file.path.replaceAll('/', '-')}`, file.body)
    }
    assert.equal(failures.length, 0); assert.equal(protocolFailures, 0); assert.equal(modelFailures.length, 0)
    assert.equal(failedModelAttempts.length, recoveredLength ? 1 : 0); assert.equal(wireContractFailures.length, 0)
    assert.equal(evidence.accepted, !recoveredLength)
    if (!live) assert.equal(calls, recoveredLength ? 8 : 7)
    assert.ok(receipts.some(row => row.action === 'skills.load' && row.args.name === 'claude-design'))
    assert.equal(receipts.some(row => row.action === 'skills.activate' && row.args.name === 'claude-design'), false)
    assert.ok(receipts.some(row => row.action === 'design.read_reference' && row.args.page === 'format.md'))
    assert.ok(receipts.some(row => row.action === 'design.read_file' && row.args.path === 'project/canvas.json'))
    assert.ok(receipts.some(row => row.action === 'design.write_files')); assert.ok(receipts.some(row => row.action === 'design.check'))
    assert.ok(files.some(row => row.path.endsWith('.dc.html') && /FlashAttention/i.test(row.body.toString('utf8'))))
    assert.equal(checked.problems, 0); assert.equal(state?.run.status, 'succeeded'); assert.equal(state?.delivery, 'delivered')
  } finally {
    await persistWire
    globalThis.fetch = originalFetch; await worker?.stop(); await stopLingxiOSControl(); await im.close()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
