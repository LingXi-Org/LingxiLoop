import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { datasetSchema, suiteSchema, hash, zeroUsage, EvaluationError, type EvalTarget, type Judge } from '../src/contracts.js'
import { candidateTarget, semanticJudge, configFromEnv, type ModelConfig } from '../src/models.js'
import { Store, type Manifest } from '../src/store.js'
import { runJob } from '../src/runner.js'
import { buildReport } from '../src/report.js'
import { deterministicGrade } from '../src/graders.js'
import { exportBaseline, importBaseline } from '../src/baseline.js'
import { htmlReport } from '../src/html-report.js'

const dataset = datasetSchema.parse({ schemaVersion: 1, id: 'test', version: '1', cases: [{ id: 'one', input: 'Two plus two?', expected: '4' }] })
const suite = suiteSchema.parse({ schemaVersion: 2, id: 'test', version: '1', dataset: { id: 'test', version: '1' }, samples: 2, concurrency: 2, timeoutMs: 1000,
  graders: [{ id: 'exact', kind: 'exact', threshold: 1 }],
  gate: { minScore: 1, minPassRate: 1, maxScoreDrop: 0, maxCaseDrop: 0, maxP95LatencyMs: 10000, maxCandidateCostCny: 1, maxJudgeCostCny: 1, requireBaseline: true } })
const target: EvalTarget = { identity: { id: 'unit-test-target', version: '1', fingerprint: hash('fixed') }, execute: async () => ({ output: '4', usage: zeroUsage() }) }
function manifest(overrides: Partial<Manifest> = {}): Manifest {
  return { schemaVersion: 2, engine: 'black-box-eval/2', suite, dataset, target: target.identity, judge: null, seed: 42, provenance: { revision: 'test' }, baseline: null, ...overrides }
}

test('strict versioned inputs and deterministic grading reject ambiguous data', () => {
  assert.throws(() => datasetSchema.parse({ ...dataset, cases: [...dataset.cases, ...dataset.cases] }))
  assert.throws(() => suiteSchema.parse({ ...suite, fallback: true }))
  assert.throws(() => suiteSchema.parse({ ...suite, graders: [] }))
  assert.deepEqual(deterministicGrade({ id: 'json', kind: 'json', threshold: 1 }, '{"b":2,"a":1}', '{"a":1,"b":2}'), { id: 'json', score: 1, passed: true })
  assert.equal(deterministicGrade({ id: 'json', kind: 'json', threshold: 1 }, 'bad', '{}').score, 0)
  assert.equal(deterministicGrade({ id: 'contains', kind: 'contains', value: 'needle', threshold: 1 }, 'hay needle', '').score, 1)
  assert.equal(hash({ b: 2, a: 1 }), hash({ a: 1, b: 2 }))
  assert.throws(() => configFromEnv('CANDIDATE', { OPENAI_API_KEY: 'must-not-inherit' }), /invalid_candidate_config/)
})

test('persistent jobs, immutable baselines and regression gates survive reopening', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'black-box-eval-'))
  let store = new Store(join(dir, 'eval.sqlite'))
  try {
    const first = store.create(manifest())
    const result = await runJob(store, first, target)
    const visual = htmlReport({ ...result, revision: '<img src=x onerror=alert(1)>' }, [])
    assert(visual.includes('&lt;img src=x onerror=alert(1)&gt;'))
    assert(!visual.includes('<img'))
    assert(!visual.includes('<script'))
    assert(visual.includes('baseline_required'))
    assert(visual.includes('<meter'))
    assert.deepEqual(result.gate, { passed: false, reasons: ['baseline_required'] })
    assert.equal(result.eligible, true)
    const costly = store.samples(first).map(sample => ({ ...sample, judge: { ...sample.judge, costCny: 0.6 } }))
    const overBudget = buildReport(store.job(first), costly)
    assert.equal(overBudget.usage.judge.costCny, 1.2)
    assert(overBudget.gate.reasons.includes('judge_cost_budget_exceeded'))
    assert(htmlReport(overBudget, []).includes('¥1.200000'))
    store.promote('release-1', first, 'Initial reviewed reference')
    const portable = exportBaseline(store, 'release-1')
    const ci = new Store(':memory:')
    try {
      assert.throws(() => importBaseline(ci, { ...portable, schemaVersion: 1 }))
      assert.equal(importBaseline(ci, portable), 'release-1')
      assert.equal((ci.baseline('release-1').report as { score: number }).score, 1)
      assert.throws(() => importBaseline(ci, { ...portable, reason: 'tampered' }), /baseline_digest_mismatch/)
      const { digest: _, ...forged } = structuredClone(portable)
      forged.samples[0]!.score = 0
      assert.throws(() => importBaseline(ci, { ...forged, digest: hash(forged) }), /invalid_baseline_score/)
    } finally { ci.close() }
    assert.throws(() => store.promote('release-1', first, 'Cannot replace'), /UNIQUE/)
    store.close()
    store = new Store(join(dir, 'eval.sqlite'))
    const rerun = store.create(manifest({ baseline: 'release-1' }))
    const report = await runJob(store, rerun, target)
    assert.equal(report.gate.passed, true)
    assert.equal(report.comparison?.scoreDelta, 0)
    assert.equal(report.samples.length, 2)
    const spans = store.spans(rerun)
    assert.equal(spans.filter(s => s.name === 'eval.sample').length, 2)
    assert(spans.every(s => /^[0-9a-f]{32}$/.test(s.traceId) && /^[0-9a-f]{16}$/.test(s.spanId)))
    assert(spans.filter(s => s.parentSpanId).every(s => spans.some(parent => parent.spanId === s.parentSpanId)))
    assert(!JSON.stringify(report).includes('Two plus two?'))
    const bad = { ...target, execute: async () => ({ output: 'wrong', usage: zeroUsage() }) }
    const badJob = store.create(manifest({ baseline: 'release-1' }))
    const regression = await runJob(store, badJob, bad)
    assert(regression.gate.reasons.includes('case_regression'))
    assert.throws(() => store.promote('bad', badJob, 'bad'), /baseline_not_eligible/)
    const changed = manifest({ suite: { ...suite, version: '2' } })
    const newJob = store.create(changed)
    assert(buildReport(store.job(newJob), report.samples, store.baseline('release-1')).gate.reasons.includes('baseline_incompatible'))
    assert.throws(() => store.create(manifest({ dataset: { ...dataset, cases: [{ ...dataset.cases[0]!, input: 'changed' }] } })), /version_content_conflict/)
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }) }
})

test('lease fencing, crash recovery, cancellation and no duplicate paid calls', async () => {
  const store = new Store(':memory:')
  try {
    const job = store.create(manifest())
    const old = store.claim(job, 10000)
    assert.throws(() => store.claim(job, 10000), /job_unavailable/)
    store.startSample(job, old, 'one', 0)
    store.db.prepare('UPDATE jobs SET lease_until=0 WHERE id=?').run(job)
    let calls = 0
    const result = await runJob(store, job, { ...target, execute: async () => { calls++; return { output: '4', usage: zeroUsage() } } })
    assert.equal(calls, 1)
    assert.equal(result.samples[0]?.failure, 'interrupted_usage_unknown')
    assert.equal(result.gate.passed, false)
    assert.throws(() => store.saveSample(job, old, result.samples[0]!), /lease_lost/)
    const cancelled = store.create(manifest())
    store.cancel(cancelled)
    await assert.rejects(runJob(store, cancelled, target), /job_unavailable/)
    const mismatch = store.create(manifest())
    await assert.rejects(runJob(store, mismatch, { ...target, identity: { ...target.identity, fingerprint: 'different' } }), /target_or_judge_config_changed/)
  } finally { store.close() }
})

test('timeouts, malformed target output, missing usage and judge errors fail closed', async () => {
  const store = new Store(':memory:')
  try {
    const timeoutSuite = { ...suite, version: 'timeout', timeoutMs: 100, samples: 1 }
    const timed = store.create(manifest({ suite: timeoutSuite }))
    const hung = { ...target, execute: async () => new Promise<never>(() => {}) }
    const report = await runJob(store, timed, hung)
    assert.equal(report.samples[0]?.failure, 'sample_timeout')
    assert(report.gate.reasons.includes('sample_errors'))
    const missing = store.create(manifest())
    const unknown = await runJob(store, missing, { ...target, execute: async () => ({ output: '4' }) })
    assert(unknown.gate.reasons.includes('candidate_usage_unknown'))
    const malformed = store.create(manifest())
    const invalid = await runJob(store, malformed, { ...target, execute: async () => ({ output: '4', usage: { ...zeroUsage(), costCny: -1 } }) })
    assert(invalid.gate.reasons.includes('sample_errors'))
    const judging: Judge = { fingerprint: 'judge-test', grade: async () => { throw new EvaluationError('judge_unavailable') } }
    const judged = store.create(manifest({ judge: judging.fingerprint, suite: { ...suite, version: 'judge', graders: [{ id: 'semantic', kind: 'factuality', threshold: 0.8 }] } }))
    const error = await runJob(store, judged, target, judging)
    assert.equal(error.samples[0]?.failure, 'judge_unavailable')
    assert(error.gate.reasons.includes('sample_errors'))
    const exportFailure = store.create(manifest())
    await assert.rejects(runJob(store, exportFailure, target, undefined, undefined, {
      emit() {}, flush: async () => { throw new EvaluationError('telemetry_unavailable') },
    }), /telemetry_unavailable/)
    assert.equal(store.job(exportFailure).status, 'failed')
    assert.deepEqual((store.job(exportFailure).report as { gate: { reasons: string[] } }).gate.reasons, ['baseline_required', 'telemetry_unavailable'])
    assert.throws(() => store.promote('export-failed', exportFailure, 'must fail'), /baseline_not_eligible/)
  } finally { store.close() }
})

test('real HTTP Candidate and Autoevals Judge clients isolate credentials, usage, costs and spans', async () => {
  const requests: { path: string; auth: string | undefined; model: string; messages: unknown; requestsExplanation: boolean }[] = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push({ path: req.url!, auth: req.headers.authorization, model: body.model, messages: body.messages,
      requestsExplanation: Boolean(body.tools?.[0]?.function?.parameters?.properties?.reasons) })
    const judge = req.url?.startsWith('/judge/')
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ id: 'response', object: 'chat.completion', created: 1, model: body.model,
      choices: [{ index: 0, finish_reason: judge ? 'tool_calls' : 'stop', message: judge
        ? { role: 'assistant', content: null, tool_calls: [{ id: 'call', type: 'function', function: { name: body.tools[0].function.name, arguments: JSON.stringify({ choice: 'C', reasons: 'Equivalent' }) } }] }
        : { role: 'assistant', content: '4' } }], usage: { prompt_tokens: judge ? 20 : 10, completion_tokens: judge ? 5 : 2 } }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}`
  const candidate: ModelConfig = { baseURL: `${base}/candidate`, apiKey: 'candidate-secret', model: 'production-candidate', inputCnyPerMillion: 1, outputCnyPerMillion: 2, maxTokens: 100, timeoutMs: 1000 }
  const judgeConfig = { ...candidate, baseURL: `${base}/judge`, apiKey: 'judge-secret', model: 'independent-judge', inputCnyPerMillion: 3 }
  const liveTarget = candidateTarget(candidate)
  const judge = semanticJudge(judgeConfig)
  const store = new Store(':memory:')
  const cliDir = mkdtempSync(join(tmpdir(), 'eval-cli-'))
  try {
    const job = store.create(manifest({ target: liveTarget.identity, judge: judge.fingerprint, suite: { ...suite, version: 'http', timeoutMs: 5000,
      graders: [{ id: 'semantic', kind: 'factuality', threshold: 0.8 }] } }))
    const report = await runJob(store, job, liveTarget, judge)
    assert.equal(report.eligible, true, JSON.stringify(report))
    assert.deepEqual(report.usage, { candidate: { inputTokens: 20, outputTokens: 4, costCny: 0.000028 }, judge: { inputTokens: 40, outputTokens: 10, costCny: 0.00014 } })
    assert.equal(requests.length, 4)
    assert(requests.filter(r => r.path.startsWith('/candidate/')).every(r => r.auth === 'Bearer candidate-secret' && r.model === 'production-candidate'))
    assert(requests.filter(r => r.path.startsWith('/judge/')).every(r => r.auth === 'Bearer judge-secret' && r.model === 'independent-judge'))
    assert(requests.filter(r => r.path.startsWith('/judge/')).every(r => !r.requestsExplanation))
    const telemetry = store.spans(job)
    assert.equal(telemetry.filter(s => s.name === 'eval.model').length, 2)
    assert.equal(telemetry.filter(s => s.name === 'eval.judge').length, 2)
    const modelTraces = telemetry.filter(s => s.name === 'eval.model' || s.name === 'eval.judge')
    assert.equal(new Set(modelTraces.map(s => s.traceId)).size, 4)
    assert(modelTraces.every(s => !s.parentSpanId && s.links?.some(link => telemetry.some(parent => parent.spanId === link.spanId && parent.traceId === link.traceId))))
    assert(!JSON.stringify(telemetry).includes('secret'))
    assert(!JSON.stringify(telemetry).includes('Two plus two?'))
    const cli = async (args: string[], env: NodeJS.ProcessEnv = {}) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { cwd: resolve(import.meta.dirname, '..'),
        env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
      let output = ''
      child.stdout.on('data', b => { output += b })
      child.stderr.on('data', b => { output += b })
      const [code] = await once(child, 'exit')
      return { code, output }
    }
    const env = Object.fromEntries([['CANDIDATE', candidate], ['JUDGE', judgeConfig]].flatMap(([role, config]) => {
      const c = config as ModelConfig
      return Object.entries({ BASE_URL: c.baseURL, MODEL: c.model, API_KEY: c.apiKey, INPUT_CNY_PER_MILLION: c.inputCnyPerMillion,
        OUTPUT_CNY_PER_MILLION: c.outputCnyPerMillion, MAX_TOKENS: c.maxTokens, TIMEOUT_MS: c.timeoutMs }).map(([key, value]) => [`EVAL_${role}_${key}`, String(value)])
    }))
    const db = join(cliDir, 'local.sqlite')
    const suiteFile = join(cliDir, 'suite.json')
    const datasetFile = join(cliDir, 'dataset.json')
    writeFileSync(suiteFile, JSON.stringify(store.job(job).manifest.suite))
    writeFileSync(datasetFile, JSON.stringify(dataset))
    const args = ['--suite', suiteFile, '--dataset', datasetFile, '--revision', 'http-test', '--out', join(cliDir, 'reports')]
    const first = await cli(['run', '--db', db, ...args], env)
    assert.equal(first.code, 1, first.output)
    const jobId = /job=([a-z0-9-]+)/.exec(first.output)?.[1]
    assert(jobId)
    const html = readFileSync(join(cliDir, 'reports', `${jobId}.html`), 'utf8')
    assert(html.includes('production-candidate') && html.includes('independent-judge'))
    assert(!html.includes('candidate-secret') && !html.includes('Two plus two?'))
    assert.equal((await cli(['baseline', '--db', db, '--job', jobId, '--name', 'cli-baseline', '--reason', 'Reviewed'])).code, 0)
    const portable = join(cliDir, 'baseline.json')
    assert.equal((await cli(['baseline-export', '--db', db, '--name', 'cli-baseline', '--file', portable])).code, 0)
    const release = await cli(['run', '--db', join(cliDir, 'ci.sqlite'), ...args, '--baseline-file', portable], env)
    assert.equal(release.code, 0, release.output)
    assert(!release.output.includes('candidate-secret'))
    const invalid = await cli(['run', '--db', db, ...args], { ...env, EVAL_CANDIDATE_API_KEY: '' })
    assert.equal(invalid.code, 2)
  } finally { store.close(); server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); rmSync(cliDir, { recursive: true, force: true }) }
})

test('Eval imports remain inside its package or declared dependencies; AgentOS adapter stays empty', () => {
  const root = resolve(import.meta.dirname, '..')
  const dependencies = ['autoevals', 'openai', 'zod']
  for (const directory of ['src', 'targets']) for (const file of readdirSync(join(root, directory))) {
    if (!file.endsWith('.ts')) continue
    const source = readFileSync(join(root, directory, file), 'utf8')
    for (const match of source.matchAll(/(?:from\s+|import\s*\()(['"])([^'"]+)\1/g)) {
      const specifier = match[2]!
      if (specifier.startsWith('.')) assert(resolve(root, directory, specifier).startsWith(root + '/'.replace('/', process.platform === 'win32' ? '\\' : '/')))
      else assert(specifier.startsWith('node:') || dependencies.includes(specifier), `${file}: ${specifier}`)
    }
  }
  const adapter = readFileSync(join(root, 'targets/agent-os.ts'), 'utf8')
  assert(!/class |function |execute\(/.test(adapter))
  assert(!readFileSync(join(root, 'src/runner.ts'), 'utf8').includes("from './models.js'"))
})
