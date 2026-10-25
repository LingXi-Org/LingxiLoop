import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { canonical, databasePlan, orderedTargets, ReleaseError, requireThat, type Manifest, type TargetId } from '../../../shared/release/protocol'
import { activateWorker, hostOperation, installManifest, prepareWorker, settled, successful, verifyTarget } from './adapters'
import { ledgerCall, type ReleaseEnv, type ReleaseRecord } from './types'

const retry = { retries: { limit: 0, delay: '1 second' as const }, timeout: '2 minutes' as const }
export class ReleaseWorkflow extends WorkflowEntrypoint<ReleaseEnv, { releaseId: string; attempt: number }> {
  async run(event: WorkflowEvent<{ releaseId: string; attempt: number }>, step: WorkflowStep) {
    const { releaseId } = event.payload
    let retryLimit = 0
    // Persist JSON envelopes so a provider exception cannot lose an unknown-
    // outcome code, and all durable step outputs have a JSON-only wire shape.
    const durable = async <T>(name: string, configOrFn: typeof retry | (() => Promise<T>), fn?: () => Promise<T>): Promise<T> => {
      const callback = typeof configOrFn === 'function' ? configOrFn : fn!
      const output = await step.do(name, typeof configOrFn === 'function' ? retry : configOrFn, async () => {
        for (let attempt = 0; ; attempt++) {
          try { return JSON.stringify({ ok: true, value: await callback() }) }
          catch (error) {
            const code = error instanceof ReleaseError ? error.code : (error as { code?: string }).code
            const transient = /^(?:REMOTE_HTTP_(?:429|502|503|504)|EXECUTOR_QUERY_UNAVAILABLE|TRANSPORT_OUTCOME_UNKNOWN|OPERATION_OUTCOME_UNKNOWN)$/.test(code ?? '')
            if (transient && attempt < retryLimit) { await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); continue }
            return JSON.stringify({ ok: false, error: code && /^[A-Z][A-Z0-9_]+$/.test(code) ? code : 'STEP_OUTCOME_UNKNOWN' })
          }
        }
      })
      const envelope = JSON.parse(output) as { ok: boolean; value: T; error: string }
      if (!envelope.ok) throw new ReleaseError(envelope.error)
      return envelope.value
    }
    let record = await durable('load', () => ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`))
    if (record.workflowId !== event.instanceId) return { status: 'superseded-attempt' }
    if (['superseded', 'accepted', 'recovered', 'failed'].includes(record.status)) return { status: record.status }
    const manifest = record.manifest; retryLimit = manifest.policy.retryLimit; const targets = orderedTargets(manifest)
    const observations: Record<string, unknown> = {}; const changed: TargetId[] = []
    // A resumed owned release may have effects from an earlier run.
    let applying = record.generation > 0
    const transition = (status: string, phase: string, extra: Record<string, unknown> = {}) => ledgerCall<ReleaseRecord>(this.env, '/transition', { releaseId, workflowId: event.instanceId, status, phase, generation: record.generation, targets: observations, ...extra })
    if (this.env.CONTROLLER_OPS_SHA && manifest.opsSha !== this.env.CONTROLLER_OPS_SHA) {
      await transition(record.generation ? 'blocked' : 'failed', 'ops-version', { error: 'CONTROLLER_VERSION_MISMATCH', effectsSettled: !record.generation })
      return { releaseId, status: record.generation ? 'blocked' : 'failed', error: 'CONTROLLER_VERSION_MISMATCH' }
    }
    const authorize = () => ledgerCall(this.env, '/authorize', { releaseId, workflowId: event.instanceId })
    const hostPhase = async (target: TargetId, phase: string) => {
      const t = manifest.targets[target]!
      for (const host of t.hosts) {
        const operation = await durable(`${target}-${host}-${phase}-submit`, retry, async () => { await authorize(); return hostOperation(this.env, host, manifest, record.manifestHash, target, phase, phase === 'prepare' ? 0 : record.generation) })
        let current = operation
        // Fixed bounded program waiting never invokes a model. Callback events
        // can wake the Workflow sooner; a missed event is reconciled by key.
        for (let n = 0; !settled(current) && n < Math.ceil(manifest.policy.drainSeconds / 5); n++) {
          await step.sleep(`${target}-${host}-${phase}-wait-${n}`, '5 seconds')
          current = await durable(`${target}-${host}-${phase}-observe-${n}`, retry, () => hostOperation(this.env, host, manifest, record.manifestHash, target, phase, phase === 'prepare' ? 0 : record.generation, false))
        }
        requireThat(settled(current), 'OPERATION_OUTCOME_UNKNOWN')
        observations[`${target}:${host}:${phase}`] = current
        requireThat(successful(current), 'HOST_OPERATION_FAILED')
      }
    }
    try {
      await step.sleep('bounded-candidate-batch', `${Math.min(45, Math.max(20, manifest.policy.batchSeconds ?? 30))} seconds`)
      record = await durable('after-batch', () => ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`))
      if (record.status === 'superseded') return { status: 'superseded' }
      await durable('persist-manifest', retry, async () => {
        const key = `releases/${releaseId}/manifest.json`
        const old = await this.env.ARTIFACTS.get(key)
        if (old) requireThat(await old.text() === canonical(manifest), 'IMMUTABLE_MANIFEST_CONFLICT')
        else await this.env.ARTIFACTS.put(key, canonical(manifest), { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { hash: record.manifestHash } })
        return { key }
      })
      await durable('preparing', () => transition(record.generation ? 'active' : 'preparing', 'prepare'))
      for (const host of [...new Set(Object.values(manifest.targets).flatMap(t => t.hosts))]) await durable(`manifest-${host}`, retry, async () => { await installManifest(this.env, host, manifest, record.manifestHash); return true })
      // Every affected host prepares both target and compatible recovery images
      // while the old application is still running.
      for (const target of targets) {
        if (manifest.targets[target]!.artifact.kind === 'worker') await durable(`prepare-${target}`, retry, () => prepareWorker(this.env, manifest.targets[target]!))
        else await hostPhase(target, 'prepare')
      }
      let claimed = false
      for (let n = 0; n < 120; n++) {
        const result = await durable(`claim-${n}`, retry, async () => {
          try { return { record: await ledgerCall<ReleaseRecord>(this.env, '/claim', { releaseId, workflowId: event.instanceId }), busy: false } }
          catch (error) { if ((error as { code?: string }).code === 'RESOURCE_BUSY') return { record: null, busy: true }; throw error }
        })
        if (!result.busy && result.record) { record = result.record; claimed = true; break }
        await step.sleep(`resources-wait-${n}`, '15 seconds')
      }
      requireThat(claimed, 'RESOURCE_WAIT_BUDGET_EXCEEDED')
      await durable('applying', () => transition('active', 'apply'))
      applying = true
      if (record.resumeMode === 'recover') {
        changed.push(...targets)
        throw new ReleaseError('OPERATOR_REQUESTED_RECOVERY')
      }
      const runtime = targets.filter(id => manifest.targets[id]!.adapter === 'main-runtime')
      const maintenance = runtime.some(id => manifest.targets[id]!.hostPlan?.mode !== 'rolling')
      let runtimeDone = false
      for (const target of targets) {
        const t = manifest.targets[target]!
        if (t.adapter === 'main-runtime' && maintenance) {
          if (runtimeDone) continue
          requireThat(runtime.includes('main-runtime-a') && runtime.includes('main-runtime-b'), 'MAINTENANCE_REQUIRES_BOTH_NODES')
          changed.push(...runtime)
          await Promise.all(runtime.map(id => hostPhase(id, 'drain')))
          const database = manifest.targets['main-runtime-a'] && databasePlan(manifest.targets['main-runtime-a'])
          if (database) {
            await hostPhase('main-runtime-a', 'backup')
            await hostPhase('main-runtime-a', 'restore-verify')
            await hostPhase('main-runtime-a', 'migrate')
          }
          for (const id of runtime) { await hostPhase(id, 'apply'); await hostPhase(id, 'verify') }
          for (const id of runtime) await hostPhase(id, 'undrain')
          for (const id of runtime) observations[`${id}:verification`] = await durable(`business-${id}`, retry, () => verifyTarget(this.env, manifest.targets[id]!))
          runtimeDone = true
          continue
        }
        // Add before submitting: a lost response must still be reconciled.
        changed.push(target)
        if (t.artifact.kind === 'worker') observations[target] = await durable(`apply-${target}`, retry, async () => { await authorize(); return activateWorker(this.env, t) })
        else {
          await hostPhase(target, 'drain')
          await hostPhase(target, 'apply')
          await hostPhase(target, 'verify')
          await hostPhase(target, 'undrain')
        }
        observations[`${target}:verification`] = await durable(`business-${target}`, retry, () => verifyTarget(this.env, t))
      }
      await durable('accepted-receipt', retry, async () => {
        await this.env.ARTIFACTS.put(`releases/${releaseId}/verified.json`, JSON.stringify({ releaseId, generation: record.generation, observations, verifiedAt: new Date().toISOString() }))
        return true
      })
      await durable('accept', () => transition('accepted', 'verified'))
      try { await durable('github-result', retry, () => this.report(manifest, 'success')) }
      catch { await ledgerCall(this.env, '/note', { releaseId, workflowId: event.instanceId, cleanup: 'GITHUB_STATUS_WRITE_FAILED' }) }
      return { releaseId, status: 'accepted', generation: record.generation }
    } catch (error) {
      // Claim may have committed even when its response was lost. Refresh
      // ownership before deciding whether a failure is pre-mutation.
      try { record = await ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`) } catch {
        throw new ReleaseError('OWNERSHIP_OUTCOME_UNKNOWN')
      }
      if (record.workflowId !== event.instanceId) return { status: 'superseded-attempt' }
      if (['accepted', 'recovered', 'failed', 'superseded'].includes(record.status)) return { releaseId, status: record.status }
      applying ||= record.generation > 0
      const code = error instanceof ReleaseError ? error.code : /^[A-Z][A-Z0-9_]+$/.test((error as Error).message ?? '') ? (error as Error).message : 'WORKFLOW_STEP_FAILED'
      if (!applying) {
        await durable('prepare-failed', () => transition('failed', 'prepare', { error: code, effectsSettled: true, errors: { forward: code } }))
        return { releaseId, status: 'failed', error: code }
      }
      // Unknown results retain the environment lock. Never infer isolation from
      // a TTL, network error, or the Workflow process having stopped.
      if (/UNKNOWN|UNAVAILABLE|TRANSPORT/.test(code) || (record.phase !== 'apply' && changed.length === 0)) {
        await durable('unknown-blocked', () => transition('blocked', 'reconcile', { error: code, errors: { forward: code } }))
        return { releaseId, status: 'blocked', error: code }
      }
      try {
        await durable('recovering', () => transition('recovering', 'recover', { errors: { forward: code } }))
        const recoveringHosts = changed.filter(id => manifest.targets[id]!.artifact.kind === 'image')
        await Promise.all(recoveringHosts.map(id => hostPhase(id, 'recovery-drain')))
        for (const target of changed.reverse()) {
          const t = manifest.targets[target]!
          if (t.artifact.kind === 'worker') await durable(`recover-${target}`, retry, async () => { await authorize(); return activateWorker(this.env, t, true) })
          else { await hostPhase(target, 'recover') }
          // Public verification follows restored admission below.

        }
        for (const target of recoveringHosts) await hostPhase(target, 'recovery-undrain')
        for (const target of changed) await durable(`verify-recovery-${target}`, retry, () => verifyTarget(this.env, manifest.targets[target]!, true))
        await durable('recovered', () => transition('recovered', 'recovered', { effectsSettled: true, error: code }))
        return { releaseId, status: 'recovered', error: code }
      } catch {
        await durable('recovery-blocked', () => transition('blocked', 'recover', { error: code, errors: { forward: code, recovery: 'RECOVERY_NOT_VERIFIED' } }))
        return { releaseId, status: 'blocked', error: code }
      }
    }
  }
  private async report(manifest: Manifest, state: 'success' | 'failure') {
    if (!this.env.GITHUB_TOKEN || !this.env.GITHUB_REPOSITORY) return { skipped: 'GITHUB_REPORTING_NOT_CONFIGURED' }
    const response = await fetch(`https://api.github.com/repos/${this.env.GITHUB_REPOSITORY}/statuses/${manifest.appSha}`, { method: 'POST', headers: {
      authorization: `Bearer ${this.env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'LingxiLoop-release', 'content-type': 'application/json',
    }, body: JSON.stringify({ state, context: `production/${this.env.ENVIRONMENT}`, description: `Release ${manifest.releaseId}: ${state === 'success' ? 'accepted' : 'failed'}` }) })
    requireThat(response.ok, 'GITHUB_STATUS_WRITE_FAILED')
    return { state }
  }
}
