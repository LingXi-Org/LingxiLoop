import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, isAbsolute } from 'node:path'

export const MAX_ARCHIVE_BYTES = 90 * 1024 * 1024
const fail = (code, uncertain = false) => Object.assign(new Error(code), { code, uncertain, localBackupPreserved: true })
const keyFor = releaseId => `releases/${releaseId}/backups/main-runtime-a/database.dump`
function matching(receipt, op, dumpHash, size) {
  if (!receipt || typeof receipt !== 'object') return false
  const { bodyHash, ...core } = receipt
  if (`sha256:${createHash('sha256').update(JSON.stringify(core)).digest('hex')}` !== bodyHash) return false
  return receipt?.version === 1 && receipt.complete === true && receipt.releaseId === op.releaseId && receipt.target === 'main-runtime-a' &&
    receipt.generation === op.generation && receipt.manifestHash === op.manifestHash && receipt.dumpHash === dumpHash && receipt.size === size &&
    receipt.key === keyFor(op.releaseId) && /^sha256:[a-f0-9]{64}$/.test(receipt.bodyHash ?? '')
}
/** Paths, endpoint and credential files come only from trusted local policy. */
export async function uploadArchive(policy, op, { dumpPath, dumpHash, fetcher = fetch, reconcileOnly = false }) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(op.releaseId ?? '') || op.target !== 'main-runtime-a' || !Number.isSafeInteger(op.generation) || op.generation < 1 || !/^sha256:[a-f0-9]{64}$/.test(op.manifestHash ?? '') || !/^sha256:[a-f0-9]{64}$/.test(dumpHash ?? '')) throw fail('INVALID_ARCHIVE_OPERATION')
  const archive = policy.archive
  if (!archive || !isAbsolute(policy.stateDirectory ?? '') || !isAbsolute(archive.tokenFile ?? '') || !isAbsolute(dumpPath ?? '') || resolve(dumpPath) !== resolve(policy.stateDirectory, op.releaseId, 'database', 'backup.dump')) throw fail('ARCHIVE_POLICY_REQUIRED')
  let base
  try { base = new URL(archive.baseUrl) } catch { throw fail('ARCHIVE_ENDPOINT_INVALID') }
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw fail('ARCHIVE_ENDPOINT_INVALID')
  const timeoutMs = archive.timeoutMs ?? 60000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000) throw fail('ARCHIVE_TIMEOUT_INVALID')
  const info = await stat(dumpPath)
  if (!info.isFile() || info.size < 1 || info.size > MAX_ARCHIVE_BYTES) throw fail('ARCHIVE_TOO_LARGE')
  const checksum = createHash('sha256')
  for await (const chunk of createReadStream(dumpPath)) checksum.update(chunk)
  if (`sha256:${checksum.digest('hex')}` !== dumpHash) throw fail('LOCAL_BACKUP_HASH_MISMATCH')
  const token = (await readFile(archive.tokenFile, 'utf8')).trim()
  if (!token || /[\r\n]/.test(token)) throw fail('ARCHIVE_TOKEN_INVALID')
  const url = new URL(`/v1/releases/${op.releaseId}/backups/main-runtime-a`, base)
  const headers = { authorization: `Bearer ${token}`, 'x-lingxi-generation': String(op.generation), 'x-lingxi-manifest-hash': op.manifestHash }
  const metadata = async () => {
    let response
    try { response = await fetcher(url, { headers, redirect: 'error', signal: AbortSignal.timeout(timeoutMs) }) }
    catch { throw fail('ARCHIVE_METADATA_UNAVAILABLE', true) }
    if (response.status === 404) return null
    if (!response.ok) throw fail('ARCHIVE_METADATA_REJECTED', response.status >= 500)
    let receipt
    try { receipt = await response.json() } catch { throw fail('ARCHIVE_RECEIPT_INVALID', true) }
    if (!matching(receipt, op, dumpHash, info.size)) throw fail('ARCHIVE_IDENTITY_CONFLICT')
    return receipt
  }
  const existing = await metadata()
  if (existing) return { ...existing, reused: true }
  if (reconcileOnly) throw fail('ARCHIVE_NOT_CONFIRMED', true)
  // A lost POST response has an uncertain outcome. A fresh metadata read is
  // the only reconciliation; this helper never blindly uploads a second time.
  const body = createReadStream(dumpPath)
  try {
    const response = await fetcher(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream', 'content-length': String(info.size), 'x-lingxi-dump-sha256': dumpHash }, body, duplex: 'half', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) })
    if (!response.ok && response.status < 500) throw fail('ARCHIVE_UPLOAD_REJECTED')
    if (response.ok) {
      const receipt = await response.json()
      if (matching(receipt, op, dumpHash, info.size)) return { ...receipt, reused: false }
    }
  } catch (error) {
    if (error?.code === 'ARCHIVE_UPLOAD_REJECTED') throw error
  } finally { body.destroy() }
  const observed = await metadata()
  if (observed) return { ...observed, reused: true, reconciled: true }
  throw fail('ARCHIVE_UPLOAD_UNCONFIRMED', true)
}

/** Read-only reconciliation used before migration or when resuming backup observation. */
export function observeArchive(policy, op, options) {
  return uploadArchive(policy, op, { ...options, reconcileOnly: true })
}
