import { parseArgs } from 'node:util'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { datasetSchema, suiteSchema, EvaluationError, failureCode } from './contracts.js'
import { candidateTarget, configFromEnv, semanticJudge } from './models.js'
import { runJob, validateManifest } from './runner.js'
import { markdown, type Report } from './report.js'
import { Store, type Manifest } from './store.js'
import { exportBaseline, importBaseline } from './baseline.js'
import { htmlReport } from './html-report.js'

function readJson(path: string): unknown {
  const bytes = readFileSync(path)
  if (bytes.length > 16 * 1024 * 1024) throw new EvaluationError('input_too_large')
  return JSON.parse(bytes.toString('utf8'))
}
function exportReport(store: Store, jobId: string, directory: string) {
  const job = store.job(jobId)
  if (!job.report) throw new EvaluationError('report_not_ready')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const report = job.report as Report
  writeFileSync(resolve(directory, `${jobId}.json`), JSON.stringify(report, null, 2), { mode: 0o600 })
  writeFileSync(resolve(directory, `${jobId}.md`), markdown(report), { mode: 0o600 })
  const spans = store.spans(jobId)
  writeFileSync(resolve(directory, `${jobId}.html`), htmlReport(report, spans), { mode: 0o600 })
  writeFileSync(resolve(directory, `${jobId}.spans.jsonl`), spans.map(s => JSON.stringify(s)).join('\n'), { mode: 0o600 })
  return report
}
export async function main(args = process.argv.slice(2)) {
  const { positionals, values } = parseArgs({ args, allowPositionals: true, options: Object.fromEntries(
    ['env', 'db', 'suite', 'dataset', 'job', 'seed', 'revision', 'baseline', 'baseline-file', 'name', 'reason', 'out', 'file'].map(k => [k, { type: 'string' as const }])) })
  const command = positionals[0]
  if (positionals.length !== 1 || !['enqueue', 'run', 'work', 'rerun', 'cancel', 'report', 'baseline', 'baseline-export', 'baseline-import', 'gate'].includes(command ?? '')) {
    throw new EvaluationError('usage_enqueue_run_work_rerun_cancel_report_baseline_gate')
  }
  if (values.env) loadEnvFile(values.env)
  const store = new Store(values.db ?? '.state/eval.sqlite')
  const required = (name: string) => { const v = values[name]; if (!v) throw new EvaluationError(`missing_${name}`); return v }
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    if (command === 'cancel') { store.cancel(required('job')); return }
    if (command === 'baseline-export') { writeFileSync(required('file'), JSON.stringify(exportBaseline(store, required('name')), null, 2), { flag: 'wx', mode: 0o600 }); return }
    if (command === 'baseline-import') { console.log(`baseline=${importBaseline(store, readJson(required('file')))}`); return }
    if (command === 'baseline') { store.promote(required('name'), required('job'), required('reason')); return }
    if (command === 'report' || command === 'gate') {
      const report = exportReport(store, required('job'), values.out ?? '.state/reports')
      if (command === 'gate' && !report.gate.passed) process.exitCode = 1
      return
    }
    const candidateConfig = configFromEnv('CANDIDATE')
    const target = candidateTarget(candidateConfig)
    const old = command === 'work' || command === 'rerun' ? store.job(required('job')) : undefined
    const suite = old?.manifest.suite ?? suiteSchema.parse(readJson(required('suite')))
    const dataset = old?.manifest.dataset ?? datasetSchema.parse(readJson(required('dataset')))
    const judgeConfig = suite.graders.some(g => g.kind === 'factuality') ? configFromEnv('JUDGE') : undefined
    if (judgeConfig && judgeConfig.model === candidateConfig.model && judgeConfig.baseURL === candidateConfig.baseURL) throw new EvaluationError('judge_must_be_independent_model')
    const judge = judgeConfig ? semanticJudge(judgeConfig) : undefined
    if (values.baseline && values['baseline-file']) throw new EvaluationError('conflicting_baseline_options')
    const baseline = values['baseline-file'] ? importBaseline(store, readJson(values['baseline-file'])) : values.baseline ?? null
    const manifest: Manifest = old?.manifest ?? {
      schemaVersion: 2, engine: 'black-box-eval/2', suite, dataset, target: target.identity, judge: judge?.fingerprint ?? null,
      seed: Number(values.seed ?? '1'), provenance: { revision: required('revision') }, baseline,
    }
    validateManifest(manifest)
    if (manifest.baseline) store.baseline(manifest.baseline)
    const jobId = command === 'work' ? required('job') : store.create(manifest)
    console.log(`job=${jobId}`)
    if (command === 'enqueue') return
    let report: Report
    try { report = await runJob(store, jobId, target, judge, controller.signal) }
    catch (error) {
      if (store.job(jobId).report) exportReport(store, jobId, values.out ?? '.state/reports')
      throw error
    }
    exportReport(store, jobId, values.out ?? '.state/reports')
    if (!report.gate.passed) process.exitCode = 1
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    store.close()
  }
}

main().catch(error => { console.error(failureCode(error)); process.exitCode = 2 })
