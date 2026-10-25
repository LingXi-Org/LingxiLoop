import { databasePlan, ReleaseError, requireThat } from '../../../shared/release/protocol'
import type { ReleaseEnv, ReleaseRecord } from './types'

export const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024
const target = 'main-runtime-a'
const digestPattern = /^sha256:[a-f0-9]{64}$/
export type ArchiveReceipt = {
  version: 1; releaseId: string; target: typeof target; generation: number
  manifestHash: string; dumpHash: string; size: number; key: string; complete: true
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
async function bodyHash(value: string) { return `sha256:${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))}` }
export function archiveKey(releaseId: string) { return `releases/${releaseId}/backups/${target}/database.dump` }
function fromObject(object: R2Object, record: ReleaseRecord): ArchiveReceipt {
  const metadata = object.customMetadata ?? {}
  requireThat(metadata.manifestHash === record.manifestHash && metadata.generation === String(record.generation) &&
    digestPattern.test(metadata.dumpHash ?? '') && object.checksums.sha256 && `sha256:${hex(object.checksums.sha256)}` === metadata.dumpHash &&
    object.size > 0 && object.size <= MAX_ARCHIVE_BYTES && metadata.size === String(object.size), 'ARCHIVE_IDENTITY_CONFLICT')
  return { version: 1, releaseId: record.releaseId, target, generation: record.generation, manifestHash: record.manifestHash,
    dumpHash: metadata.dumpHash, size: object.size, key: archiveKey(record.releaseId), complete: true }
}
async function receiptObject(env: Pick<ReleaseEnv, 'ARTIFACTS'>, receipt: ArchiveReceipt, write: boolean) {
  const text = JSON.stringify(receipt), checksum = await bodyHash(text), key = `${receipt.key}.receipt.json`
  const existing = await env.ARTIFACTS.head(key)
  if (existing) {
    requireThat(existing.customMetadata?.bodyHash === checksum && existing.checksums.sha256 && `sha256:${hex(existing.checksums.sha256)}` === checksum && existing.size === new TextEncoder().encode(text).byteLength, 'ARCHIVE_RECEIPT_CONFLICT')
  } else if (write) {
    const stored = await env.ARTIFACTS.put(key, text, { sha256: checksum.slice(7), onlyIf: { etagDoesNotMatch: '*' },
      customMetadata: { bodyHash: checksum }, httpMetadata: { contentType: 'application/json', cacheControl: 'no-store' } })
    // Another request may have won the conditional write. Compare its actual
    // content checksum instead of overwriting an immutable receipt.
    if (!stored) await receiptObject(env, receipt, false)
  }
  return { ...receipt, bodyHash: checksum }
}

/** Caller authenticates EXECUTOR_TOKEN before looking up this private record. */
export async function handleArchive(request: Request, env: Pick<ReleaseEnv, 'ARTIFACTS'>, record: ReleaseRecord): Promise<Response> {
  const url = new URL(request.url)
  requireThat(url.pathname === `/v1/releases/${record.releaseId}/backups/${target}` && !url.search && !url.hash &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(record.releaseId), 'ARCHIVE_NOT_FOUND', 404)
  requireThat(['GET', 'HEAD', 'POST'].includes(request.method), 'METHOD_NOT_ALLOWED', 405)
  requireThat(['active', 'recovering'].includes(record.status), 'ARCHIVE_RELEASE_NOT_ACTIVE')
  requireThat(Number.isSafeInteger(record.generation) && record.generation > 0 && request.headers.get('x-lingxi-generation') === String(record.generation), 'STALE_GENERATION')
  requireThat(digestPattern.test(record.manifestHash) && request.headers.get('x-lingxi-manifest-hash') === record.manifestHash, 'MANIFEST_MISMATCH')
  const descriptor = record.manifest.targets[target]
  requireThat(descriptor?.adapter === 'main-runtime' && descriptor.hostPlan?.mode === 'maintenance' && databasePlan(descriptor), 'DATABASE_PLAN_REQUIRED')
  const key = archiveKey(record.releaseId)
  let object = await env.ARTIFACTS.head(key)
  if (request.method === 'POST') {
    const dumpHash = request.headers.get('x-lingxi-dump-sha256') ?? ''
    const rawSize = request.headers.get('content-length') ?? ''
    requireThat(digestPattern.test(dumpHash) && /^(?:0|[1-9]\d*)$/.test(rawSize), 'ARCHIVE_HEADERS_REQUIRED', 400)
    const size = Number(rawSize)
    requireThat(Number.isSafeInteger(size) && size > 0 && size <= MAX_ARCHIVE_BYTES, 'ARCHIVE_TOO_LARGE', 413)
    requireThat(request.headers.get('content-type')?.split(';')[0].trim() === 'application/octet-stream' && request.body, 'ARCHIVE_BINARY_REQUIRED', 415)
    if (!object) {
      // FixedLengthStream retains a known R2 upload length while enforcing the
      // declared size. No dump is buffered in the Worker heap.
      const fixed = new FixedLengthStream(size), abort = new AbortController()
      let transferError: unknown
      const transfer = request.body.pipeTo(fixed.writable, { signal: abort.signal }).catch(error => { transferError = error })
      try {
        object = await env.ARTIFACTS.put(key, fixed.readable, { sha256: dumpHash.slice(7), onlyIf: { etagDoesNotMatch: '*' },
          customMetadata: { manifestHash: record.manifestHash, generation: String(record.generation), dumpHash, size: String(size) },
          httpMetadata: { contentType: 'application/octet-stream', cacheControl: 'no-store' } })
        if (!object) abort.abort()
        await transfer
        requireThat(!object || !transferError, 'ARCHIVE_BODY_MISMATCH', 400)
      } catch (error) {
        abort.abort(); await transfer
        if (error instanceof ReleaseError) throw error
        throw new ReleaseError(/checksum|digest|length|size/i.test(String(error)) ? 'ARCHIVE_BODY_MISMATCH' : 'ARCHIVE_WRITE_FAILED', /checksum|digest|length|size/i.test(String(error)) ? 400 : 502)
      }
      object ??= await env.ARTIFACTS.head(key)
      requireThat(object, 'ARCHIVE_WRITE_UNCONFIRMED', 502)
    }
    const receipt = fromObject(object, record)
    requireThat(receipt.dumpHash === dumpHash && receipt.size === size, 'ARCHIVE_IDENTITY_CONFLICT')
    return Response.json(await receiptObject(env, receipt, true), { status: 201, headers: { 'cache-control': 'no-store' } })
  }
  requireThat(object, 'ARCHIVE_NOT_FOUND', 404)
  const receipt = await receiptObject(env, fromObject(object, record), false)
  if (request.method === 'HEAD') return new Response(null, { headers: { 'cache-control': 'no-store', 'x-lingxi-archive-sha256': receipt.dumpHash,
    'x-lingxi-archive-size': String(receipt.size), 'x-lingxi-archive-receipt-hash': receipt.bodyHash } })
  return Response.json(receipt, { headers: { 'cache-control': 'no-store' } })
}
