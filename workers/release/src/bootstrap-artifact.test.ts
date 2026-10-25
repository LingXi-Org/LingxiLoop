import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { BOOTSTRAP_KEY, BOOTSTRAP_PATH, BOOTSTRAP_SHA256, BOOTSTRAP_PATHS, MIHOMO_BOOTSTRAP_PATH, MIHOMO_BOOTSTRAP_KEY, MIHOMO_BOOTSTRAP_SHA256, MAX_BOOTSTRAP_BYTES, handleBootstrapArtifact } from './bootstrap-artifact'
import type { ReleaseEnv } from './types'
const bindings = env as unknown as ReleaseEnv
const checksum = Uint8Array.from(BOOTSTRAP_SHA256.match(/../g)!, value => parseInt(value, 16)).buffer
function object(overrides: Record<string, unknown> = {}) {
  return { key: BOOTSTRAP_KEY, size: 7, httpEtag: '"fixed-etag"', customMetadata: { sha256: BOOTSTRAP_SHA256 }, checksums: { sha256: checksum }, ...overrides } as unknown as R2Object
}
function request(method = 'GET', body?: BodyInit, size = 7, path = BOOTSTRAP_PATH) {
  return new Request(`https://release.test${path}`, { method, ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/octet-stream', 'content-length': String(size) } }) })
}
function mock(bucket: object) { return { ARTIFACTS: bucket as R2Bucket } }
describe('fixed private cloudflared bootstrap artifact', () => {
  it('streams only the one metadata/checksum-qualified object and HEAD never returns its body', async () => {
    const calls: string[] = []
    // Contract fixture models a previously verified R2 object. These bytes are
    // not claimed to be the real cloudflared binary or a matching SHA preimage.
    const bucket = { get: async (key: string) => { calls.push(key); return { ...object(), body: new Response('fixture').body } }, head: async (key: string) => { calls.push(key); return object() } }
    const download = await handleBootstrapArtifact(request(), mock(bucket))
    expect(await download.text()).toBe('fixture')
    expect(download.headers.get('x-lingxi-bootstrap-sha256')).toBe(BOOTSTRAP_SHA256)
    expect(download.headers.get('content-length')).toBe('7')
    expect(download.headers.get('cache-control')).toContain('no-store')
    const head = await handleBootstrapArtifact(request('HEAD'), mock(bucket))
    expect(await head.text()).toBe(''); expect(head.headers.get('content-length')).toBe('7')
    expect(calls).toEqual([BOOTSTRAP_KEY, BOOTSTRAP_KEY])
  })
  it('fails closed for missing, wrong metadata/checksum, empty and oversized objects', async () => {
    await expect(handleBootstrapArtifact(request('HEAD'), mock({ head: async () => null }))).rejects.toThrow('BOOTSTRAP_ARTIFACT_NOT_FOUND')
    for (const value of [object({ customMetadata: { sha256: '0'.repeat(64) } }), object({ checksums: {} }), object({ checksums: { sha256: new Uint8Array(32).buffer } }), object({ size: 0 }), object({ size: MAX_BOOTSTRAP_BYTES + 1 })]) {
      await expect(handleBootstrapArtifact(request('HEAD'), mock({ head: async () => value }))).rejects.toThrow('BOOTSTRAP_ARTIFACT_CONFLICT')
    }
  })
  it('permits no arbitrary key/version/proxy or unapproved HTTP method', async () => {
    const bucket = mock({ head: async () => { throw Error('must not read') } })
    for (const path of [BOOTSTRAP_PATH.replace('2026.10.3', '2026.10.4'), BOOTSTRAP_PATH.replace('linux-amd64', 'linux-arm64'), `${BOOTSTRAP_PATH}?key=private`, '/v1/bootstrap/other']) await expect(handleBootstrapArtifact(request('HEAD', undefined, 7, path), bucket)).rejects.toThrow('BOOTSTRAP_NOT_FOUND')
    await expect(handleBootstrapArtifact(request('POST'), bucket)).rejects.toThrow('METHOD_NOT_ALLOWED')
  })
  it('calls R2 with the fixed checksum, bounded stream and immutable condition; exact duplicate never overwrites', async () => {
    let stored = false, writes = 0
    const bucket = { head: async () => stored ? object() : null, put: async (key: string, body: ReadableStream, options: R2PutOptions) => {
      writes++; expect(key).toBe(BOOTSTRAP_KEY); expect(options.sha256).toBe(BOOTSTRAP_SHA256)
      expect(options.onlyIf).toEqual({ etagDoesNotMatch: '*' }); expect(options.customMetadata).toEqual({ sha256: BOOTSTRAP_SHA256 })
      expect(await new Response(body).text()).toBe('fixture'); stored = true; return object()
    } }
    expect((await handleBootstrapArtifact(request('PUT', 'fixture'), mock(bucket))).status).toBe(201)
    expect((await handleBootstrapArtifact(request('PUT', 'fixture'), mock(bucket))).status).toBe(200)
    expect(writes).toBe(1)
    await expect(handleBootstrapArtifact(request('PUT', 'different', 9), mock(bucket))).rejects.toThrow('BOOTSTRAP_ARTIFACT_CONFLICT')
    expect(writes).toBe(1)
  })
  it('rejects malformed length/type and an oversized upload before touching R2', async () => {
    const bucket = mock({ head: async () => { throw Error('must not read') } })
    await expect(handleBootstrapArtifact(request('PUT', 'a', MAX_BOOTSTRAP_BYTES + 1), bucket)).rejects.toThrow('BOOTSTRAP_TOO_LARGE')
    await expect(handleBootstrapArtifact(request('PUT', 'a', 0), bucket)).rejects.toThrow('BOOTSTRAP_LENGTH_REQUIRED')
    const input = request('PUT', 'fixture'); input.headers.set('content-type', 'text/plain')
    await expect(handleBootstrapArtifact(input, bucket)).rejects.toThrow('BOOTSTRAP_BINARY_REQUIRED')
  })
  it('uses actual R2 checksum validation to reject wrong bytes without creating the fixed artifact', async () => {
    await bindings.ARTIFACTS.delete(BOOTSTRAP_KEY)
    await expect(handleBootstrapArtifact(request('PUT', 'fixture'), bindings)).rejects.toThrow('BOOTSTRAP_BODY_MISMATCH')
    expect(await bindings.ARTIFACTS.head(BOOTSTRAP_KEY)).toBeNull()
  })
  it('rejects a prematurely ended actual R2 stream and leaves no successful object', async () => {
    await bindings.ARTIFACTS.delete(BOOTSTRAP_KEY)
    await expect(handleBootstrapArtifact(request('PUT', 'short', 7), bindings)).rejects.toThrow('BOOTSTRAP_BODY_MISMATCH')
    expect(await bindings.ARTIFACTS.head(BOOTSTRAP_KEY)).toBeNull()
  })
  it('a lost write response is reconciled with HEAD and cannot trigger a duplicate overwrite', async () => {
    let stored = false, writes = 0
    const bucket = { head: async () => stored ? object() : null, put: async (_key: string, body: ReadableStream) => { writes++; await new Response(body).arrayBuffer(); stored = true; throw Error('response lost after accepted write') } }
    await expect(handleBootstrapArtifact(request('PUT', 'fixture'), mock(bucket))).rejects.toThrow('BOOTSTRAP_WRITE_UNCONFIRMED')
    expect((await handleBootstrapArtifact(request('HEAD'), mock(bucket))).status).toBe(200)
    expect((await handleBootstrapArtifact(request('PUT', 'fixture'), mock(bucket))).status).toBe(200)
    expect(writes).toBe(1)
  })
})

declare global {
  interface ImportMetaEnv { readonly VITE_BOOTSTRAP_ARTIFACT_FIXTURE_URL?: string; readonly VITE_BOOTSTRAP_MIHOMO_FIXTURE_URL?: string }
  interface ImportMeta { readonly env: ImportMetaEnv }
}
const officialFixtureUrl = import.meta.env.VITE_BOOTSTRAP_ARTIFACT_FIXTURE_URL
it.skipIf(!officialFixtureUrl)('uploads and downloads the actual fixed official binary through isolated R2 and reuses its exact duplicate', async () => {
  const local = new URL(officialFixtureUrl!)
  expect(local.hostname).toBe('127.0.0.1'); expect(local.pathname).toBe('/cloudflared')
  const official = await fetch(local)
  expect(official.status).toBe(200); expect(official.headers.get('content-length')).toBe('40227721')
  const uploaded = await handleBootstrapArtifact(request('PUT', official.body!, 40227721), bindings)
  expect(uploaded.status).toBe(201)
  expect(await uploaded.json()).toMatchObject({ complete: true, reused: false, sha256: BOOTSTRAP_SHA256, size: 40227721 })
  const stored = await bindings.ARTIFACTS.head(BOOTSTRAP_KEY)
  const actualChecksum = Array.from(new Uint8Array(stored!.checksums.sha256!), value => value.toString(16).padStart(2, '0')).join('')
  expect(actualChecksum).toBe(BOOTSTRAP_SHA256)
  const downloaded = await handleBootstrapArtifact(request(), bindings)
  const digest = new (crypto as Crypto & { DigestStream: typeof DigestStream }).DigestStream('SHA-256')
  await downloaded.body!.pipeTo(digest)
  expect(Array.from(new Uint8Array(await digest.digest), value => value.toString(16).padStart(2, '0')).join('')).toBe(BOOTSTRAP_SHA256)
  const second = await fetch(local), duplicateRequest = request('PUT', second.body!, 40227721)
  const duplicate = await handleBootstrapArtifact(duplicateRequest, bindings)
  await duplicateRequest.body?.cancel()
  expect(duplicate.status).toBe(200); expect(await duplicate.json()).toMatchObject({ reused: true, sha256: BOOTSTRAP_SHA256, size: 40227721 })
  const head = await handleBootstrapArtifact(request('HEAD'), bindings)
  expect(head.headers.get('content-length')).toBe('40227721'); expect(await head.text()).toBe('')
}, 30000)


it('exports exactly two allowed paths and rejects Mihomo version, platform, key or checksum substitution', async () => {
  expect(BOOTSTRAP_PATHS).toEqual([BOOTSTRAP_PATH, MIHOMO_BOOTSTRAP_PATH])
  const noRead = mock({ head: async () => { throw Error('must not read') } })
  for (const path of [MIHOMO_BOOTSTRAP_PATH.replace('v1.19.33','v1.19.34'), MIHOMO_BOOTSTRAP_PATH.replace('amd64-compatible','arm64'), `${MIHOMO_BOOTSTRAP_PATH}?key=${BOOTSTRAP_KEY}`]) await expect(handleBootstrapArtifact(request('HEAD', undefined, 7, path), noRead)).rejects.toThrow('BOOTSTRAP_NOT_FOUND')
  for (const value of [object(), object({ key: MIHOMO_BOOTSTRAP_KEY })]) await expect(handleBootstrapArtifact(request('HEAD', undefined, 7, MIHOMO_BOOTSTRAP_PATH), mock({ head: async () => value }))).rejects.toThrow('BOOTSTRAP_ARTIFACT_CONFLICT')
})
const officialMihomoUrl = import.meta.env.VITE_BOOTSTRAP_MIHOMO_FIXTURE_URL
it.skipIf(!officialMihomoUrl)('uploads and downloads the actual fixed Mihomo gzip through isolated R2 without decompression or overwrite', async () => {
  const local = new URL(officialMihomoUrl!)
  expect(local.hostname).toBe('127.0.0.1'); expect(local.pathname).toBe('/mihomo')
  const official = await fetch(local)
  expect(official.status).toBe(200); expect(official.headers.get('content-length')).toBe('22893972')
  const uploaded = await handleBootstrapArtifact(request('PUT', official.body!, 22893972, MIHOMO_BOOTSTRAP_PATH), bindings)
  expect(uploaded.status).toBe(201)
  expect(await uploaded.json()).toMatchObject({ key: MIHOMO_BOOTSTRAP_KEY, complete: true, reused: false, sha256: MIHOMO_BOOTSTRAP_SHA256, size: 22893972 })
  const stored = await bindings.ARTIFACTS.head(MIHOMO_BOOTSTRAP_KEY)
  const actual = Array.from(new Uint8Array(stored!.checksums.sha256!), value => value.toString(16).padStart(2, '0')).join('')
  expect(actual).toBe(MIHOMO_BOOTSTRAP_SHA256)
  const downloaded = await handleBootstrapArtifact(request('GET', undefined, 7, MIHOMO_BOOTSTRAP_PATH), bindings)
  expect(downloaded.headers.get('content-encoding')).toBe('identity')
  const digest = new (crypto as Crypto & { DigestStream: typeof DigestStream }).DigestStream('SHA-256')
  await downloaded.body!.pipeTo(digest)
  expect(Array.from(new Uint8Array(await digest.digest), value => value.toString(16).padStart(2, '0')).join('')).toBe(MIHOMO_BOOTSTRAP_SHA256)
  const second = await fetch(local), duplicateRequest = request('PUT', second.body!, 22893972, MIHOMO_BOOTSTRAP_PATH)
  const duplicate = await handleBootstrapArtifact(duplicateRequest, bindings)
  await duplicateRequest.body?.cancel()
  expect(duplicate.status).toBe(200); expect(await duplicate.json()).toMatchObject({ reused: true, sha256: MIHOMO_BOOTSTRAP_SHA256, size: 22893972 })
  const head = await handleBootstrapArtifact(request('HEAD', undefined, 7, MIHOMO_BOOTSTRAP_PATH), bindings)
  expect(head.headers.get('content-length')).toBe('22893972'); expect(await head.text()).toBe('')
  expect(await bindings.ARTIFACTS.head(BOOTSTRAP_KEY)).toBeNull()
}, 30000)
