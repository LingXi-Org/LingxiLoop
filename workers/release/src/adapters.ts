import { canRecover, canonical, ReleaseError, requireThat, type Manifest, type Target, type TargetId } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

type Operation = { releaseId?: string; target?: string; phase?: string; manifestHash?: string; generation?: number; operationId?: string; key?: string; status: string; result?: unknown; error?: { code?: string } | string }
const success = new Set(['complete', 'succeeded', 'success'])
export function settled(operation: Operation): boolean { return success.has(operation.status) || operation.status === 'failed' }
export function successful(operation: Operation): boolean { return success.has(operation.status) }
function queryFailure(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code
  if (code && /STAGE_REQUEST|STALE_WORKFLOW|RELEASE_ALREADY|RECONCILIATION_REQUIRED/.test(code)) return new ReleaseError(code)
  return new ReleaseError(error instanceof Error && error.message === 'Too many subrequests.' ? 'WORKFLOW_SUBREQUEST_LIMIT' : fallback, 503)
}
async function jsonFetch<T>(env: ReleaseEnv, url: string, init?: RequestInit, timeoutMs = 20_000): Promise<T> {
  let response: Response
  try { response = await (env.externalFetch ?? fetch)(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }) }
  catch (error) { throw queryFailure(error, 'TRANSPORT_OUTCOME_UNKNOWN') }
  if (!response.ok) throw new ReleaseError(response.status === 401 || response.status === 403 ? 'AUTHENTICATION_FAILED' : `REMOTE_HTTP_${response.status}`, response.status >= 500 ? 503 : 409)
  try { return await response.json() as T } catch (error) { throw queryFailure(error, 'TRANSPORT_OUTCOME_UNKNOWN') }
}
export function executor(env: ReleaseEnv, host: string) {
  const endpoint = (JSON.parse(env.EXECUTORS_JSON) as Record<string, string>)[host]
  requireThat(endpoint && new URL(endpoint).protocol === 'https:' && new URL(endpoint).pathname === '/' && !new URL(endpoint).username && !new URL(endpoint).password, 'EXECUTOR_NOT_CONFIGURED')
  const headers: Record<string, string> = { authorization: `Bearer ${env.EXECUTOR_TOKEN}`, 'content-type': 'application/json' }
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID
    headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET
  }
  return { endpoint, headers }
}
export async function installManifest(env: ReleaseEnv, host: string, manifest: Manifest, manifestHash: string) {
  const { endpoint, headers } = executor(env, host)
  // A measured 569 KB immutable manifest took 28.489s to register on B.
  // Keep ordinary queries at 20s; allow this body transfer up to 60s inside
  // the existing five-minute Workflow step, retry count and operator deadline.
  return jsonFetch(env, `${endpoint.replace(/\/$/, '')}/manifests`, { method: 'POST', headers, body: JSON.stringify({ manifest, manifestHash }) }, 60_000)
}
export async function hostOperation(env: ReleaseEnv, host: string, manifest: Manifest, manifestHash: string, target: TargetId, phase: string, generation: number, submit = true, waitSeconds = 0, deadline = Infinity): Promise<Operation> {
  requireThat(Number.isFinite(waitSeconds) && waitSeconds >= 0 && waitSeconds <= 45, 'INVALID_OPERATION_WAIT')
  const { endpoint, headers } = executor(env, host)
  const base = endpoint.replace(/\/$/, ''); const key = `${manifest.releaseId}:${target}:${phase}`
  const query = `${base}/operations?key=${encodeURIComponent(key)}${waitSeconds > 0 ? `&waitSeconds=${Number(waitSeconds.toFixed(3))}` : ''}`
  let observed: Response
  try { observed = await (env.externalFetch ?? fetch)(query, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(Math.ceil(waitSeconds * 1000) + 20_000) }) }
  catch (error) { throw queryFailure(error, 'EXECUTOR_QUERY_UNAVAILABLE') }
  if (observed.ok) { try { return await observed.json() as Operation } catch (error) { throw queryFailure(error, 'EXECUTOR_QUERY_UNAVAILABLE') } }
  requireThat(observed.status === 404, observed.status === 401 || observed.status === 403 ? 'AUTHENTICATION_FAILED' : 'EXECUTOR_QUERY_UNAVAILABLE')
  if (!submit) return { key, status: 'absent' }
  requireThat(Date.now() < deadline, 'OPERATION_WAIT_BUDGET_UNKNOWN')
  // POST can be retried only with this exact key and exact parameter hash.
  // The executor persists intent before acknowledging or performing effects.
  try {
    return await jsonFetch<Operation>(env, `${base}/operations`, { method: 'POST', headers, body: JSON.stringify({ releaseId: manifest.releaseId, target, phase, generation, manifestHash, parameters: {} }) })
  } catch (error) {
    if (error instanceof ReleaseError && (['AUTHENTICATION_FAILED', 'WORKFLOW_SUBREQUEST_LIMIT', 'STAGE_REQUEST_BUDGET_EXHAUSTED', 'STALE_WORKFLOW_ATTEMPT', 'RECONCILIATION_REQUIRED'].includes(error.code))) throw error
    try { return await jsonFetch<Operation>(env, `${base}/operations?key=${encodeURIComponent(key)}`, { headers }) }
    catch (queryError) {
      if (queryError instanceof ReleaseError && ['WORKFLOW_SUBREQUEST_LIMIT', 'STAGE_REQUEST_BUDGET_EXHAUSTED', 'STALE_WORKFLOW_ATTEMPT', 'RECONCILIATION_REQUIRED'].includes(queryError.code)) throw queryError
      throw new ReleaseError('OPERATION_OUTCOME_UNKNOWN', 503)
    }
  }
}
async function cloudflare<T>(env: ReleaseEnv, workerName: string, suffix: string, init?: RequestInit): Promise<T> {
  requireThat((JSON.parse(env.WORKER_NAMES_JSON) as string[]).includes(workerName), 'WORKER_NOT_ALLOWED')
  const result = await jsonFetch<{ success: boolean; result: T }>(env, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${workerName}${suffix}`, {
    ...init, headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' },
  })
  requireThat(result.success, 'CLOUDFLARE_API_FAILED')
  return result.result
}
export async function workerVersion(env: ReleaseEnv, target: Target): Promise<string | null> {
  const response = await cloudflare<{ deployments: { versions: { version_id: string; percentage: number }[] }[] }>(env, target.artifact.workerName!, '/deployments')
  const versions = response.deployments[0]?.versions
  return versions?.length === 1 && versions[0].percentage === 100 ? versions[0].version_id : null
}
export async function prepareWorker(env: ReleaseEnv, target: Target) {
  await cloudflare(env, target.artifact.workerName!, `/versions/${target.artifact.versionId}`)
  return { versionId: target.artifact.versionId }
}
export async function activateWorker(env: ReleaseEnv, target: Target, recovery = false) {
  const artifact = recovery ? target.recovery?.artifact : target.artifact
  requireThat(artifact?.versionId && artifact.workerName === target.artifact.workerName, 'RECOVERY_ARTIFACT_REQUIRED')
  if (recovery) requireThat(target.recovery && canRecover(target.contract, target.recovery.contract), 'INCOMPATIBLE_RECOVERY')
  if (await workerVersion(env, target) === artifact.versionId) return { versionId: artifact.versionId, reconciled: true }
  try {
    await cloudflare(env, artifact.workerName!, '/deployments', { method: 'POST', body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: artifact.versionId, percentage: 100 }] }) })
  } catch (error) {
    if (error instanceof ReleaseError && ['AUTHENTICATION_FAILED', 'WORKFLOW_SUBREQUEST_LIMIT', 'STAGE_REQUEST_BUDGET_EXHAUSTED', 'STALE_WORKFLOW_ATTEMPT', 'RECONCILIATION_REQUIRED'].includes(error.code)) throw error
    requireThat(await workerVersion(env, target) === artifact.versionId, 'WORKER_DEPLOYMENT_OUTCOME_UNKNOWN')
  }
  requireThat(await workerVersion(env, target) === artifact.versionId, 'WORKER_VERSION_MISMATCH')
  return { versionId: artifact.versionId }
}
// Probes are pre-installed named trusted checks. A candidate cannot request
// arbitrary URLs or headers or turn a deployment into a privileged HTTP proxy.
export async function verifyTarget(env: ReleaseEnv, target: Target, recovery = false) {
  const probes = JSON.parse(env.PROBES_JSON) as Record<string, { url: string; status: number; json?: Record<string, unknown>; header?: Record<string, string> }>
  const records: Record<string, unknown> = {}
  for (const id of [...target.verification.readiness, target.verification.businessProbe]) {
    const probe = probes[id]
    requireThat(probe && new URL(probe.url).protocol === 'https:', 'PROBE_NOT_CONFIGURED')
    let response: Response
    try { response = await (env.externalFetch ?? fetch)(probe.url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: probe.header }) }
    catch (error) { throw queryFailure(error, 'PROBE_QUERY_UNAVAILABLE') }
    requireThat(response.status === probe.status, 'BUSINESS_PROBE_FAILED')
    if (probe.json) {
      let body: Record<string, unknown>
      try { body = await response.json() as Record<string, unknown> }
      catch (error) { throw queryFailure(error, 'PROBE_QUERY_UNAVAILABLE') }
      requireThat(body && typeof body === 'object' && !Array.isArray(body), 'BUSINESS_PROBE_CONTENT_MISMATCH')
      for (const [key, value] of Object.entries(probe.json)) requireThat(canonical(body[key]) === canonical(value), 'BUSINESS_PROBE_CONTENT_MISMATCH')
    }
    records[id] = { status: response.status }
  }
  if (target.artifact.kind === 'worker') {
    const expected = recovery ? target.recovery?.artifact.versionId : target.artifact.versionId
    requireThat(expected && await workerVersion(env, target) === expected, 'WORKER_VERSION_MISMATCH')
  }
  return records
}
