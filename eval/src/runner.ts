import { EvaluationError, ModelError, failureCode, hash, addUsage, zeroUsage, targetResponseSchema, manifestSchema, type EvalTarget, type Judge, type Sample } from './contracts.js'
import { deterministicGrade } from './graders.js'
import { buildReport } from './report.js'
import type { Store, Manifest } from './store.js'
import { span, traceId, modelScope, type TelemetryBackend } from './telemetry.js'

export function validateManifest(manifest: Manifest) {
  manifestSchema.parse(manifest)
}

async function deadline<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number, parent: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let abort: () => void = () => {}
  const stop = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new EvaluationError('cancelled')) }
    parent.addEventListener('abort', abort, { once: true })
    timer = setTimeout(() => { controller.abort(); reject(new EvaluationError('sample_timeout')) }, timeoutMs)
  })
  try {
    if (parent.aborted) abort()
    return await Promise.race([stop, work(controller.signal)])
  } finally { clearTimeout(timer); parent.removeEventListener('abort', abort) }
}

export async function runJob(store: Store, jobId: string, target: EvalTarget, judge?: Judge, parentSignal = new AbortController().signal, backend?: TelemetryBackend) {
  const job = store.job(jobId)
  validateManifest(job.manifest)
  if (hash(target.identity) !== hash(job.manifest.target) || (judge?.fingerprint ?? null) !== job.manifest.judge) throw new EvaluationError('target_or_judge_config_changed')
  const baseline = job.manifest.baseline ? store.baseline(job.manifest.baseline) : undefined
  const leaseMs = Math.max(30_000, job.manifest.suite.timeoutMs * 2)
  const owner = store.claim(jobId, leaseMs)
  const persisted = store.telemetry(jobId, owner)
  const telemetry: TelemetryBackend = { emit: event => { persisted.emit(event); backend?.emit(event) },
    flush: async () => { await persisted.flush(); await backend?.flush() } }
  const controller = new AbortController()
  const signal = AbortSignal.any([parentSignal, controller.signal])
  let leaseError: unknown
  const heartbeat = setInterval(() => { try { store.heartbeat(jobId, owner, leaseMs) } catch (error) { leaseError = error; controller.abort() } }, Math.min(5000, leaseMs / 3))
  const trace = traceId()
  const run = span('eval.run', trace)
  const pending = store.pending(jobId)
  let cursor = 0
  try {
    // Case spans enclose samples in the same case; bounded workers own complete cases.
    const caseIds = [...new Set(pending.map(s => s.caseId))]
    const worker = async () => {
      while (cursor < caseIds.length && !signal.aborted) {
        const caseId = caseIds[cursor++]!
        const c = job.manifest.dataset.cases.find(c => c.id === caseId)!
        const caseSpan = span('eval.case', trace, run.id)
        let caseFailed = false
        for (const item of pending.filter(p => p.caseId === caseId)) {
          if (signal.aborted) break
          store.startSample(jobId, owner, item.caseId, item.index)
          const sampleSpan = span('eval.sample', trace, caseSpan.id)
          const started = Date.now()
          const sample: Sample = { caseId, index: item.index, status: 'error', score: 0, latencyMs: 0, grades: [], judge: zeroUsage() }
          let phase: 'candidate' | 'judge' = 'candidate'
          try {
            if (item.interrupted) throw new EvaluationError('interrupted_usage_unknown')
            await deadline(async sampleSignal => {
              await modelScope.run({ traceId: trace, parentSpanId: sampleSpan.id, runId: jobId, caseId, sample: item.index, telemetry }, async () => {
                const requestId = hash({ jobId, caseId, sample: item.index })
                const response = targetResponseSchema.parse(await target.execute({ input: c.input, signal: sampleSignal, requestId,
                  seed: parseInt(hash({ seed: job.manifest.seed, caseId, index: item.index }).slice(0, 7), 16) }))
                sampleSignal.throwIfAborted()
                sample.candidate = response.usage
                sample.outputHash = hash(response.output)
                for (const g of job.manifest.suite.graders) {
                  phase = g.kind === 'factuality' ? 'judge' : 'candidate'
                  const grading = span('eval.grader', trace, sampleSpan.id)
                  let gradingFailure: string | undefined
                  try {
                    if (g.kind === 'factuality') {
                      if (!judge) throw new EvaluationError('judge_required')
                      const result = await judge.grade(c.input, response.output, c.expected, sampleSignal, `${requestId}-${g.id}`)
                      sample.judge = addUsage(sample.judge, result.usage)
                      sampleSignal.throwIfAborted()
                      if (!Number.isFinite(result.score) || result.score < 0 || result.score > 1) throw new EvaluationError('invalid_judge_score')
                      sample.grades.push({ id: g.id, score: result.score, passed: result.score >= g.threshold })
                    } else sample.grades.push(deterministicGrade(g, response.output, c.expected))
                  } catch (error) { gradingFailure = failureCode(error); throw error }
                  finally { telemetry.emit(grading.end({ 'eval.grader.id': g.id, 'eval.case.id': caseId, 'eval.sample.index': item.index,
                    'eval.grader.score': sample.grades.find(r => r.id === g.id)?.score ?? 0 }, gradingFailure)) }
                }
              })
            }, job.manifest.suite.timeoutMs, signal)
            sample.score = sample.grades.reduce((sum, g) => sum + g.score, 0) / job.manifest.suite.graders.length
            sample.status = sample.grades.every(g => g.passed) ? 'pass' : 'fail'
            if (sample.status === 'fail') sample.failure = 'grader_threshold'
          } catch (error) {
            sample.failure = failureCode(error)
            if (error instanceof ModelError) {
              if (phase === 'candidate') sample.candidate = error.usage
              else sample.judge = addUsage(sample.judge, error.usage)
            }
          }
          sample.latencyMs = Date.now() - started
          caseFailed ||= sample.status !== 'pass'
          store.saveSample(jobId, owner, sample)
          telemetry.emit(sampleSpan.end({ 'eval.case.id': caseId, 'eval.sample.index': item.index, 'eval.score': sample.score, 'eval.latency.ms': sample.latencyMs }, sample.failure))
        }
        telemetry.emit(caseSpan.end({ 'eval.case.id': caseId }, caseFailed ? 'case_failed' : undefined))
      }
    }
    const workers = await Promise.allSettled(Array.from({ length: Math.min(caseIds.length, job.manifest.suite.concurrency) }, worker))
    const failed = workers.find(r => r.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
    if (leaseError) throw leaseError
    if (signal.aborted) throw new EvaluationError('cancelled')
    const report = buildReport(job, store.samples(jobId), baseline)
    telemetry.emit(run.end({ 'eval.run.id': jobId, 'eval.score': report.score, 'eval.gate.passed': report.gate.passed }, report.gate.passed ? undefined : 'gate_failed'))
    await telemetry.flush()
    store.finish(jobId, owner, report)
    return report
  } catch (error) {
    // Preserve infrastructure failure even if a backend fails after every sample completed.
    const failure = failureCode(error)
    try {
      const report = buildReport(job, store.samples(jobId), baseline)
      report.eligible = false
      report.gate = { passed: false, reasons: [...new Set([...report.gate.reasons, failure])] }
      store.fail(jobId, owner, report)
    } catch (stateError) {
      // Cancellation or a newer lease owner already owns the authoritative job state.
      if (!(stateError instanceof EvaluationError && stateError.code === 'lease_lost')) throw stateError
    }
    throw error
  } finally { clearInterval(heartbeat) }
}
