import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { archiveKey, handleArchive, MAX_ARCHIVE_BYTES } from './archive'
import type { ReleaseEnv, ReleaseRecord } from './types'
const bindings = env as unknown as ReleaseEnv
const manifestHash = `sha256:${'b'.repeat(64)}`
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('')
async function checksum(value: string) { return `sha256:${hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))}` }
function record(id: string): ReleaseRecord {
  return { releaseId: id, generation: 1, manifestHash, status: 'active', manifest: { targets: { 'main-runtime-a': { adapter: 'main-runtime', hostPlan: { mode: 'maintenance', database: { strategy: 'maintenance' } } } } } } as unknown as ReleaseRecord
}
function request(value: ReleaseRecord, method = 'GET', body?: string, hash?: string, size?: number) {
  return new Request(`https://release.test/v1/releases/${value.releaseId}/backups/main-runtime-a`, { method, headers: {
    'x-lingxi-generation': String(value.generation), 'x-lingxi-manifest-hash': value.manifestHash,
    ...(body === undefined ? {} : { 'content-type': 'application/octet-stream', 'content-length': String(size ?? new TextEncoder().encode(body).length), 'x-lingxi-dump-sha256': hash ?? '' }),
  }, body })
}
describe('private backup archive with the real R2 binding', () => {
  it('streams a checksum-verified immutable dump and exposes only metadata receipts', async () => {
    const r = record('archive-success'), dump = 'private PostgreSQL archive bytes', hash = await checksum(dump)
    const uploaded = await handleArchive(request(r, 'POST', dump, hash), bindings, r)
    expect(uploaded.status).toBe(201)
    expect(await uploaded.json()).toMatchObject({ key: archiveKey(r.releaseId), size: dump.length, dumpHash: hash, generation: 1, complete: true })
    const object = await bindings.ARTIFACTS.get(archiveKey(r.releaseId))
    expect(await object!.text()).toBe(dump)
    expect(object!.checksums.sha256 && `sha256:${hex(object!.checksums.sha256)}`).toBe(hash)
    const metadata = await handleArchive(request(r), bindings, r)
    expect(await metadata.text()).not.toContain(dump)
    const head = await handleArchive(request(r, 'HEAD'), bindings, r)
    expect(await head.text()).toBe(''); expect(head.headers.get('x-lingxi-archive-sha256')).toBe(hash)
    expect((await handleArchive(request(r, 'POST', dump, hash), bindings, r)).status).toBe(201)
    await expect(handleArchive(request(r, 'POST', 'different dump', await checksum('different dump')), bindings, r)).rejects.toThrow('ARCHIVE_IDENTITY_CONFLICT')
    expect(await (await bindings.ARTIFACTS.get(archiveKey(r.releaseId)))!.text()).toBe(dump)
  })
  it('uses the real R2 conditional write to prevent concurrent differing dump replacement', async () => {
    const r = record('archive-concurrent'), a = 'dump alpha', b = 'dump bravo'
    const results = await Promise.allSettled([handleArchive(request(r, 'POST', a, await checksum(a)), bindings, r), handleArchive(request(r, 'POST', b, await checksum(b)), bindings, r)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    const actual = await (await bindings.ARTIFACTS.get(archiveKey(r.releaseId)))!.text()
    expect([a, b]).toContain(actual)
    const receipt = await (await handleArchive(request(r), bindings, r)).json() as { dumpHash: string }
    expect(receipt.dumpHash).toBe(await checksum(actual))
  })
  it('rejects wrong checksum and length without leaving a successful archive', async () => {
    const r = record('archive-wrong-body')
    await expect(handleArchive(request(r, 'POST', 'wrong', await checksum('expected')), bindings, r)).rejects.toThrow('ARCHIVE_BODY_MISMATCH')
    expect(await bindings.ARTIFACTS.head(archiveKey(r.releaseId))).toBeNull()
    await expect(handleArchive(request(r, 'POST', 'short', await checksum('short'), 6), bindings, r)).rejects.toThrow('ARCHIVE_BODY_MISMATCH')
    expect(await bindings.ARTIFACTS.head(archiveKey(r.releaseId))).toBeNull()
  })
  it('rejects oversize, stale generation, wrong manifest and absent maintenance plan', async () => {
    const r = record('archive-fences'), hash = await checksum('tiny')
    await expect(handleArchive(request(r, 'POST', 'tiny', hash, MAX_ARCHIVE_BYTES + 1), bindings, r)).rejects.toThrow('ARCHIVE_TOO_LARGE')
    const stale = request(r); stale.headers.set('x-lingxi-generation', '0')
    await expect(handleArchive(stale, bindings, r)).rejects.toThrow('STALE_GENERATION')
    const wrong = request(r); wrong.headers.set('x-lingxi-manifest-hash', `sha256:${'c'.repeat(64)}`)
    await expect(handleArchive(wrong, bindings, r)).rejects.toThrow('MANIFEST_MISMATCH')
    await expect(handleArchive(request(r), bindings, { ...r, status: 'accepted' })).rejects.toThrow('ARCHIVE_RELEASE_NOT_ACTIVE')
    delete r.manifest.targets['main-runtime-a']!.hostPlan!.database
    await expect(handleArchive(request(r), bindings, r)).rejects.toThrow('DATABASE_PLAN_REQUIRED')
    expect(await bindings.ARTIFACTS.head(archiveKey(r.releaseId))).toBeNull()
  })
  it('reconciles an existing dump after a missing response and rejects a conflicting JSON receipt', async () => {
    const r = record('archive-receipt'), dump = 'private dump', hash = await checksum(dump)
    await handleArchive(request(r, 'POST', dump, hash), bindings, r)
    await bindings.ARTIFACTS.delete(`${archiveKey(r.releaseId)}.receipt.json`)
    const recovered = await handleArchive(request(r), bindings, r)
    expect(await recovered.json()).toMatchObject({ complete: true, dumpHash: hash })
    expect((await handleArchive(request(r, 'POST', dump, hash), bindings, r)).status).toBe(201)
    await bindings.ARTIFACTS.put(`${archiveKey(r.releaseId)}.receipt.json`, '{"forged":true}', { sha256: (await checksum('{"forged":true}')).slice(7), customMetadata: { bodyHash: hash } })
    await expect(handleArchive(request(r), bindings, r)).rejects.toThrow('ARCHIVE_RECEIPT_CONFLICT')
  })
})
