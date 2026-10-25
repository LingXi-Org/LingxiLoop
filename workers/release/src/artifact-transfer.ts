import { requireThat, ReleaseError, type ArchivedImage, type Manifest, type TargetId } from '../../../shared/release/protocol'
import { artifactBlobKey, qualifyArtifactBlob } from './artifact-blobs'
import { executor } from './adapters'
import type { ReleaseEnv } from './types'

type Status = { imageReady: boolean; archiveSha256: string; configDigest: string; receivedParts: number[]; missingParts: number[]; loading?: string }
export async function hostArtifactStatus(env: ReleaseEnv, host: string, manifest: Manifest, manifestHash: string, target: TargetId, image: ArchivedImage): Promise<Status> {
  const { endpoint, headers } = executor(env, host)
  let response: Response
  try {
    response = await fetch(`${endpoint.replace(/\/$/, '')}/artifact-status`, { method: 'POST', headers, redirect: 'manual', signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({ releaseId: manifest.releaseId, target, manifestHash, configDigest: image.configDigest }) })
  } catch { throw new ReleaseError('EXECUTOR_QUERY_UNAVAILABLE', 503) }
  requireThat(response.ok, response.status === 401 || response.status === 403 ? 'AUTHENTICATION_FAILED' : 'EXECUTOR_QUERY_UNAVAILABLE')
  const status = await response.json() as Status
  requireThat(status.archiveSha256 === image.archive.sha256 && status.configDigest === image.configDigest && typeof status.imageReady === 'boolean' &&
    [status.receivedParts, status.missingParts].every(values => Array.isArray(values) && values.every(index => Number.isSafeInteger(index) && index >= 0 && index < image.archive.parts.length)), 'ARTIFACT_STATUS_MISMATCH')
  if (!status.imageReady) {
    const parts = [...status.receivedParts, ...status.missingParts]
    requireThat(parts.length === image.archive.parts.length && new Set(parts).size === parts.length, 'ARTIFACT_STATUS_MISMATCH')
  }
  return status
}
/** Each part is a separate durable Workflow step; no multi-GiB step or public URL. */
export async function relayArtifactPart(env: ReleaseEnv, host: string, manifest: Manifest, manifestHash: string, target: TargetId, image: ArchivedImage, index: number) {
  requireThat(Number.isSafeInteger(index) && index >= 0 && index < image.archive.parts.length, 'INVALID_ARTIFACT_PART', 400)
  const before = await hostArtifactStatus(env, host, manifest, manifestHash, target, image)
  if (before.imageReady || before.receivedParts.includes(index)) return { index, reused: true }
  const part = image.archive.parts[index], sha = part.sha256.slice(7)
  const object = await env.ARTIFACTS.get(artifactBlobKey(sha))
  requireThat(object, 'ARTIFACT_NOT_FOUND', 404)
  try { qualifyArtifactBlob(object, sha, part.size) } catch (error) { await object.body.cancel(); throw error }
  // A single bounded part fits within Worker memory; verify before relaying.
  const bytes = await object.arrayBuffer()
  const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
  requireThat(bytes.byteLength === part.size && actual === sha, 'ARTIFACT_BODY_MISMATCH')
  const { endpoint, headers } = executor(env, host)
  let response: Response | undefined
  try {
    response = await fetch(`${endpoint.replace(/\/$/, '')}/artifact-parts`, { method: 'PUT', redirect: 'manual', signal: AbortSignal.timeout(60_000),
      headers: { ...headers, 'content-type': 'application/octet-stream', 'content-length': String(part.size),
        'x-lingxi-release-id': manifest.releaseId, 'x-lingxi-target': target, 'x-lingxi-manifest-hash': manifestHash,
        'x-lingxi-config-digest': image.configDigest, 'x-lingxi-part-index': String(index) }, body: bytes })
  } catch { /* Unknown upload outcome is read back before any possible retry. */ }
  await response?.body?.cancel()
  if (response?.status === 401 || response?.status === 403) throw new ReleaseError('AUTHENTICATION_FAILED')
  if (response && !response.ok && response.status < 500 && response.status !== 429) throw new ReleaseError('ARTIFACT_TRANSFER_REJECTED')
  const after = await hostArtifactStatus(env, host, manifest, manifestHash, target, image)
  requireThat(after.imageReady || after.receivedParts.includes(index), 'TRANSPORT_OUTCOME_UNKNOWN', 503)
  return { index, reused: false, reconciled: !response?.ok }
}
