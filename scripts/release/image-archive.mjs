import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { isDeepStrictEqual } from 'node:util'
import { imageArtifact } from '../release-candidate.mjs'
import { releaseApiUrl } from '../ci-scope-cumulative.mjs'

export const PART_BYTES = 8388608, MAX_PARTS = 2048, MAX_ARCHIVE_BYTES = 8 * 1024 ** 3, MAX_TAR_BYTES = 16 * 1024 ** 3
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const requireThat = (ok, code) => { if (!ok) throw new Error(code) }
export function archiveTag(image) {
  requireThat(/^sha256:[a-f0-9]{64}$/.test(image.configDigest || ''), 'ARCHIVE_CONFIG_REQUIRED')
  return `localhost/lingxi-release-cache:sha256-${image.configDigest.slice(7)}`
}
export async function verifySource(image) {
  requireThat(/^ghcr\.io\/[a-z0-9][a-z0-9/._-]*@sha256:[a-f0-9]{64}$/.test(image.ref || ''), 'ARCHIVE_SOURCE_INVALID')
  requireThat(image.ociProof && ['index', 'manifest', 'config'].every(key => typeof image.ociProof[key] === 'string'), 'ARCHIVE_OCI_PROOF_REQUIRED')
  const reference = image.ref.split('@')[0]
  const checked = await imageArtifact(reference, image.indexDigest, ref => Buffer.from(ref.endsWith(image.platformDigest) ? image.ociProof.manifest : image.ociProof.index, 'base64'), async () => Buffer.from(image.ociProof.config, 'base64'))
  requireThat(Object.keys(checked).every(key => isDeepStrictEqual(checked[key], image[key])), 'ARCHIVE_SOURCE_MISMATCH')
}
export function validateArchive(archive, image) {
  requireThat(archive?.version === 1 && archive.format === 'docker-save+gzip' && /^sha256:[a-f0-9]{64}$/.test(archive.sha256 || '') && archive.tag === archiveTag(image), 'ARCHIVE_DESCRIPTOR_INVALID')
  requireThat(Number.isSafeInteger(archive.size) && archive.size > 0 && archive.size <= MAX_ARCHIVE_BYTES && Number.isSafeInteger(archive.uncompressedSize) && archive.uncompressedSize > 0 && archive.uncompressedSize <= MAX_TAR_BYTES, 'ARCHIVE_SIZE_INVALID')
  requireThat(Array.isArray(archive.parts) && archive.parts.length > 0 && archive.parts.length <= MAX_PARTS, 'ARCHIVE_PARTS_INVALID')
  let sum = 0
  for (const part of archive.parts) {
    requireThat(/^sha256:[a-f0-9]{64}$/.test(part.sha256 || '') && Number.isSafeInteger(part.size) && part.size > 0 && part.size <= PART_BYTES, 'ARCHIVE_PART_INVALID')
    sum += part.size
  }
  requireThat(sum === archive.size, 'ARCHIVE_PART_SUM_MISMATCH')
  return archive
}

// Each part has a single write attempt. Unknown writes are reconciled by HEAD.
export async function putPart(bytes, { baseUrl, token, fetcher = fetch }) {
  requireThat(bytes.length > 0 && bytes.length <= PART_BYTES, 'ARCHIVE_PART_INVALID')
  const sha256 = hash(bytes), size = bytes.length, url = releaseApiUrl(baseUrl, `/v1/artifact-blobs/${sha256.slice(7)}`, token)
  const request = method => ({ method, headers: { authorization: `Bearer ${token}`, ...(method === 'PUT' ? { 'content-type': 'application/octet-stream', 'content-length': String(size) } : {}) }, redirect: 'error', signal: AbortSignal.timeout(120000) })
  async function head() {
    let response
    try { response = await fetcher(url, request('HEAD')) } catch { throw new Error('ARCHIVE_HEAD_UNCONFIRMED') }
    if (response.status === 404) return false
    requireThat(response.ok, `ARCHIVE_HEAD_HTTP_${response.status}`)
    requireThat(response.headers.get('x-lingxi-artifact-sha256') === sha256 && response.headers.get('content-length') === String(size), 'ARCHIVE_PART_CONFLICT')
    return true
  }
  if (await head()) return { sha256, size }
  let response
  try { response = await fetcher(url, { ...request('PUT'), body: bytes }) } catch { /* write outcome unknown */ }
  if (response && !response.ok && response.status < 500) throw new Error(`ARCHIVE_PUT_HTTP_${response.status}`)
  if (response?.ok) {
    let receipt
    try { receipt = await response.json() } catch { /* lost receipt: HEAD below */ }
    if (receipt) {
      requireThat(receipt.complete === true && receipt.sha256 === sha256 && receipt.size === size, 'ARCHIVE_PART_CONFLICT')
      return { sha256, size }
    }
  }
  requireThat(await head(), 'ARCHIVE_PUT_UNCONFIRMED')
  return { sha256, size }
}
export async function uploadParts(path, expected, options) {
  const source = await open(path, 'r'), whole = createHash('sha256'), parts = []
  let size = 0
  try {
    while (true) {
      const bytes = Buffer.allocUnsafe(PART_BYTES)
      let length = 0
      while (length < PART_BYTES) {
        const { bytesRead } = await source.read(bytes, length, PART_BYTES - length, null)
        if (!bytesRead) break
        length += bytesRead
      }
      if (!length) break
      size += length; whole.update(bytes.subarray(0, length))
      requireThat(size <= MAX_ARCHIVE_BYTES && parts.length < MAX_PARTS, 'ARCHIVE_TOO_LARGE')
      parts.push(await putPart(bytes.subarray(0, length), options))
    }
  } finally { await source.close() }
  requireThat(size === expected.size && `sha256:${whole.digest('hex')}` === expected.sha256, 'ARCHIVE_CHANGED_DURING_UPLOAD')
  return parts
}
export function verifySavedArchive(path, image, descriptor) {
  try {
    const result = execFileSync('python3', [join(dirname(fileURLToPath(import.meta.url)), 'image-archive-verify.py'), path], { input: JSON.stringify({ ...image, ...descriptor }), encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
    const receipt = JSON.parse(result)
    requireThat(['sha256', 'size', 'uncompressedSize', 'tag'].every(key => receipt[key] === descriptor[key]) && receipt.configDigest === image.configDigest && isDeepStrictEqual(receipt.diffIds, image.diffIds), 'ARCHIVE_VERIFICATION_MISMATCH')
    return receipt
  } catch (error) {
    const code = String(error.stderr || '').trim()
    throw new Error(/^ARCHIVE_[A-Z_]+$/.test(code) ? code : 'ARCHIVE_VERIFICATION_FAILED')
  }
}
export async function gzipDockerSave(tag, destination, { dockerPrefix = [] } = {}) {
  const child = spawn('docker', [...dockerPrefix, 'image', 'save', '--platform', 'linux/amd64', tag], { stdio: ['ignore', 'pipe', 'ignore'] })
  const completed = new Promise(resolve => { child.once('error', () => resolve(false)); child.once('close', code => resolve(code === 0)) })
  let size = 0, uncompressedSize = 0
  const whole = createHash('sha256')
  const timer = setTimeout(() => child.kill('SIGKILL'), 20 * 60 * 1000)
  try {
    await pipeline(child.stdout, new Transform({ transform(chunk, _encoding, done) { uncompressedSize += chunk.length; done(uncompressedSize > MAX_TAR_BYTES ? new Error('ARCHIVE_TAR_TOO_LARGE') : null, chunk) } }), createGzip(), new Transform({ transform(chunk, _encoding, done) { size += chunk.length; whole.update(chunk); done(size > MAX_ARCHIVE_BYTES ? new Error('ARCHIVE_TOO_LARGE') : null, chunk) } }), createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
    requireThat(await completed, 'ARCHIVE_DOCKER_SAVE_FAILED')
    const handle = await open(destination, 'r+'); try { await handle.sync() } finally { await handle.close() }
    return { sha256: `sha256:${whole.digest('hex')}`, size, uncompressedSize, tag }
  } catch (error) {
    child.kill('SIGKILL'); await completed
    throw error
  } finally { clearTimeout(timer) }
}
export async function prepareImageArchive(image, { tempRoot, baseUrl, token, fetcher = fetch } = {}) {
  releaseApiUrl(baseUrl, '/v1/artifact-blobs/', token)
  requireThat(tempRoot && isAbsolute(tempRoot), 'ARCHIVE_RUNNER_TEMP_REQUIRED')
  await verifySource(image)
  const tag = archiveTag(image), directory = await mkdtemp(join(tempRoot, 'lingxi-image-archive-'))
  let tagged = false
  const docker = args => {
    try { return execFileSync('docker', args, { encoding: 'utf8', timeout: 20 * 60 * 1000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }) }
    catch { throw new Error('ARCHIVE_DOCKER_COMMAND_FAILED') }
  }
  try {
    docker(['image', 'pull', '--platform', 'linux/amd64', image.ref])
    const actual = JSON.parse(docker(['image', 'inspect', image.ref]))[0]
    requireThat(actual?.Os === image.os && actual.Architecture === image.architecture && isDeepStrictEqual(actual.RootFS?.Layers, image.diffIds), 'ARCHIVE_LOCAL_SOURCE_MISMATCH')
    // Docker classic reports config ID; Docker containerd may report the proven
    // index/platform ID. The saved config bytes and every layer are verified below.
    requireThat([image.configDigest, image.platformDigest, image.indexDigest].includes(actual.Id), 'ARCHIVE_LOCAL_ID_MISMATCH')
    try { execFileSync('docker', ['image', 'inspect', tag], { stdio: 'ignore', timeout: 30000 }); throw new Error('ARCHIVE_TAG_ALREADY_EXISTS') }
    catch (error) { if (error.message === 'ARCHIVE_TAG_ALREADY_EXISTS') throw error }
    docker(['image', 'tag', image.ref, tag]); tagged = true
    const path = join(directory, 'image.tar.gz'), descriptor = await gzipDockerSave(tag, path)
    verifySavedArchive(path, image, descriptor)
    const parts = await uploadParts(path, descriptor, { baseUrl, token, fetcher })
    return validateArchive({ version: 1, format: 'docker-save+gzip', ...descriptor, parts }, image)
  } finally {
    try { if (tagged) docker(['image', 'rm', tag]) }
    finally { await rm(directory, { recursive: true, force: true }) }
  }
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  try {
    const destination = process.argv[2]
    requireThat(destination, 'ARCHIVE_METADATA_PATH_REQUIRED')
    const image = JSON.parse(await readFile(destination, 'utf8'))
    const archive = await prepareImageArchive(image, { tempRoot: process.env.RUNNER_TEMP, baseUrl: process.env.RELEASE_API_URL, token: process.env.RELEASE_API_TOKEN })
    await writeFile(destination, JSON.stringify({ ...image, archive }))
  } catch (error) {
    console.error(/^ARCHIVE_[A-Z_0-9]+$/.test(error.message) ? error.message : 'ARCHIVE_PREPARATION_FAILED')
    process.exitCode = 1
  }
}
