import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawn } from 'node:child_process'
import { datasetSchema, suiteSchema, manifestSchema, hash, zeroUsage, type EvalTarget, type Manifest, type ToolTrace, type ToolEvidence } from '../src/contracts.js'
import { deterministicGrade, summarizeGrades } from '../src/graders.js'
import { candidateTarget, semanticJudge, type ModelConfig } from '../src/models.js'
import { exportBaseline, importBaseline } from '../src/baseline.js'
import { executeFixture, validateScenario } from '../src/tool-sandbox.js'
import { Store } from '../src/store.js'
import { runJob } from '../src/runner.js'
import { buildReport, comparisonKey, type Report } from '../src/report.js'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const dataset = datasetSchema.parse(read('../datasets/tool-initiative.v1.json'))
const suite = suiteSchema.parse(read('../suites/tool-initiative.v1.json'))
const checklist = dataset.cases[0]!
const boundaries = datasetSchema.parse(read('../datasets/tool-boundaries.v1.json'))
const identity = { id: 'offline-test-target', version: '1', fingerprint: hash('test') }
const manifest = (overrides: Partial<Manifest> = {}): Manifest => ({ schemaVersion: 2, engine: 'black-box-eval/2',
  suite, dataset, target: identity, judge: null, seed: 1, provenance: { revision: 'offline-test' }, baseline: null, ...overrides })
const request = { input: checklist.input, requestId: 'offline-test', seed: 1, signal: new AbortController().signal,
  scenario: checklist.scenario!, toolBudget: suite.toolBudget! }

test('all bundled tool datasets validate before paid execution and keep independent evaluation conditions', () => {
  for (const name of ['tool-initiative', 'tool-boundaries', 'tool-recovery']) {
    const data = datasetSchema.parse(read(`../datasets/${name}.v1.json`))
    const config = suiteSchema.parse(read(`../suites/${name}.v1.json`))
    manifestSchema.parse(manifest({ suite: config, dataset: data }))
    for (const c of data.cases) {
      validateScenario(c.scenario!)
      assert(c.behavior!.maxToolCalls <= config.toolBudget!.maxToolCalls)
    }
    assert(config.graders.every(g => g.kind === 'tool_behavior'))
  }
  assert.throws(() => validateScenario({ tools: ['constructor'], fixtures: [] }), /unknown_scenario_tool/)
  assert.throws(() => validateScenario({ ...checklist.scenario!, fixtures: [...checklist.scenario!.fixtures].reverse() }), /invalid_scenario_fixture/)
  assert.throws(() => manifestSchema.parse(manifest({ suite: { ...suite, toolBudget: undefined } })))
  assert.notEqual(comparisonKey(manifest({ target: { ...identity, environment: hash('sandbox-1') } })),
    comparisonKey(manifest({ target: { ...identity, environment: hash('sandbox-2') } })))
})

test('grading requires scoped action evidence, distinguishes no-tool tasks and accepts an honest denial', () => {
  const trace: ToolTrace = { modelCalls: 4, stop: 'completed', calls: [] }
  const call = (name: string, args: object) => executeFixture(checklist.scenario!, trace.calls, name, JSON.stringify(args))
  call('documents__list', {})
  call('documents__read', { documentId: 'doc_accept_73' })
  call('documents__create', { title: '验收交接清单', body: '何青：确认签名回调；林远：检查键盘焦点；周宁：核对人民币账单。三项均未完成。' })
  assert.deepEqual(trace.calls.map(c => c.fixtureId), ['discovered', 'read-notes', 'saved-checklist'])
  const grade = (c: typeof checklist, t: ToolTrace, output: string) => suite.graders.map(g => {
    assert(g.kind !== 'factuality' && g.kind !== 'task_success')
    return deterministicGrade(g, output, c.expected, c.behavior, t)
  })
  assert(grade(checklist, trace, '已保存 doc_handoff_91').every(g => g.passed))
  const lazy = grade(checklist, { ...trace, calls: [] }, '已保存 doc_handoff_91')
  assert.equal(lazy[0]!.reason, 'conversation_only')
  assert.equal(lazy[1]!.passed, false)
  assert.equal(grade(checklist, trace, '我可以帮你保存，请确认')[1]!.passed, false)
  const invalid: ToolTrace = { ...trace, calls: [] }
  executeFixture(checklist.scenario!, invalid.calls, 'documents__read', '{"documentId":"doc_accept_73"}')
  executeFixture(checklist.scenario!, invalid.calls, 'secret-untrusted-tool-name', '{}')
  assert.deepEqual(invalid.calls, [{ tool: 'documents__read', status: 'unavailable' }, { tool: 'unknown-tool', status: 'unavailable' }])
  assert.equal(grade(checklist, invalid, '')[2]!.passed, false)
  assert(grade(boundaries.cases[0]!, { modelCalls: 1, stop: 'completed', calls: [] }, '会议取消，后续另行通知。').every(g => g.passed))
  const denied = boundaries.cases[3]!, deniedTrace: ToolTrace = { modelCalls: 2, stop: 'completed', calls: [] }
  executeFixture(denied.scenario!, deniedTrace.calls, 'documents__read', '{"documentId":"doc_private_47"}')
  assert(grade(denied, deniedTrace, '无权读取这份文档。').every(g => g.passed))
  executeFixture(denied.scenario!, deniedTrace.calls, 'research__search', '{"query":"doc_private_47"}')
  assert.equal(grade(denied, deniedTrace, '无权读取这份文档。')[2]!.passed, false)
})

test('recovery requires a fresh read after conflict, not repeating stale writes', () => {
  const c = datasetSchema.parse(read('../datasets/tool-recovery.v1.json')).cases[0]!
  const calls: ToolTrace['calls'] = []
  const call = (name: string, args: object) => executeFixture(c.scenario!, calls, name, JSON.stringify(args))
  call('documents__read', { documentId: 'doc_delivery_38' })
  const stale = { documentId: 'doc_delivery_38', title: '课程交付清单', expectedTitle: '课程交付（草稿）' }
  call('documents__rename', stale)
  const fresh = { ...stale, expectedTitle: '课程交付（已复核）' }
  call('documents__rename', fresh)
  assert.equal(calls.pop()!.status, 'unavailable')
  call('documents__read', { documentId: 'doc_delivery_38' })
  call('documents__rename', fresh)
  assert.deepEqual(calls.map(c => c.fixtureId), ['read-original', 'title-conflict', 'read-current', 'renamed'])
  for (const g of suite.graders) {
    assert(g.kind !== 'factuality' && g.kind !== 'task_success')
    assert(deterministicGrade(g, '已改为课程交付清单', c.expected, c.behavior, { modelCalls: 5, stop: 'completed', calls }).passed)
  }
})

test('local HTTP tool loop and CLI export real action receipts without fixture or prompt leakage', async () => {
  const requests: Array<Record<string, any>> = []
  let mode: 'normal' | 'missing-usage' | 'overspend' = 'normal'
  const actions = [
    { name: 'documents__list', arguments: '{}' },
    { name: 'documents__read', arguments: '{"documentId":"doc_accept_73"}' },
    { name: 'documents__create', arguments: JSON.stringify({ title: '验收清单', body: '何青确认签名回调；林远检查键盘焦点；周宁核对人民币账单。三项均未完成。' }) },
  ]
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body)
    const step = body.messages.filter((m: { role: string }) => m.role === 'tool').length
    const action = body.messages[1].content === checklist.input ? actions[step] : undefined
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id: 'offline-response', object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, finish_reason: action ? 'tool_calls' : 'stop', message: action
        ? { role: 'assistant', content: null, tool_calls: [{ id: `call-${step}`, type: 'function', function: action }] }
        : { role: 'assistant', content: body.messages[1].content === checklist.input ? '已保存 doc_handoff_91' : '会议取消，另行通知。' } }],
      ...(mode === 'missing-usage' ? {} : { usage: { prompt_tokens: mode === 'overspend' ? 1_000_000 : 10, completion_tokens: 2 } }) }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const config: ModelConfig = { baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
    model: 'offline-scripted-candidate', apiKey: 'synthetic-test-key', maxTokens: 512, timeoutMs: 2000,
    inputCnyPerMillion: 1, outputCnyPerMillion: 2 }
  const target = candidateTarget(config, 'tools'), store = new Store(':memory:')
  const dir = mkdtempSync(join(tmpdir(), 'eval-tools-'))
  try {
    const job = store.create(manifest({ dataset: { ...dataset, cases: [checklist] }, target: target.identity }))
    const report = await runJob(store, job, target)
    assert.deepEqual(report.gate.reasons, ['baseline_required'])
    assert.equal(report.score, 1)
    assert.deepEqual(report.usage, { candidate: { inputTokens: 40, outputTokens: 8, costCny: 0.000056 }, judge: zeroUsage() })
    assert.equal(report.tools?.toolCalls, 3)
    assert.equal(store.spans(job).filter(s => s.name === 'eval.tool').length, 3)
    assert.equal(requests.length, 4)
    assert(requests.every(r => r.tool_choice === 'auto' && r.parallel_tool_calls === false && r.max_tokens === 512))
    assert(!JSON.stringify(requests).includes(checklist.expected))
    assert(!JSON.stringify(requests[0]).includes('doc_accept_73'))
    assert(!JSON.stringify(requests).includes('saved-checklist'))
    assert(!JSON.stringify(report).includes('何青'))

    const low = await target.execute({ ...request, toolBudget: { ...request.toolBudget, maxSampleCostCny: 0.000001 } })
    assert.equal(low.tools?.stop, 'cost_limit')
    assert.equal(requests.length, 4)
    assert.equal((await target.execute({ ...request, toolBudget: { ...request.toolBudget, maxModelCalls: 1 } })).tools?.stop, 'model_call_limit')
    assert.equal((await target.execute({ ...request, toolBudget: { ...request.toolBudget, maxToolCalls: 1 } })).tools?.stop, 'tool_call_limit')
    mode = 'overspend'
    const spent = await target.execute(request)
    assert.equal(spent.tools?.stop, 'cost_limit')
    assert.equal(spent.tools?.modelCalls, 1)
    mode = 'missing-usage'
    const before = requests.length
    await assert.rejects(target.execute(request))
    assert.equal(requests.length, before + 1, 'missing usage must not retry')
    mode = 'normal'

    // Exercise CLI selection and exports with one local HTTP call per case and no Judge config.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('EVAL_')))
    for (const [key, value] of Object.entries({ BASE_URL: config.baseURL, MODEL: config.model, API_KEY: config.apiKey,
      INPUT_CNY_PER_MILLION: 1, OUTPUT_CNY_PER_MILLION: 2, MAX_TOKENS: 512, TIMEOUT_MS: 2000 })) env[`EVAL_CANDIDATE_${key}`] = String(value)
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'run', '--db', join(dir, 'eval.sqlite'),
      '--suite', 'suites/tool-boundaries.v1.json', '--dataset', 'datasets/tool-boundaries.v1.json', '--revision', 'offline-scripted-test', '--out', dir],
    { cwd: resolve(import.meta.dirname, '..'), env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    const [code] = await once(child, 'exit')
    assert.equal(code, 1, output)
    const jobId = /job=([a-z0-9-]+)/.exec(output)?.[1]
    assert(jobId)
    const exported: Report = JSON.parse(readFileSync(join(dir, `${jobId}.json`), 'utf8'))
    assert.equal(exported.target.id, 'candidate-tool-sandbox')
    assert.equal(exported.judgeFingerprint, null)
    assert.equal(exported.samples.length, boundaries.cases.length)
    const html = readFileSync(join(dir, `${jobId}.html`), 'utf8')
    for (const fragment of ['工具行为', '行动证据', '分类表现', 'conversation_only']) assert(html.includes(fragment))
    for (const secret of [config.apiKey, boundaries.cases[0]!.input, 'SYSTEM_OVERRIDE', '<script']) assert(!html.includes(secret))
  } finally {
    store.close(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()))
    assert(resolve(dir).startsWith(resolve(tmpdir()) + sep))
    rmSync(dir, { recursive: true, force: true })
  }
})

test('serial runs pass remaining spend to the next sample and stop after a budget or usage failure', async () => {
  const store = new Store(':memory:')
  try {
    const budgets: number[] = []
    const target: EvalTarget = { identity, async execute(request) {
      budgets.push(request.toolBudget!.maxSampleCostCny)
      return { output: '我可以帮忙', usage: { ...zeroUsage(), costCny: 0.05 },
        tools: { modelCalls: 1, stop: budgets.length === 1 ? 'completed' : 'cost_limit', calls: [] } }
    } }
    const job = store.create(manifest({ suite: { ...suite, gate: { ...suite.gate, maxCandidateCostCny: 0.1 } } }))
    await assert.rejects(runJob(store, job, target), /spend_limit_reached/)
    assert.deepEqual(budgets, [0.08, 0.05])
    assert.equal(store.job(job).status, 'failed')
    const report = store.job(job).report as Report
    assert.equal(report.tools?.conversationOnly, 1)
    assert(report.gate.reasons.includes('incomplete_samples'))
    assert(report.gate.reasons.includes('tool_execution_incomplete'))
    const unknown = store.create(manifest({ suite: { ...suite, version: 'unknown-usage' } }))
    let calls = 0
    await assert.rejects(runJob(store, unknown, { identity, async execute() { calls++; return { output: 'done' } } }), /usage_or_execution_error_stop/)
    assert.equal(calls, 1)
    assert(buildReport(store.job(unknown), store.samples(unknown)).gate.reasons.includes('tool_evidence_missing'))
  } finally { store.close() }
})

test('semantic suites validate; verification reads see current state and duplicate writes do not execute', () => {
  for (const name of ['tool-initiative.v2', 'tool-boundaries.v2', 'tool-recovery.v2', 'education-autonomy.v1', 'education-autonomy.v2', 'education-autonomy.v3', 'education-autonomy.v4']) {
    const data = datasetSchema.parse(read(`../datasets/${name}.json`)), config = suiteSchema.parse(read(`../suites/${name}.json`))
    manifestSchema.parse(manifest({ dataset: data, suite: config, judge: 'offline-judge' }))
    for (const c of data.cases) validateScenario(c.scenario!)
  }
  const data = datasetSchema.parse(read('../datasets/tool-initiative.v2.json'))
  const c = data.cases[0]!, calls: ToolTrace['calls'] = [], evidence: ToolEvidence = []
  const call = (name: string, args: object) => executeFixture(c.scenario!, calls, name, JSON.stringify(args), evidence)
  call('documents__list', {}); call('documents__read', { documentId: 'doc_accept_73' })
  call('documents__create', { title: '交接事项', body: '实际保存的内容，而非夹具预填的答案' })
  const result = call('documents__read', { documentId: 'doc_handoff_91' }) as { value: { title: string; body: string } }
  assert.equal(result.value.body, '实际保存的内容，而非夹具预填的答案')
  assert.equal(result.value.title, '交接事项')
  call('documents__create', { title: '不要重复', body: '第二份' })
  assert.equal(calls.at(-1)!.status, 'unavailable')
  const retry = data.cases.find(c => c.id === 'repair-stuck-ingestion-without-false-success')!, retryCalls: ToolTrace['calls'] = []
  executeFixture(retry.scenario!, retryCalls, 'knowledge__list_sources', '{}')
  executeFixture(retry.scenario!, retryCalls, 'knowledge__retry_ingestion', '{"sourceId":"source_notes_28"}')
  for (let i = 0; i < 2; i++) {
    const observed = executeFixture(retry.scenario!, retryCalls, 'knowledge__list_sources', '{}') as { value: Array<{ status: string }> }
    assert.equal(observed.value[0]!.status, 'queued')
  }
  const teacher = datasetSchema.parse(read('../datasets/education-autonomy.v3.json')).cases[0]!, teacherCalls: ToolTrace['calls'] = [], teacherEvidence: ToolEvidence = []
  const act = (name: string, args: object) => executeFixture(teacher.scenario!, teacherCalls, name, JSON.stringify(args), teacherEvidence)
  act('teacher__current', {})
  for (const title of ['第一次补练', '第二次补练', '进阶拓展']) act('teacher__draft_activity', { title, instructions: `${title}的可执行内容`, type: 'PRACTICE' })
  const activities = (act('teacher__list_activities', {}) as { value: Array<{ id: string; title: string }> }).value
  assert.deepEqual(activities.map(a => [a.id, a.title]), [['activity_draft_eval_22', '第一次补练'], ['activity_draft_eval_23', '第二次补练'], ['activity_draft_eval_24', '进阶拓展']])
  const overview = act('teacher__current', {}) as { value: { activities: unknown[] } }
  assert.deepEqual(overview.value.activities, activities)
  for (const activity of activities) act('teacher__publish_activity', { activityId: activity.id })
  assert.deepEqual(teacherCalls.slice(-3).map(c => c.status), ['pending', 'pending', 'pending'])
})

test('diagnostic efficiency never fails correct work; required actions still block release and portable baselines agree', async () => {
  const config = suiteSchema.parse(read('../suites/tool-initiative.v2.json'))
  const data = datasetSchema.parse(read('../datasets/tool-initiative.v2.json'))
  const grades = config.graders.map(g => ({ id: g.id, score: g.id === 'efficiency' ? 0 : 1, passed: g.id !== 'efficiency' }))
  assert.deepEqual(summarizeGrades(config.graders, grades), { score: 1, passed: true, failure: undefined })
  const store = new Store(':memory:'), imported = new Store(':memory:')
  try {
    const c = data.cases[0]!, trace: ToolTrace = { modelCalls: 5, stop: 'completed', calls: [
      { tool: 'documents__list', fixtureId: 'discovered', status: 'ok' },
      { tool: 'documents__read', fixtureId: 'read-notes', status: 'ok' },
      { tool: 'documents__create', fixtureId: 'saved-checklist', status: 'ok' },
      { tool: 'documents__read', fixtureId: 'verify-saved-document', status: 'ok' },
    ] }
    const target: EvalTarget = { identity, execute: async () => ({ output: '已保存', tools: trace, evidence: [], usage: zeroUsage() }) }
    const judge = { fingerprint: 'offline-semantic', grade: async () => ({ score: 1, usage: zeroUsage() }) }
    const m = manifest({ dataset: { ...data, cases: [c] }, suite: config, judge: judge.fingerprint })
    const job = store.create(m), report = await runJob(store, job, target, judge)
    assert.equal(report.score, 1); assert.equal(report.passRate, 1)
    assert.deepEqual(report.gate.reasons, ['baseline_required'])
    assert.equal(report.graders.find(g => g.id === 'efficiency')!.score, 0)
    store.promote('reviewed-diagnostic', job, 'Offline serialization test only')
    importBaseline(imported, exportBaseline(store, 'reviewed-diagnostic'))
    const failed = buildReport(store.job(job), [{ ...report.samples[0]!, grades: report.samples[0]!.grades.map(g => g.id === 'initiative' ? { ...g, score: 0, passed: false } : g) }])
    assert(failed.gate.reasons.includes('required_grader_failed'))
  } finally { store.close(); imported.close() }
})

test('Autoevals task Judge sees actual plan and pending approval once; evidence stays out of exports and spending is bounded', async () => {
  const data = datasetSchema.parse(read('../datasets/education-autonomy.v1.json')), c = data.cases[0]!
  const config = suiteSchema.parse(read('../suites/education-autonomy.v1.json'))
  const requests: Array<Record<string, any>> = []
  const actions = [
    { name: 'teacher__overview', arguments: '{}' },
    { name: 'teacher__draft_activity', arguments: JSON.stringify({ title: '分组补练', type: 'PRACTICE', instructions: '四名同学两次各20分钟练移项符号，其他八名做拓展题；每次有独立检查。private-plan-marker' }) },
    { name: 'teacher__publish_activity', arguments: '{"activityId":"activity_draft_eval_22"}' },
  ]
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body)
    const judging = body.model === 'offline-glm-judge', step = body.messages.filter((m: { role: string }) => m.role === 'tool').length
    const action = judging ? { name: body.tools[0].function.name, arguments: '{"choice":"PASS"}' } : actions[step]
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id: 'local-response', object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, finish_reason: action ? 'tool_calls' : 'stop', message: { role: 'assistant', content: action ? null : '补练草案已保存并提交审批，等待老师确认。',
        ...(action ? { tool_calls: [{ id: `call-${step}`, type: 'function', function: action }] } : {}) } }], usage: { prompt_tokens: 20, completion_tokens: 5 } }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const base: ModelConfig = { baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'offline-candidate', apiKey: 'explicit-shared-test-key',
    maxTokens: 1024, timeoutMs: 2000, inputCnyPerMillion: 1, outputCnyPerMillion: 2 }
  const target = candidateTarget(base, 'tools'), judge = semanticJudge({ ...base, model: 'offline-glm-judge', enableThinking: false }), store = new Store(':memory:')
  try {
    const job = store.create(manifest({ dataset: { ...data, cases: [c] }, suite: config, target: target.identity, judge: judge.fingerprint }))
    const report = await runJob(store, job, target, judge)
    assert.equal(report.passRate, 1); assert.equal(requests.length, 5)
    const request = requests.at(-1)!
    assert.equal(request.enable_thinking, false)
    assert(JSON.stringify(request.messages).includes('private-plan-marker'))
    assert(JSON.stringify(request.messages).includes('pending'))
    assert(!request.tools[0].function.parameters.properties.reasons)
    for (const output of [JSON.stringify(report), JSON.stringify(store.spans(job))]) {
      assert(!output.includes('private-plan-marker')); assert(!output.includes(base.apiKey)); assert(!output.includes(c.input))
    }
    const before = requests.length
    await assert.rejects(judge.grade('input', 'output', 'expected', new AbortController().signal, 'budget', { taskSuccess: true, evidence: [], maxCostCny: 0.000001 }), /judge_spend_limit_reached/)
    assert.equal(requests.length, before, 'refuse before dispatch, with no retries')
  } finally { store.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})

test('public child deferral ends the turn; Canvas stays active and unfinished executions do not spend on a Judge', async () => {
  const data = datasetSchema.parse(read('../datasets/education-autonomy.v2.json'))
  const c = data.cases.find(c => c.id === 'student-start-collaborative-canvas')!, config = suiteSchema.parse(read('../suites/education-autonomy.v2.json'))
  let requests = 0
  const actions = [{ name: 'canvas__available_agents', arguments: '{}' }, { name: 'canvas__start_workspace', arguments: JSON.stringify({ title: '调查展示', goal: '分析数据并核验报告',
    members: [{ agentId: 'agent_data_eval', assignment: '分析数据并整合展示' }, { agentId: 'agent_verify_eval', assignment: '核验数据和结论', executionRole: 'verifier', verifiesAgentId: 'agent_data_eval', dependsOnAgentIds: ['agent_data_eval'] }] }) }]
  const server = createServer(async (req, res) => {
    for await (const _ of req) { /* drain the synthetic request */ }
    const action = actions[requests++]!
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id: 'local', object: 'chat.completion', created: 1, model: 'offline',
      choices: [{ index: 0, finish_reason: 'tool_calls', message: { role: 'assistant', content: null, tool_calls: [{ id: `call-${requests}`, type: 'function', function: action }] } }],
      usage: { prompt_tokens: 20, completion_tokens: 5 } }))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const target = candidateTarget({ baseURL: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'offline', apiKey: 'test-key',
    inputCnyPerMillion: 1, outputCnyPerMillion: 2, maxTokens: 512, timeoutMs: 2000 }, 'tools')
  const store = new Store(':memory:')
  try {
    const response = await target.execute({ input: c.input, scenario: c.scenario, toolBudget: config.toolBudget, requestId: 'child', seed: 1, signal: new AbortController().signal })
    assert.equal(requests, 2); assert.equal(response.tools!.stop, 'completed'); assert.equal(response.output, '')
    assert.deepEqual(response.tools!.calls.map(c => c.fixtureId), ['canvas-agents', 'canvas-started'])
    const state = executeFixture(c.scenario!, structuredClone(response.tools!.calls), 'canvas__current', '{}') as { value: { id: string; status: string } }
    assert.deepEqual({ id: state.value.id, status: state.value.status }, { id: 'canvas_eval_77', status: 'active' })
    let judging = 0
    const judge = { fingerprint: 'offline', grade: async () => { judging++; return { score: 1, usage: zeroUsage() } } }
    const m = manifest({ dataset: { ...data, cases: [c] }, suite: config, target: target.identity, judge: judge.fingerprint })
    const cached = { ...target, execute: async () => response }
    const completed = await runJob(store, store.create(m), cached, judge)
    assert.equal(completed.passRate, 1); assert.equal(judging, 1)
    const limited = await runJob(store, store.create(m), { ...cached, execute: async () => ({ ...response, tools: { ...response.tools!, stop: 'tool_call_limit' as const } }) }, judge)
    assert.equal(judging, 1)
    assert.equal(limited.samples[0]!.failure, 'tool_execution_incomplete')
    assert(limited.gate.reasons.includes('tool_execution_incomplete'))
  } finally { store.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
