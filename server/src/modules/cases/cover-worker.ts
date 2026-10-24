import type { Queryable } from '../../db/queryable.js'
import type { WorkerTaskHandle } from '../../runtime/lifecycle.js'
import type { CaseCoverGenerationInput, CaseCoverGenerationResult } from './cover-contracts.js'
import { claimCaseCover, completeCaseCover, failCaseCover, releaseCaseCover, renewCaseCoverLease } from './cover-repository.js'

export interface CaseCoverWorkerInfrastructure {
  db: Queryable
  transaction<T>(work: (db: Queryable) => Promise<T>): Promise<T>
  generate(input: CaseCoverGenerationInput): Promise<CaseCoverGenerationResult>
  enabled(): boolean
  concurrency?: number
  timeoutMs?: number
  maxAttempts?: number
}
function bounded(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.max(min,Math.min(max,Math.trunc(value!))) : fallback
}
function failureCategory(error: unknown): string {
  const code = error && typeof error==='object' && 'code' in error ? String(error.code) : ''
  return ['renderer_unavailable','invalid_model_output','invalid_svg','upstream_validation','source_integrity','render_failed','invalid_output','validation_failed','model_unavailable','generation_timeout','lease_lost','worker_stopped'].includes(code) ? code : 'generation_failed'
}
export function createCaseCoverWorker(infrastructure: CaseCoverWorkerInfrastructure) {
  const concurrency = bounded(infrastructure.concurrency,1,1,4)
  const timeoutMs = bounded(infrastructure.timeoutMs,120_000,100,300_000)
  const maxAttempts = bounded(infrastructure.maxAttempts,3,1,5)
  const controllers = new Set<AbortController>()
  let stopped = false
  async function runOnce(workerId = `case-cover-${process.pid}`): Promise<boolean> {
    if (stopped || !infrastructure.enabled()) return false
    const claim = await infrastructure.transaction(db => claimCaseCover(db,workerId,concurrency,maxAttempts))
    if (!claim) return false
    if (stopped) {
      await infrastructure.transaction(db => releaseCaseCover(db,claim))
      return true
    }
    const controller = new AbortController()
    controllers.add(controller)
    const abort = (code: string) => controller.abort(Object.assign(new Error(code),{code}))
    const heartbeat = setInterval(() => {
      void renewCaseCoverLease(infrastructure.db,claim).then(renewed => { if (!renewed) abort('lease_lost') },() => abort('lease_lost'))
    },30_000)
    heartbeat.unref?.()
    const timeout = setTimeout(() => abort('generation_timeout'),timeoutMs)
    timeout.unref?.()
    const startedAt = Date.now()
    try {
      const aborted = new Promise<never>((_,reject) => controller.signal.addEventListener('abort',() => reject(controller.signal.reason),{once:true}))
      const result = await Promise.race([infrastructure.generate({ organizationId:claim.company_id,caseId:claim.case_id,
        jobId:claim.id,fingerprint:claim.fingerprint,generation:claim.generation,requestedBy:claim.requested_by,
        snapshot:claim.snapshot,signal:controller.signal }),aborted])
      if (!controller.signal.aborted) await infrastructure.transaction(db => completeCaseCover(db,claim,result,Date.now()-startedAt))
    } catch (error) {
      // Never log provider messages, prompts or generated code.
      const category = failureCategory(error)
      const final = category==='renderer_unavailable'
      await infrastructure.transaction(db => failCaseCover(db,claim,category,final?claim.attempts:maxAttempts)).catch(() => {
        console.warn('[case-covers] fenced failure could not be recorded')
      })
    } finally {
      clearInterval(heartbeat); clearTimeout(timeout); controllers.delete(controller)
    }
    return true
  }
  function start(intervalMs = 2_000): WorkerTaskHandle | null {
    if (stopped || !infrastructure.enabled()) return null
    let running = false
    const tick = async () => {
      if (stopped || running) return
      running = true
      try {
        await Promise.all(Array.from({length:concurrency},async () => {
          for (let index=0;index<2 && !stopped && await runOnce();index++);
        }))
      } catch { console.warn('[case-covers] worker tick failed') }
      finally { running = false }
    }
    const immediate = setImmediate(() => void tick())
    const timer = setInterval(() => void tick(),bounded(intervalMs,2_000,1_000,60_000))
    timer.unref?.()
    return { stop:() => {
      stopped=true;clearImmediate(immediate);clearInterval(timer)
      for (const controller of controllers) controller.abort(Object.assign(new Error('worker_stopped'),{code:'worker_stopped'}))
    } }
  }
  return { runOnce,start }
}
