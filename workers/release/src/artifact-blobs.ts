import { MAX_ARTIFACT_PART_BYTES, ReleaseError, requireThat } from '../../../shared/release/protocol'
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
/** Caller's authorization: submit/admin PUT, submit/exec/admin HEAD, exec/admin GET. */
export async function handleArtifactBlob(request: Request, env: Pick<ReleaseEnv, 'ARTIFACTS'>): Promise<Response> {
  const url = new URL(request.url), match = /^\/v1\/artifact-blobs\/([a-f0-9]{64})$/.exec(url.pathname)
  requireThat(match && !url.search && !url.hash, 'ARTIFACT_NOT_FOUND', 404)
  requireThat(['PUT', 'GET', 'HEAD'].includes(request.method), 'METHOD_NOT_ALLOWED', 405)
  const sha = match[1], key = artifactBlobKey(sha)
  if (request.method === 'PUT') {
    const length = request.headers.get('content-length') ?? ''
    requireThat(/^[1-9]\d*$/.test(length), 'ARTIFACT_LENGTH_REQUIRED', 400)
    const size = Number(length)
    requireThat(Number.isSafeInteger(size) && size <= MAX_ARTIFACT_PART_BYTES, 'ARTIFACT_TOO_LARGE', 413)
    requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/octet-stream' && request.body, 'ARTIFACT_BINARY_REQUIRED', 415)
    let object = await env.ARTIFACTS.head(key)
    const reused = !!object
    if (!object) {
      const fixed = new FixedLengthStream(size), abort = new AbortController()
      let transferError: unknown
      const transfer = request.body.pipeTo(fixed.writable, { signal: abort.signal }).catch(error => { transferError = error })
      try {
        object = await env.ARTIFACTS.put(key, fixed.readable, { sha256: sha, onlyIf: { etagDoesNotMatch: '*' }, customMetadata: { sha256: sha },
          httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'private, no-store, no-transform' } })
        if (!object) abort.abort()
        await transfer
        requireThat(!object || !transferError, 'ARTIFACT_BODY_MISMATCH', 400)
      } catch (error) {
        abort.abort(); await transfer
        if (error instanceof ReleaseError) throw error
        const mismatch = /checksum|digest|length|size/i.test(String(error))
        throw new ReleaseError(mismatch ? 'ARTIFACT_BODY_MISMATCH' : 'ARTIFACT_WRITE_UNCONFIRMED', mismatch ? 400 : 502)
      }
      object ??= await env.ARTIFACTS.head(key)
      requireThat(object, 'ARTIFACT_WRITE_UNCONFIRMED', 502)
    }
    qualifyArtifactBlob(object, sha, size)
    return Response.json({ sha256: `sha256:${sha}`, size: object.size, complete: true, reused }, { status: reused ? 200 : 201, headers: { 'cache-control': 'no-store' } })
  }
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
