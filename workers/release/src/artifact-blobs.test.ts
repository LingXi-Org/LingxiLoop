import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import api from './index'
import { handleArtifactBlob } from './artifact-blobs'
import type { ReleaseEnv } from './types'
const bindings = env as unknown as ReleaseEnv
const bytes = new TextEncoder().encode('private-image-part')
const hex = async (data: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data).buffer)), b => b.toString(16).padStart(2, '0')).join('')
const request = (sha: string, method: string, token: string, body?: Uint8Array) => new Request(`https://release.test/v1/artifact-blobs/${sha}`, {
  method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', ...(body ? { 'content-length': String(body.length) } : {}) }, body: body ? new Uint8Array(body).buffer : undefined,
})
describe('private immutable image parts', () => {
  it('uses actual R2 checksum, immutable reuse and role isolation', async () => {
    const sha = await hex(bytes), key = `artifact-blobs/sha256/${sha}`
    await bindings.ARTIFACTS.delete(key)
    expect((await api.fetch(request(sha, 'PUT', bindings.RELEASE_API_TOKEN, bytes), bindings)).status).toBe(201)
    expect((await api.fetch(request(sha, 'PUT', bindings.RELEASE_API_TOKEN, bytes), bindings)).status).toBe(200)
    expect((await api.fetch(request(sha, 'HEAD', bindings.RELEASE_API_TOKEN), bindings)).status).toBe(200)
    expect((await api.fetch(request(sha, 'GET', bindings.RELEASE_API_TOKEN), bindings)).status).toBe(403)
    const download = await api.fetch(request(sha, 'GET', bindings.EXECUTOR_TOKEN), bindings)
    expect(download.status).toBe(200); expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes)
    expect((await api.fetch(request(sha, 'PUT', bindings.EXECUTOR_TOKEN, bytes), bindings)).status).toBe(403)
    expect((await api.fetch(request(sha, 'HEAD', ''), bindings)).status).toBe(401)
    const adminDownload = await api.fetch(request(sha, 'GET', bindings.RELEASE_ADMIN_TOKEN), bindings)
    expect(adminDownload.status).toBe(200); await adminDownload.arrayBuffer()
  })
  it('rejects wrong bytes and bounded/type/path violations before exposing a successful object', async () => {
    const sha = 'f'.repeat(64), key = `artifact-blobs/sha256/${sha}`
    await bindings.ARTIFACTS.delete(key)
    await expect(handleArtifactBlob(request(sha, 'PUT', '', bytes), bindings)).rejects.toThrow('ARTIFACT_BODY_MISMATCH')
    expect(await bindings.ARTIFACTS.head(key)).toBeNull()
    const oversized = request(sha, 'PUT', '', bytes); oversized.headers.set('content-length', String(8 * 1024 * 1024 + 1))
    await expect(handleArtifactBlob(oversized, bindings)).rejects.toThrow('ARTIFACT_TOO_LARGE')
    const short = request(sha, 'PUT', '', bytes); short.headers.set('content-length', String(bytes.length + 1))
    await expect(handleArtifactBlob(short, bindings)).rejects.toThrow('ARTIFACT_BODY_MISMATCH')
    for (const path of ['/v1/artifact-blobs/other', `/v1/artifact-blobs/${sha}?key=backups`, `/v1/artifact-blobs/${sha}/private`]) {
      await expect(handleArtifactBlob(new Request(`https://release.test${path}`), bindings)).rejects.toThrow('ARTIFACT_NOT_FOUND')
    }
  })
  it('reconciles a lost PUT reply with HEAD without overwriting the object', async () => {
    const sha = await hex(bytes); let writes = 0, object: R2Object | null = null
    const mock = { ARTIFACTS: { head: async () => object, put: async (_key: string, stream: ReadableStream) => {
      writes++; await new Response(stream).arrayBuffer()
      object = { key: `artifact-blobs/sha256/${sha}`, size: bytes.length, httpEtag: '"fixed"', customMetadata: { sha256: sha }, checksums: { sha256: Uint8Array.from(sha.match(/../g)!, x => parseInt(x, 16)).buffer } } as unknown as R2Object
      throw Error('reply lost')
    } } as unknown as R2Bucket }
    await expect(handleArtifactBlob(request(sha, 'PUT', '', bytes), mock)).rejects.toThrow('ARTIFACT_WRITE_UNCONFIRMED')
    expect((await handleArtifactBlob(request(sha, 'HEAD', ''), mock)).status).toBe(200)
    expect((await handleArtifactBlob(request(sha, 'PUT', '', bytes), mock)).status).toBe(200); expect(writes).toBe(1)
  })
})
