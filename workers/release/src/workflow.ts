import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers'
import { canonical, ReleaseError, requireThat, type TargetId } from '../../../shared/release/protocol'
import { activateWorker, hostOperation, installManifest, prepareWorker, settled, successful, verifyTarget } from './adapters'
import { ledgerCall, type ReleaseEnv, type ReleaseRecord } from './types'

const retry = { retries: { limit: 0, delay: '1 second' as const }, timeout: '5 minutes' as const }
const codeOf = (error: unknown) => error instanceof Error && error.message === 'Too many subrequests.' ? 'WORKFLOW_SUBREQUEST_LIMIT' : (error as { code?: string })?.code ?? 'STEP_OUTCOME_UNKNOWN'
const unknown = (code: string) => /UNKNOWN|UNAVAILABLE|TRANSPORT|AUTHENTICATION|REQUEST_BUDGET|SUBREQUEST_LIMIT|STALE_|RECONCILIATION_REQUIRED/.test(code)

export class ReleaseWorkflow extends WorkflowEntrypoint<ReleaseEnv, { releaseId: string; attempt: number }> {
  async run(event: WorkflowEvent<{ releaseId: string; attempt: number }>, step: WorkflowStep) {
    const { releaseId } = event.payload
    const call = <T = ReleaseRecord>(path: string, body: Record<string, unknown> = {}) => ledgerCall<T>(this.env, path, { releaseId, workflowId: event.instanceId, ...body })
    let record = await ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`)
    if (record.workflowId !== event.instanceId) return { status: 'superseded-attempt' }
    if (['superseded', 'accepted', 'recovered', 'failed'].includes(record.status)) return { status: record.status }
    // An envelope persists the classified result even if the provider wraps a
    // thrown exception. Retry only observations, with the SAME stage allowance.
    const durable = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
      const output = await step.do(name, retry, async () => {
        for (let n = 0; ; n++) {
          try { return JSON.stringify({ ok: true, value: await fn() }) }
          catch (error) {
            const code = codeOf(error)
            if (/^(REMOTE_HTTP_(429|502|503|504)|EXECUTOR_QUERY_UNAVAILABLE|PROBE_QUERY_UNAVAILABLE|TRANSPORT_OUTCOME_UNKNOWN|OPERATION_OUTCOME_UNKNOWN)$/.test(code) && n < record.manifest.policy.retryLimit) {
              try { await call('/retry-permit', { stage: record.checkpoint!.plan[record.checkpoint!.index].key, key: name, error: code }) }
              catch { return JSON.stringify({ ok: false, error: code }) }
              await new Promise(resolve => setTimeout(resolve, 500 * 2 ** n + Math.floor(Math.random() * 250))); continue
            }
            return JSON.stringify({ ok: false, error: code })
          }
        }
      })
      const result = JSON.parse(output) as { ok: boolean; value: T; error: string }
      if (!result.ok) throw new ReleaseError(result.error)
      return result.value
    }
    try { record = await durable('initialize', () => call('/initialize')) }
    catch (error) {
      const code = codeOf(error)
      if (record.status === 'blocked' && code === 'RECONCILIATION_REQUIRED') return { releaseId, status: 'blocked', error: record.error ?? code }
      await call('/transition', { generation: record.generation, status: record.generation ? 'blocked' : 'failed', phase: 'reconcile', error: code, effectsSettled: !record.generation })
      return { releaseId, status: record.generation ? 'blocked' : 'failed', error: code }
    }
    const cp = record.checkpoint!, stage = cp.plan[cp.index], manifest = record.manifest
    const stageCall = <T = ReleaseRecord>(path: string, body: Record<string, unknown> = {}) => call<T>(path, { stage: stage.key, ...body })
    const externalFetch: typeof fetch = async (input, init) => {
      await stageCall('/network-permit')
      return fetch(input, init)
    }
    const runtimeEnv = { ...this.env, externalFetch }
    const observe = (key: string, value: unknown) => stageCall('/observe', { key, value })
    const effect = (mutation: boolean) => stageCall('/mark-effect', { mutation })
    const hostPhase = async (target: TargetId, host: string, phase: string) => {
      const key = `${releaseId}:${target}:${phase}`
      const { deadline } = await durable(`deadline-${target}-${host}-${phase}`, () => stageCall<{ deadline: number }>('/deadline', { key: `${host}:${key}` }))
      let operation = await durable(`submit-${target}-${host}-${phase}`, () => hostOperation(runtimeEnv, host, manifest, record.manifestHash, target, phase, phase === 'prepare' ? 0 : record.generation, true, 0, deadline))
      for (let n = 0; !settled(operation) && n < 30; n++) operation = await durable(`observe-${target}-${host}-${phase}-${n}`, async () => {
        requireThat(deadline > Date.now(), 'OPERATION_WAIT_BUDGET_UNKNOWN')
        return hostOperation(runtimeEnv, host, manifest, record.manifestHash, target, phase, phase === 'prepare' ? 0 : record.generation, false, Math.min(45, (deadline - Date.now()) / 1000))
      })
      requireThat(settled(operation), 'OPERATION_OUTCOME_UNKNOWN')
      requireThat(operation.key === key && operation.operationId && operation.releaseId === releaseId && operation.target === target && operation.phase === phase && operation.manifestHash === record.manifestHash && operation.generation === (phase === 'prepare' ? 0 : record.generation), 'OPERATION_IDENTITY_UNKNOWN')
      await observe(`${target}:${host}:${phase}`, operation)
      requireThat(successful(operation), 'HOST_OPERATION_FAILED')
    }
    const allHosts = async (phase: string) => {
      // Wait for every outstanding observation before deciding to recover. A
      // known failure on A cannot authorize new effects while B is unknown.
      const results = await Promise.allSettled((stage.targets ?? []).flatMap(id => manifest.targets[id]!.hosts.map(host => hostPhase(id, host, phase))))
      const errors = results.flatMap(result => result.status === 'rejected' ? [result.reason] : [])
      if (errors.length) throw errors.find(error => unknown(codeOf(error))) ?? errors[0]
    }
    try {
      if (record.resumeMode === 'recover' && cp.direction === 'forward') {
        requireThat(!cp.legacyVerificationOnly, 'LEGACY_VERIFICATION_ONLY')
        await stageCall('/begin-recovery', { error: 'OPERATOR_REQUESTED_RECOVERY' })
        return { releaseId, status: 'continuing-recovery' }
      }
      switch (stage.kind) {
        case 'batch': {
          await step.sleep('bounded-candidate-batch', `${Math.min(45, Math.max(20, manifest.policy.batchSeconds ?? 30))} seconds`)
          record = await ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`)
          if (record.workflowId !== event.instanceId || record.status === 'superseded') return { status: 'superseded' }
          await durable('immutable-manifest', async () => {
            const key = `releases/${releaseId}/manifest.json`, old = await this.env.ARTIFACTS.get(key)
            if (old) requireThat(await old.text() === canonical(manifest), 'IMMUTABLE_MANIFEST_CONFLICT')
            else await this.env.ARTIFACTS.put(key, canonical(manifest), { onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { hash: record.manifestHash } })
            return true
          }); break
        }
        case 'manifest': await durable('install-manifest', () => installManifest(runtimeEnv, stage.host!, manifest, record.manifestHash)); break
        case 'prepare': {
          const id = stage.targets![0], target = manifest.targets[id]!
          if (target.artifact.kind === 'worker') await durable('prepare-worker', async () => {
            await prepareWorker(runtimeEnv, target)
            if (target.recovery) await prepareWorker(runtimeEnv, { ...target, artifact: target.recovery.artifact })
            return true
          })
          else await allHosts('prepare')
          break
        }
        case 'claim': {
          const { deadline } = await durable('resource-deadline', () => stageCall<{ deadline: number }>('/deadline', { key: 'resource-claim' }))
          let claimed = false
          for (let n = 0; n < 120; n++) {
            requireThat(Date.now() < deadline, 'RESOURCE_WAIT_BUDGET_EXCEEDED')
            const result = await durable(`claim-${n}`, async () => {
              try { return { record: await call('/claim'), busy: false } }
              catch (error) { if (codeOf(error) === 'RESOURCE_BUSY') return { record: null, busy: true }; throw error }
            })
            if (result.record) { record = result.record; claimed = true; break }
            await step.sleep(`resource-wait-${n}`, '15 seconds')
          }
          requireThat(claimed, 'RESOURCE_WAIT_BUDGET_EXCEEDED'); break
        }
        case 'host':
          if (cp.direction === 'forward' && ['drain', 'apply', 'migrate'].includes(stage.phase!)) await effect(stage.phase !== 'drain')
          await allHosts(stage.phase!); break
        case 'worker':
          if (cp.direction === 'forward') await effect(true)
          await observe(`${stage.targets![0]}:${stage.recovery ? 'recovery-' : ''}activation`, await durable('activate-worker', () => activateWorker(runtimeEnv, manifest.targets[stage.targets![0]]!, stage.recovery)))
          break
        case 'probe': {
          const id = stage.targets![0]
          const result = await durable('public-verification', () => verifyTarget(runtimeEnv, manifest.targets[id]!, stage.recovery))
          await observe(`${id}:${stage.recovery ? 'recovery-' : ''}verification`, result); break
        }
        case 'finish': {
          // Each probe is a durable completed business checkpoint, not a claim
          // inferred from a provider's stopped/errored status.
          const fresh = await ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`)
          const value = { releaseId, generation: record.generation, observations: fresh.targets, checkpoint: fresh.checkpoint, verifiedAt: new Date().toISOString() }
          await durable('verified-receipt', async () => { await this.env.ARTIFACTS.put(`releases/${releaseId}/${stage.recovery ? 'recovered' : 'verified'}.json`, JSON.stringify(value)); return true })
          const status = stage.recovery ? 'recovered' : 'accepted'
          await call('/transition', { generation: record.generation, status, phase: stage.recovery ? 'recovered' : 'verified', effectsSettled: true, error: stage.recovery ? record.errors.forward : undefined })
          return { releaseId, status, generation: record.generation }
        }
      }
      await stageCall('/advance')
      return { releaseId, status: 'stage-complete', stage: stage.key }
    } catch (error) {
      const code = codeOf(error)
      record = await ledgerCall<ReleaseRecord>(this.env, `/get?id=${encodeURIComponent(releaseId)}`)
      if (record.workflowId !== event.instanceId) return { status: 'superseded-attempt' }
      if (['accepted', 'recovered', 'failed', 'superseded'].includes(record.status)) return { releaseId, status: record.status }
      if (!record.generation) {
        // Preparation operations own their independent durable reservations;
        // uncertainty must remain blocked even before the environment claim.
        const status = unknown(code) ? 'blocked' : 'failed'
        await call('/transition', { generation: 0, status, phase: 'prepare', error: code, effectsSettled: status === 'failed', errors: { forward: code } })
        return { releaseId, status, error: code }
      }
      if (unknown(code) || cp.direction !== 'forward' || cp.legacyVerificationOnly || !record.checkpoint!.changed.length) {
        await call('/transition', { generation: record.generation, status: 'blocked', phase: 'reconcile', error: code, errors: cp.direction === 'forward' ? { forward: code } : { recovery: code } })
        return { releaseId, status: 'blocked', error: code }
      }
      await stageCall('/begin-recovery', { error: code })
      return { releaseId, status: 'continuing-recovery', error: code }
    }
  }
}
