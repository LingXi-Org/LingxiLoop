import { canRecover, canonical, ReleaseError, requireThat, type Manifest, type Target, type TargetId } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

type Operation = { operationId?: string; key?: string; status: string; result?: unknown; error?: { code?: string } | string }
const success = new Set(['complete', 'succeeded', 'success'])
export function settled(operation: Operation): boolean { return success.has(operation.status) || operation.status === 'failed' }
export function successful(operation: Operation): boolean { return success.has(operation.status) }
async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(20_000) }) }
  catch { throw new ReleaseError('TRANSPORT_OUTCOME_UNKNOWN', 503) }
  if (!response.ok) throw new ReleaseError(response.status === 401 || response.status === 403 ? 'AUTHENTICATION_FAILED' : `REMOTE_HTTP_${response.status}`, response.status >= 500 ? 503 : 409)
  return response.json() as Promise<T>
}
function executor(env: ReleaseEnv, host: string) {
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
  return jsonFetch(`${endpoint.replace(/\/$/, '')}/manifests`, { method: 'POST', headers, body: JSON.stringify({ manifest, manifestHash }) })
}
export async function hostOperation(env: ReleaseEnv, host: string, manifest: Manifest, manifestHash: string, target: TargetId, phase: string, generation: number, submit = true): Promise<Operation> {
  const { endpoint, headers } = executor(env, host)
  const base = endpoint.replace(/\/$/, ''); const key = `${manifest.releaseId}:${target}:${phase}`
  let observed: Response
  try { observed = await fetch(`${base}/operations?key=${encodeURIComponent(key)}`, { headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) }) }
  catch { throw new ReleaseError('EXECUTOR_QUERY_UNAVAILABLE', 503) }
  if (observed.ok) return observed.json() as Promise<Operation>
  requireThat(observed.status === 404, observed.status === 401 || observed.status === 403 ? 'AUTHENTICATION_FAILED' : 'EXECUTOR_QUERY_UNAVAILABLE')
  if (!submit) return { key, status: 'absent' }
  // POST can be retried only with this exact key and exact parameter hash.
  // The executor persists intent before acknowledging or performing effects.
  try {
    return await jsonFetch<Operation>(`${base}/operations`, { method: 'POST', headers, body: JSON.stringify({ releaseId: manifest.releaseId, target, phase, generation, manifestHash, parameters: {} }) })
  } catch (error) {
    if (error instanceof ReleaseError && error.code === 'AUTHENTICATION_FAILED') throw error
    try { return await jsonFetch<Operation>(`${base}/operations?key=${encodeURIComponent(key)}`, { headers }) }
    catch { throw new ReleaseError('OPERATION_OUTCOME_UNKNOWN', 503) }
  }
}
async function cloudflare<T>(env: ReleaseEnv, workerName: string, suffix: string, init?: RequestInit): Promise<T> {
  requireThat((JSON.parse(env.WORKER_NAMES_JSON) as string[]).includes(workerName), 'WORKER_NOT_ALLOWED')
  const result = await jsonFetch<{ success: boolean; result: T }>(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${workerName}${suffix}`, {
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
  } catch {
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
    const response = await fetch(probe.url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: probe.header })
    requireThat(response.status === probe.status, 'BUSINESS_PROBE_FAILED')
    if (probe.json) {
      const body = await response.json() as Record<string, unknown>
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
