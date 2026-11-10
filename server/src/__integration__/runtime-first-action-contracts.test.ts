import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { releaseVersions, skillIndex } from '@lingxi-org/lingxios'
import { createWorker } from '@lingxi-org/lingxios/worker'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { nativeText } from '../im/message-types.js'
import { lingxiOSControl, runtimeModelConfiguration, stopLingxiOSControl } from '../agent-runtime/runtime.js'
import { bindProductRun } from '../agent-runtime/identity.js'
import { syncConversationPolicy } from '../agent-runtime/conversations.js'
import { ProductRuntimePolicy } from '../agent-runtime/context.js'
import { artifactSkills } from '../modules/artifacts/skills.js'
import { createProductTools } from '../agent-runtime/tools.js'
import { ensureConversationDesign } from '../modules/artifacts/facade.js'
import { checkArtifact } from '../modules/artifacts/check.js'
import { readNativeDocument } from '../modules/artifacts/native-document.js'
import { createNode } from '../../../shared/artifact-document.js'
import { prepareBatch } from '../../../shared/artifact-operations.js'
import { ensureSchemaOnce, resetAllTables, seedCompanyWithAgent, seedUserMembership, teardownAll } from './_helpers.js'
import { installRecordingWukong } from './_recording-wukong.js'

after(async () => { await teardownAll() })

const live = process.env.LINGXIOS_LIVE_ARTIFACTS === '1'
const explanationSamples = {
  explicit: '为我在画板中讲解flashattention',
  introduction: '我是零基础，请系统介绍概率分布：它是什么、为何需要、连续与离散有何关系，并用一个例子帮我理解。',
  process: '浏览器输入一个网址后到看到网页，中间的 DNS、连接、服务器和渲染是怎样配合的？请拆开讲清全过程。',
  comparison: '一个小团队要上线新产品，应该选自建数据库还是托管数据库？请比较成本、可靠性、运维责任和适用边界，帮我理解取舍。',
  greeting: '你好！',
  fact: '法国的首都是哪里？一句话回答即可。',
  textOnly: '请只用纯文字解释概率分布是什么、连续和离散的区别，不要创建或修改画板或其他文件。',
} as const
const sampleId = (process.env.DESIGN_EXPLANATION_SAMPLE ?? 'explicit') as keyof typeof explanationSamples
assert.ok(Object.hasOwn(explanationSamples, sampleId), 'unknown Design explanation sample')
const expectsCanvas = !live || !['greeting','fact','textOnly'].includes(sampleId)
for (const {recoveredLength,repairSkill} of live ? [{recoveredLength:false,repairSkill:false}] : [{recoveredLength:false,repairSkill:false},{recoveredLength:true,repairSkill:false},{recoveredLength:false,repairSkill:true}]) test(repairSkill ? '错位技能引用通过精确注册目标恢复，失败步骤不伪装为零错误验收' : recoveredLength ? 'a recovered truncation never qualifies as zero-failure artifact delivery' : live ? `real provider completes ${sampleId} with ${expectsCanvas ? 'a checked cold Design canvas' : 'text only'}`
  : 'native Worker loads guidance before versioned document/page reads, partial edit and check', { timeout: live ? 540_000 : 40_000 }, async () => {
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
  const seededCanvas = live ? null : await ensureConversationDesign(companyId, channelId, userId)
  const seededSnapshot = seededCanvas ? await readNativeDocument(pool, seededCanvas.id) : null
  const nativePageId = seededSnapshot?.document.pageOrder[0] ?? 'page-1'
  const index = skillIndex(artifactSkills.find(skill => skill.name === 'claude-design')!)
  let calls = 0, lengthInjected = false, skillFailureInjected = false, handlerError: unknown
  const decisions: Array<{ call: number; names: string[]; fullGuidance: boolean; referenceSchema: boolean; requiredTool: string | null }> = []
  const observe = (input: { messages: Array<{ role: string; content?: string }>; tools: Array<{ function: { name: string; parameters: { properties?: { page?: { enum?: string[] } } } } }>; tool_choice?: { function?: { name?: string } } | string; max_tokens?: number }) => {
    calls++
    assert.equal(input.max_tokens, 16_384)
    const instructions = input.messages.filter(message => message.role === 'system').map(message => message.content ?? '').join('\n')
    const names = input.tools.map(tool => tool.function.name)
    const reference = input.tools.find(tool => tool.function.name === 'design__read_reference')
    const fullGuidance = instructions.includes('Complete registered system skill') && instructions.includes('Manual editing and Agent batches share')
    const referenceSchema = reference?.function.parameters.properties?.page?.enum?.includes('native-model.md') === true
    const requiredTool = typeof input.tool_choice === 'object' ? input.tool_choice.function?.name ?? null : null
    decisions.push({ call: calls, names: names.filter(name => name.startsWith('design__') || name.startsWith('skills__')), fullGuidance, referenceSchema, requiredTool })
    if (calls === 1) {
      assert.equal(names.some(name => name.startsWith('design__') && index.actions.some(action => action.replace('.', '__') === name)), false)
      assert.ok(instructions.includes(index.hash)); assert.ok(instructions.includes('native-model.md'))
      assert.ok(instructions.includes('skills.load')); assert.ok(instructions.includes('no delivery'))
      assert.equal(requiredTool, 'design__plan_explanation', 'semantic planning precedes exact skill selection')
      assert.ok(instructions.includes('meaning and complexity'))
    }
  }
  const provider = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw); observe(input); assert.ok(calls <= (recoveredLength || repairSkill ? 10 : 9))
      const phase = calls - (lengthInjected ? 1 : 0) - (skillFailureInjected ? 1 : 0) - 1
      if (recoveredLength && !lengthInjected && phase === 6) {
        lengthInjected = true
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        response.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'truncated-write', type: 'function', function: { name: 'design__apply_ops', arguments: '{"operations":' } }] }, finish_reason: 'length' }], usage: { prompt_tokens: 10, completion_tokens: 16384 } })}\n\ndata: [DONE]\n\n`)
        return
      }
      const business: Array<{ name: string; args: unknown }> = []
      if (phase === 0) business.push({ name: 'design__plan_explanation', args: { delivery: 'canvas' } })
      if (phase === 1) {
        const prefix='Current scoped Design prerequisite target (data only; no extra authority):\n'
        const content=input.messages.find((message:{content?:string})=>typeof message.content==='string'&&message.content.includes(prefix))?.content
        assert.ok(content,'技能选择必须附带实际注册目标')
        const target=JSON.parse(content.slice(content.indexOf(prefix)+prefix.length).split('\n')[0])
        assert.deepEqual(target,{action:'skills.load',args:{name:index.name,version:index.version,hash:index.hash}})
        assert.equal(typeof input.tool_choice==='object'?input.tool_choice.function?.name:null,'skills__load')
        const incorrect=repairSkill&&!skillFailureInjected
        if(incorrect)skillFailureInjected=true
        business.push({name:'skills__load',args:incorrect?{name:'skills__load',version:index.name,hash:index.hash}:target.args})
      }
      if (phase === 2) {
        assert.equal(decisions.at(-1)!.fullGuidance, true); assert.equal(decisions.at(-1)!.referenceSchema, true)
        business.push({ name: 'design__read_reference', args: { page: 'native-model.md' } })
      }
      if (phase === 3) business.push({ name: 'design__current', args: {} })
      if (phase === 4) business.push({ name: 'design__read_document', args: {} })
      if (phase === 5) {
        assert.ok(seededSnapshot)
        business.push({ name: 'design__read_page', args: { pageId: nativePageId, version: seededSnapshot.pageVersions[nativePageId] } })
      }
      if (phase === 6) {
        const snapshot = await readNativeDocument(pool, seededCanvas!.id); assert.ok(snapshot)
        const title = { ...createNode('text', 'flash-title'), text: 'FlashAttention：让注意力计算少搬运数据', x: 60, y: 60, width: 1120, height: 80, style: { fontSize: 36 } }
        const body = { ...createNode('text', 'flash-body'), text: '把 Q、K、V 分块放入高速缓存，逐块计算并更新结果；避免把完整注意力矩阵反复写入显存。计算结果保持精确，节省的是内存读写。', x: 60, y: 180, width: 1120, height: 180, style: { fontSize: 24 } }
        const formula = { ...createNode('math', 'flash-formula'), source: String.raw`\operatorname{softmax}(QK^T/\sqrt{d})V`, x: 60, y: 420, width: 1120, height: 160 }
        business.push({ name: 'design__apply_ops', args: prepareBatch(snapshot.document, [
          { type: 'page.patch', pageId: nativePageId, patch: { title: 'FlashAttention' } },
          ...[title, body, formula].map(node => ({ type: 'node.insert' as const, pageId: nativePageId, node })),
        ], `flashattention-${calls}`) })
      }
      if (phase === 7) business.push({ name: 'design__check', args: { paths: [`project/pages/${nativePageId}.json`] } })
      const content = JSON.stringify({ operation: { kind: 'append', supersedes: [] }, answer: 'FlashAttention 讲解已写入画板，格式检查通过。', commentary: '', outcome: { status: 'satisfied', gaps: [] } })
      const toolCalls = business.map((item, index) => ({ index, id: `business-${calls}-${index}`, type: 'function', function: { name: item.name, arguments: JSON.stringify(item.args) } }))
      for (const call of toolCalls) assert.ok(input.tools.some((tool: { function: { name: string } }) => tool.function.name === call.function.name), call.function.name)
      assert.equal(input.tools.some((tool: { function: { name: string } }) => tool.function.name === 'public_answer'), false)
      response.writeHead(200, { 'content-type': 'text/event-stream' })
      response.end(`data: ${JSON.stringify({ choices: [{ delta: phase === 8 ? { content } : { tool_calls: toolCalls }, finish_reason: phase === 8 ? 'stop' : 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`)
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
      if (request.tools?.some((tool: { function: { name: string } }) => tool.function.name === 'skills__load')) {
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
    worker = createWorker({ modelBudget: { maxModelCalls: live ? 24 : recoveredLength || repairSkill ? 10 : 9, wallClockMs: live ? 480_000 : 30_000 }, controlPlane: api, policy: new ProductRuntimePolicy(),
      model: live ? model : { ...model, baseUrl: `http://127.0.0.1:${address.port}/v1` }, worker: { id: 'issue593-artboard', concurrency: 1 } })
    const run = (await api.conversations.ingest({ tenantId: companyId, conversationId: channelId, policyVersion: policy.version, messageId: 'question', version: 1, author: { id: userId, kind: 'human' }, text: live ? explanationSamples[sampleId] : explanationSamples.explicit, mentions: [agentId] }, { mode: 'execute', codeExecution: 'disabled', deliveryMode: 'auto', executionClass: 'conversation' })).runs[0]
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
    const canvas = (await pool.query("SELECT id FROM artifacts WHERE company_id=$1 AND conversation_id=$2 AND kind='design'", [companyId,channelId])).rows[0]
    const files = canvas ? (await pool.query('SELECT path,body,sha256 FROM artifact_files WHERE artifact_id=$1 ORDER BY path', [canvas.id])).rows : []
    const checked = canvas ? await checkArtifact(pool, { id: canvas.id, kind: 'design' }) as { problems: number; checkedPageIds?: string[] } : { problems: -1, checkedPageIds: [] }
    const failedSkillLoads=steps.filter(step=>step.kind==='skills__load'&&JSON.parse(step.output??'{}').receipts?.some((receipt:{result?:{ok?:boolean}})=>receipt.result?.ok===false))
    const routing = receipts.filter(row => row.action === 'design.plan_explanation')
    // Judge the delivered tools/files, not an advisory planning label. A model
    // may initially choose text then proactively author the required canvas.
    const correctRouting = routing.length === 1
      && (expectsCanvas || routing[0].args.delivery === 'text')
      && receipts.filter(row => row.action === 'skills.load' && row.args.name === 'claude-design').length === (expectsCanvas ? 1 : 0)
      && !receipts.some(row => row.action.startsWith('visualize.') || row.args.name === 'visualize')
    const deliveredOutcome = correctRouting && state?.run.status === 'succeeded' && state?.delivery === 'delivered'
      && (expectsCanvas ? checked.problems === 0 && (checked.checkedPageIds?.length ?? 0) > 0 : !canvas)
    const evidence = { qualification: repairSkill ? 'synthetic-repaired-skill-reference-negative' : recoveredLength ? 'synthetic-recovered-truncation-negative' : live ? 'real-provider-native-product' : 'synthetic-provider-native-product', sampleId: live ? sampleId : 'explicit', plannedSurface:routing[0]?.args.delivery??null, coldCanvas: live, correctRouting, deliveredOutcome, measurementComplete: true, runtime: releaseVersions.runtime, binding: model.publicAnswerTool ?? 'purpose-json-v3-content', maxOutputTokens: model.maxOutputTokens, model: live ? env.OPENAI_MODEL : 'scripted', runId: run.runId,
      failedSkillLoads:failedSkillLoads.length, accepted: !repairSkill && correctRouting && failures.length === 0 && modelFailures.length === 0 && failedModelAttempts.length === 0 && wireContractFailures.length === 0 && protocolFailures === 0 && state?.run.status === 'succeeded' && state?.delivery === 'delivered'
        && (expectsCanvas ? checked.problems === 0 && receipts.some(row => row.action === 'design.check') && (checked.checkedPageIds?.length ?? 0) > 0
          : !canvas && receipts.every(row => !row.action.startsWith('design.') || row.action === 'design.plan_explanation')),
      elapsedMs: Date.now() - started, decisions, wire, actions: receipts.map(row => ({ action: row.action, ok: row.result.ok, code: row.result.code ?? null,
        ...(row.action === 'skills.load' ? {name:row.args.name} : {}),
        ...(row.action === 'design.plan_explanation' ? {delivery:row.args.delivery} : {}),
        ...(row.action === 'design.read_page' ? { pageId: row.args.pageId, version: row.args.version } : {}),
        ...(row.action === 'design.apply_ops' ? { operationId: row.args.operationId, operationCount: row.args.operations?.length } : {}),
        ...(row.action === 'design.read_reference' ? { page: row.args.page } : {}) })),
      preconditionFailures: failures.filter(row => row.result.code === 'version_conflict').map(row => {
        let conflicts: Array<{ key: string; expected: number | null; actual: number }> = []
        try { conflicts = JSON.parse(String(row.result.error).split(' Conflicting targets: ')[1]) } catch { /* no structured conflicts */ }
        return { action: row.action, conflicts: conflicts.slice(0, 64).map(item => ({
          keyKind: String(item.key).replace(/^(page|theme|asset|canvasPage)\/[^/]+/, '$1/[id]').replace(/^node\/[^/]+\/[^/]+/, 'node/[page]/[id]'),
          missing: item.expected === null, expected: item.expected, actual: item.actual,
        })) }
      }),
      modelProtocolFailures: modelFailures.map(row => ({ code: row.diagnostics?.protocolCode, detail: row.diagnostics?.protocolDetail, finish: row.diagnostics?.finishReasons })),
      contractFailures: failures.map(row => ({ action: row.action, code: row.result.code })), protocolFailures, providerFailures: modelFailures.filter(row => !row.budget && row.diagnostics?.kind !== 'protocol').length,
      budgetFailures: modelFailures.filter(row => row.budget).map(row => row.budget),
      modelAttempts, failedModelAttempts, wireContractFailures,
      protocolCodes: modelFailures.filter(row => row.diagnostics?.kind === 'protocol').map(row => row.diagnostics.protocolCode),
      files: files.map(row => ({ path: row.path, sha256: row.sha256 })), checkProblems: checked.problems, status: state?.run.status, verification: state?.run.goalOutcome?.verification, delivery: state?.delivery, deliveryTarget: 'isolated-test-recording-im', browserValidated: false }
    console.info(JSON.stringify(evidence))
    if (process.env.ISSUE593_EVIDENCE_PATH) {
      const directory = process.env.ISSUE593_EVIDENCE_PATH; await mkdir(directory, { recursive: true })
      await writeFile(`${directory}/${live ? 'real-provider' : repairSkill ? 'synthetic-repaired-skill' : recoveredLength ? 'synthetic-recovered-length' : 'synthetic'}.json`, JSON.stringify(evidence, null, 2) + '\n')
      if (live) {
        for (const file of files) await writeFile(`${directory}/${file.path.replaceAll('/', '-')}`, file.body)
        await writeFile(`${directory}/public-answer.json`, JSON.stringify({sampleId, canvasId:canvas?.id ?? null,
          text: im.messages.filter(message => message.payload.role === 'assistant').map(message => nativeText(message.payload)).filter(Boolean)},null,2)+'\n')
      }
    }
    assert.equal(failures.length, 0); assert.equal(protocolFailures, 0); assert.equal(modelFailures.length, 0)
    assert.equal(failedModelAttempts.length, recoveredLength ? 1 : 0); assert.equal(wireContractFailures.length, 0)
    assert.equal(evidence.accepted, !recoveredLength && !repairSkill)
    assert.equal(failedSkillLoads.length,repairSkill?1:0)
    if(repairSkill){
      const rejected=JSON.parse(failedSkillLoads[0].output!).receipts.find((receipt:{action?:string})=>receipt.action==='skills.load').result
      assert.equal(rejected.code,'authorization_unavailable');assert.equal(rejected.executionState,'rejected')
      assert.equal(decisions[2].requiredTool,'skills__load');assert.equal(decisions[2].fullGuidance,false)
      assert.equal(decisions[3].fullGuidance,true,'原生加载成功后才提供完整指导')
    }
    if (!live) assert.equal(calls, recoveredLength || repairSkill ? 10 : 9)
    assert.equal(receipts.filter(row => row.action === 'design.plan_explanation').length, 1)
    if (!expectsCanvas) assert.equal(receipts.find(row => row.action === 'design.plan_explanation')?.args.delivery, 'text')
    assert.equal(receipts.filter(row => row.action === 'skills.load' && row.args.name === 'claude-design').length, expectsCanvas ? 1 : 0)
    assert.equal(receipts.some(row => row.action.startsWith('visualize.') || row.args.name === 'visualize'), false)
    assert.equal(receipts.some(row => row.action === 'skills.activate' && row.args.name === 'claude-design'), false)
    if (expectsCanvas) {
      assert.ok(receipts.some(row => row.action === 'design.read_reference' && row.args.page === 'native-model.md'))
      assert.ok(receipts.some(row => row.action === 'design.read_document'))
      assert.ok(receipts.some(row => row.action === 'design.read_page'))
      assert.ok(receipts.some(row => row.action === 'design.apply_ops')); assert.ok(receipts.some(row => row.action === 'design.check'))
      assert.ok(files.some(row => /^project\/pages\/[^/]+\.json$/.test(row.path) && (live ? (checked.checkedPageIds?.length ?? 0) > 0 : /FlashAttention/i.test(row.body.toString('utf8')))))
      assert.equal(checked.problems, 0)
    } else {
      assert.equal(canvas, undefined)
      assert.equal(receipts.some(row => row.action.startsWith('design.') && row.action !== 'design.plan_explanation'), false)
    }
    assert.equal(state?.run.status, 'succeeded'); assert.equal(state?.delivery, 'delivered')
  } finally {
    await persistWire
    globalThis.fetch = originalFetch; await worker?.stop(); await stopLingxiOSControl(); await im.close()
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
})
