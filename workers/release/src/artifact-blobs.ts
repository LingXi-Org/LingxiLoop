import { MAX_ARTIFACT_PART_BYTES, requireThat } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

export const ARTIFACT_BLOB_PREFIX = '/v1/artifact-blobs/'
export const artifactBlobKey = (sha: string) => `artifact-blobs/sha256/${sha}`
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('')
export function qualifyArtifactBlob(object: R2Object, sha: string, size?: number) {
  requireThat(object.key === artifactBlobKey(sha) && object.customMetadata?.sha256 === sha && object.checksums.sha256 &&
    hex(object.checksums.sha256) === sha && Number.isSafeInteger(object.size) && object.size > 0 && object.size <= MAX_ARTIFACT_PART_BYTES &&
    (size === undefined || size === object.size), 'ARTIFACT_CONFLICT')
  return object
}
function headers(object: R2Object, sha: string) {
  return { 'content-type': 'application/octet-stream', 'content-length': String(object.size), 'content-encoding': 'identity',
    'cache-control': 'private, no-store, no-transform', 'x-content-type-options': 'nosniff', 'x-lingxi-artifact-sha256': `sha256:${sha}`, etag: object.httpEtag }
}
/** Read-only historical evidence. New image publication uses the registry. */
export async function handleArtifactBlob(request: Request, env: Pick<ReleaseEnv, 'ARTIFACTS'>): Promise<Response> {
  const url = new URL(request.url), match = /^\/v1\/artifact-blobs\/([a-f0-9]{64})$/.exec(url.pathname)
  requireThat(match && !url.search && !url.hash, 'ARTIFACT_NOT_FOUND', 404)
  requireThat(['GET', 'HEAD'].includes(request.method), 'METHOD_NOT_ALLOWED', 405)
  const sha = match[1], key = artifactBlobKey(sha)
  if (request.method === 'HEAD') {
    const object = await env.ARTIFACTS.head(key)
    requireThat(object, 'ARTIFACT_NOT_FOUND', 404)
    return new Response(null, { headers: headers(qualifyArtifactBlob(object, sha), sha) })
  }
  const object = await env.ARTIFACTS.get(key)
  requireThat(object, 'ARTIFACT_NOT_FOUND', 404)
  try { qualifyArtifactBlob(object, sha) } catch (error) { await object.body.cancel(); throw error }
  return new Response(object.body, { headers: headers(object, sha) })
}
