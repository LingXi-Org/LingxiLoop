import { env, fetchMock } from 'cloudflare:test'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { archivedImages, validateImageArchive, type ArchivedImage, type Manifest, type Target } from '../../../shared/release/protocol'
import { relayArtifactPart } from './artifact-transfer'
import type { ReleaseEnv } from './types'
const bindings = env as unknown as ReleaseEnv
const configDigest = `sha256:${'a'.repeat(64)}`
const manifest = { releaseId: 'release-transfer' } as Manifest
const manifestHash = `sha256:${'b'.repeat(64)}`
const source = new TextEncoder().encode('private-container-archive-part')
const digest = async () => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', source)), b => b.toString(16).padStart(2, '0')).join('')
async function image(): Promise<ArchivedImage> {
  const sha = await digest()
  return { configDigest, archive: { version: 1, format: 'docker-save+gzip', sha256: `sha256:${sha}`, size: source.length, uncompressedSize: 10240,
    tag: `localhost/lingxi-release-cache:sha256-${configDigest.slice(7)}`, parts: [{ sha256: `sha256:${sha}`, size: source.length }] } }
}
const settings = () => ({ ...bindings, EXECUTORS_JSON: JSON.stringify({ a: 'https://executor.test' }), CF_ACCESS_CLIENT_ID: 'existing-access-id', CF_ACCESS_CLIENT_SECRET: 'existing-access-secret' })
function status(value: ArchivedImage, received = false, ready = false) {
  return { imageReady: ready, archiveSha256: value.archive.sha256, configDigest, receivedParts: received ? [0] : [], missingParts: received ? [] : [0] }
}
describe('R2 image manifest and controlled relay', () => {
  beforeEach(() => { fetchMock.activate(); fetchMock.disableNetConnect() })
  afterEach(() => { fetchMock.assertNoPendingInterceptors(); fetchMock.deactivate() })
  it('rejects unsafe archive identities, byte budgets and conflicting source/recovery descriptors', async () => {
    const value = await image()
    expect(validateImageArchive(value.archive, configDigest)).toBe(value.archive)
    for (const patch of [{ tag: 'external/image:latest' }, { size: value.archive.size + 1 }, { uncompressedSize: 16 * 1024 ** 3 + 1 }, { parts: [{ sha256: value.archive.sha256, size: 8 * 1024 ** 2 + 1 }] }]) {
      expect(() => validateImageArchive({ ...value.archive, ...patch }, configDigest)).toThrow('INVALID_IMAGE_ARCHIVE')
    }
    const target = { hostPlan: { images: { app: value }, recovery: { images: { app: value } } } } as unknown as Target
    expect(archivedImages(target)).toEqual([value])
    target.hostPlan!.source = { images: { app: { ...value, archive: { ...value.archive, uncompressedSize: 20480 } } } }
    expect(() => archivedImages(target)).toThrow('CONFLICTING_IMAGE_ARCHIVE')
  })
  it('reuses a qualified whole image without touching R2 or submitting any upload', async () => {
    const value = await image()
    fetchMock.get('https://executor.test').intercept({ path: '/artifact-status', method: 'POST' }).reply(200, status(value, false, true))
    const noBucket = { ...settings(), ARTIFACTS: { get: async () => { throw Error('must not read R2') } } as unknown as R2Bucket }
    expect(await relayArtifactPart(noBucket, 'a', manifest, manifestHash, 'main-runtime-a', value, 0)).toEqual({ index: 0, reused: true })
  })
  it('relays actual private R2 bytes with existing Access credentials and reconciles lost response before retry', async () => {
    const value = await image(), sha = await digest()
    await bindings.ARTIFACTS.put(`artifact-blobs/sha256/${sha}`, source, { sha256: sha, customMetadata: { sha256: sha } })
    const host = fetchMock.get('https://executor.test')
    host.intercept({ path: '/artifact-status', method: 'POST' }).reply(200, status(value))
    host.intercept({ path: '/artifact-parts', method: 'PUT', headers: { authorization: `Bearer ${bindings.EXECUTOR_TOKEN}`, 'CF-Access-Client-Id': 'existing-access-id',
      'CF-Access-Client-Secret': 'existing-access-secret', 'x-lingxi-config-digest': configDigest, 'x-lingxi-part-index': '0' } }).reply(502, 'upstream reply unavailable')
    host.intercept({ path: '/artifact-status', method: 'POST' }).reply(200, status(value, true))
    expect(await relayArtifactPart(settings(), 'a', manifest, manifestHash, 'main-runtime-a', value, 0)).toEqual({ index: 0, reused: false, reconciled: true })
    host.intercept({ path: '/artifact-status', method: 'POST' }).reply(200, status(value, true))
    expect((await relayArtifactPart(settings(), 'a', manifest, manifestHash, 'main-runtime-a', value, 0)).reused).toBe(true)
  })
  it('stops after explicit authorization denial without querying or uploading again', async () => {
    const value = await image()
    fetchMock.get('https://executor.test').intercept({ path: '/artifact-status', method: 'POST' }).reply(403)
    await expect(relayArtifactPart(settings(), 'a', manifest, manifestHash, 'main-runtime-a', value, 0)).rejects.toThrow('AUTHENTICATION_FAILED')
  })
  it('does not replay or perform a follow-up query after an explicit upload denial', async () => {
    const value = await image(), sha = await digest()
    await bindings.ARTIFACTS.put(`artifact-blobs/sha256/${sha}`, source, { sha256: sha, customMetadata: { sha256: sha } })
    const host = fetchMock.get('https://executor.test')
    host.intercept({ path: '/artifact-status', method: 'POST' }).reply(200, status(value))
    host.intercept({ path: '/artifact-parts', method: 'PUT' }).reply(403)
    await expect(relayArtifactPart(settings(), 'a', manifest, manifestHash, 'main-runtime-a', value, 0)).rejects.toThrow('AUTHENTICATION_FAILED')
  })
})
