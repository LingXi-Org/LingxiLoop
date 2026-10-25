import { ReleaseError, requireThat } from '../../../shared/release/protocol'
import type { ReleaseEnv } from './types'

export const BOOTSTRAP_PATH = '/v1/bootstrap/cloudflared/2026.10.3/linux-amd64'
export const BOOTSTRAP_KEY = 'bootstrap/cloudflared/2026.10.3/linux-amd64'
export const BOOTSTRAP_SHA256 = '053b80b0a23031a038fdbf3c073f59f82b8f1f152aa67971d7383ffafc0dbab0'
export const MIHOMO_BOOTSTRAP_PATH = '/v1/bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz'
export const MIHOMO_BOOTSTRAP_KEY = 'bootstrap/mihomo/v1.19.33/linux-amd64-compatible.gz'
export const MIHOMO_BOOTSTRAP_SHA256 = '386508bfb1c72c43b6a0eda73708ecdce82546581b0ebcb16366c53757c622b6'
export const BOOTSTRAP_PATHS: readonly string[] = Object.freeze([BOOTSTRAP_PATH, MIHOMO_BOOTSTRAP_PATH])
export const MAX_BOOTSTRAP_BYTES = 64 * 1024 * 1024
type Artifact = { key: string; sha256: string; filename: string }
const catalog = new Map<string, Artifact>([
  [BOOTSTRAP_PATH, { key: BOOTSTRAP_KEY, sha256: BOOTSTRAP_SHA256, filename: 'cloudflared-linux-amd64' }],
  [MIHOMO_BOOTSTRAP_PATH, { key: MIHOMO_BOOTSTRAP_KEY, sha256: MIHOMO_BOOTSTRAP_SHA256, filename: 'mihomo-linux-amd64-compatible-v1.19.33.gz' }],
])
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
function qualified(object: R2Object, artifact: Artifact, size?: number) {
  requireThat(object.key === artifact.key && object.customMetadata?.sha256 === artifact.sha256 && object.checksums.sha256 && hex(object.checksums.sha256) === artifact.sha256 &&
    Number.isSafeInteger(object.size) && object.size > 0 && object.size <= MAX_BOOTSTRAP_BYTES && (size === undefined || object.size === size), 'BOOTSTRAP_ARTIFACT_CONFLICT')
  return object
}
function headers(object: R2Object, artifact: Artifact) {
  return new Headers({ 'content-type': 'application/octet-stream', 'content-length': String(object.size), 'content-encoding': 'identity',
    'cache-control': 'private, no-store, no-transform', 'x-content-type-options': 'nosniff', 'x-lingxi-bootstrap-sha256': artifact.sha256,
    'content-disposition': `attachment; filename="${artifact.filename}"`, etag: object.httpEtag })
}
/** The API caller restricts PUT to ADMIN and GET/HEAD to ADMIN or EXECUTOR. */
export async function handleBootstrapArtifact(request: Request, env: Pick<ReleaseEnv, 'ARTIFACTS'>): Promise<Response> {
  const url = new URL(request.url)
  const artifact = catalog.get(url.pathname)
  requireThat(artifact && !url.search && !url.hash, 'BOOTSTRAP_NOT_FOUND', 404)
  requireThat(['GET', 'HEAD', 'PUT'].includes(request.method), 'METHOD_NOT_ALLOWED', 405)
  if (request.method === 'PUT') {
    const length = request.headers.get('content-length') ?? ''
    requireThat(/^[1-9]\d*$/.test(length), 'BOOTSTRAP_LENGTH_REQUIRED', 400)
    const size = Number(length)
    requireThat(Number.isSafeInteger(size) && size <= MAX_BOOTSTRAP_BYTES, 'BOOTSTRAP_TOO_LARGE', 413)
    requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/octet-stream' && request.body, 'BOOTSTRAP_BINARY_REQUIRED', 415)
    let object = await env.ARTIFACTS.head(artifact.key)
    const reused = !!object
    if (!object) {
      const fixed = new FixedLengthStream(size), abort = new AbortController()
      let transferError: unknown
      const transfer = request.body.pipeTo(fixed.writable, { signal: abort.signal }).catch(error => { transferError = error })
      try {
        object = await env.ARTIFACTS.put(artifact.key, fixed.readable, { sha256: artifact.sha256, onlyIf: { etagDoesNotMatch: '*' },
          customMetadata: { sha256: artifact.sha256 }, httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'private, no-store, no-transform' } })
        if (!object) abort.abort()
        await transfer
        requireThat(!object || !transferError, 'BOOTSTRAP_BODY_MISMATCH', 400)
      } catch (error) {
        abort.abort(); await transfer
        if (error instanceof ReleaseError) throw error
        const mismatch = /checksum|digest|length|size/i.test(String(error))
        throw new ReleaseError(mismatch ? 'BOOTSTRAP_BODY_MISMATCH' : 'BOOTSTRAP_WRITE_UNCONFIRMED', mismatch ? 400 : 502)
      }
      object ??= await env.ARTIFACTS.head(artifact.key)
      requireThat(object, 'BOOTSTRAP_WRITE_UNCONFIRMED', 502)
    }
    qualified(object, artifact, size)
    return Response.json({ key: artifact.key, sha256: artifact.sha256, size: object.size, etag: object.httpEtag, complete: true, reused }, { status: reused ? 200 : 201, headers: { 'cache-control': 'no-store' } })
  }
  if (request.method === 'HEAD') {
    const object = await env.ARTIFACTS.head(artifact.key)
    requireThat(object, 'BOOTSTRAP_ARTIFACT_NOT_FOUND', 404)
    return new Response(null, { headers: headers(qualified(object, artifact), artifact) })
  }
  const object = await env.ARTIFACTS.get(artifact.key)
  requireThat(object, 'BOOTSTRAP_ARTIFACT_NOT_FOUND', 404)
  try { qualified(object, artifact) } catch (error) { await object.body.cancel(); throw error }
  // Return the R2 stream directly. The host must verify the same fixed SHA-256
  // before installation; no complete executable is buffered by this handler.
  return new Response(object.body, { headers: headers(object, artifact) })
}
