// Executed with Node's built-ins in an image with no network, runtime config,
// database or user-data mounts. Retain public programs, never artifact files.
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, utimes } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'

export const EDITOR_ASSET_RETENTION_MS = 24 * 60 * 60_000
const MAX_ASSET_BYTES = 16 * 1024 * 1024
const MAX_IMAGE_BYTES = 128 * 1024 * 1024
const MAX_CACHE_BYTES = 2 * 1024 * 1024 * 1024
const publicName = (kind, name) => (kind === 'design'
  ? /^design-[a-f0-9]{64}\.(?:js|css|woff2)$/
  : /^[A-Za-z0-9_-]+\.(?:js|css|woff2)$/).test(name)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

async function directory(path) {
  await mkdir(path, { recursive: true, mode: 0o755 })
  if (!(await lstat(path)).isDirectory()) throw Error('editor asset directory must not be a symlink')
}
async function regularFile(path) {
  const info = await lstat(path)
  if (!info.isFile() || info.size > MAX_ASSET_BYTES) throw Error('editor asset must be a bounded regular file')
  return info
}

export async function retainEditorAssets({ sourceRoot = '/app/server/assets', cacheRoot = '/retained', now = Date.now(), prune = false, maxBytes = MAX_CACHE_BYTES, requireEditors = false, stagingAllowanceBytes = 3 * MAX_IMAGE_BYTES } = {}) {
  await directory(cacheRoot)
  let projectedBytes = 0, projectedFiles = 0
  for (const kind of ['design', 'slides']) {
    const root = join(cacheRoot, kind)
    await directory(root)
    for (const name of await readdir(root)) {
      const temporary = /^(.*)\.[a-f0-9-]{36}\.tmp$/.exec(name)
      if (temporary && publicName(kind, temporary[1].replace(/\.(?:br|gz)$/, ''))) {
        await regularFile(join(root, name));await rm(join(root, name));continue
      }
      if (!publicName(kind, name.replace(/\.(?:br|gz)$/, ''))) throw Error('unexpected retained editor asset')
      projectedBytes += (await regularFile(join(root, name))).size;projectedFiles++
    }
  }
  let copied = 0, sourceBytes = 0
  for (const kind of ['design', 'slides']) {
    const source = join(sourceRoot, kind + '-editor/assets'), destination = join(cacheRoot, kind)
    await directory(destination)
    const names = await readdir(source).catch(error => { if (error.code === 'ENOENT') return [];throw error })
    if (names.length && !(await lstat(source)).isDirectory()) throw Error('editor source must be a regular file directory')
    if (requireEditors && !names.some(name => publicName(kind, name) && name.endsWith('.js'))) throw Error('target image is missing editor assets')
    for (const name of names.filter(name => publicName(kind, name))) {
      const bytes = await readFileAfterCheck(join(source, name))
      if (kind === 'design' && sha(bytes) !== name.slice(7, 71)) throw Error('invalid immutable Design asset hash')
      const variants = [[name, bytes]]
      for (const [suffix, decode] of [['.br', brotliDecompressSync], ['.gz', gunzipSync]]) {
        if (!names.includes(name + suffix)) continue
        const encoded = await readFileAfterCheck(join(source, name + suffix))
        try { if (!decode(encoded, { maxOutputLength: MAX_ASSET_BYTES }).equals(bytes)) throw Error('mismatch') }
        catch { throw Error('invalid compressed editor asset') }
        variants.push([name + suffix, encoded])
      }
      for (const [file, value] of variants) {
        sourceBytes += value.length
        if (sourceBytes > MAX_IMAGE_BYTES || ++copied > 2048) throw Error('editor source image asset limit exceeded')
        const target = join(destination, file)
        const exists = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null;throw error })
        if (exists) {
          await regularFile(target)
          const current = await readFile(target)
          // Content encodings may change between compressor versions while the
          // immutable decoded resource remains identical.
          const decode = file.endsWith('.br') ? brotliDecompressSync : file.endsWith('.gz') ? gunzipSync : value => value
          if (!decode(current, { maxOutputLength: MAX_ASSET_BYTES }).equals(bytes)) throw Error('conflicting immutable editor asset')
        } else {
          if (projectedBytes + value.length > maxBytes + stagingAllowanceBytes || projectedFiles >= 16384) throw Error('retained editor staging limit exceeded')
          const temporary = target + '.' + randomUUID() + '.tmp'
          try { await copyFile(join(source, file), temporary, constants.COPYFILE_EXCL);await rename(temporary, target) }
          finally { await rm(temporary, { force: true }) }
          projectedBytes += value.length;projectedFiles++
        }
        await utimes(target, now / 1000, now / 1000)
      }
    }
  }
  let retainedBytes = 0, pruned = 0
  for (const kind of ['design', 'slides']) {
    const root = join(cacheRoot, kind)
    for (const name of await readdir(root)) {
      if (!publicName(kind, name.replace(/\.(?:br|gz)$/, ''))) throw Error('unexpected retained editor asset')
      const path = join(root, name), info = await regularFile(path)
      // Called only after every observed source and target image has been
      // copied on this host. Their files were touched above; do not evict a
      // valid grant's lazily requested resource to satisfy a size limit.
      if (prune && info.mtimeMs < now - EDITOR_ASSET_RETENTION_MS) { await rm(path);pruned++ }
      else retainedBytes += info.size
    }
  }
  if (prune && retainedBytes > maxBytes) throw Error('retained editor cache limit exceeded; release refused without evicting live code')
  return { copied, sourceBytes, retainedBytes, pruned }
}
async function readFileAfterCheck(path) { await regularFile(path);return readFile(path) }

/** Observe first, then stage the union on BOTH hosts, before any API/Worker
 * stop. The target image's helper is supplied from the committed release. */
export async function editorAssetPreparation({ target, helper, observe, prepare }) {
  const imagePattern = /^(?:ghcr\.io\/lingxi-org|accel\.way2api\.fun\/ghcr\.io\/lingxi-org)\/lingxiloop-server:(?:[a-f0-9]{24}|[a-f0-9]{40})$/
  const observed = await Promise.all(['a', 'b'].map(observe))
  const images = [...new Set([...observed.filter(Boolean), target])]
  if (images.some(image => !imagePattern.test(image))) throw Error('unrecognized editor source image; inspect release state before rollout')
  await Promise.all(['a', 'b'].map(slot => prepare(slot, [
    'umask 022; mkdir -p /opt/lingxiloop/editor-assets',
    'exec 9>/opt/lingxiloop/editor-assets.lock; flock -x 9',
    ...images.map((image, index) => [
      `docker image inspect '${image}' >/dev/null 2>&1 || ctr -n moby images pull --platform linux/amd64 '${image}' >/dev/null`,
      `docker run --rm --pull never --network none --read-only --cap-drop ALL --security-opt no-new-privileges --memory 192m --pids-limit 32 --user 0 --mount type=bind,source=/opt/lingxiloop/editor-assets,target=/retained --entrypoint node '${image}' --input-type=module <<'RETAIN_EDITOR_ASSETS_JS'`,
      helper,
      `console.log(JSON.stringify(await retainEditorAssets({prune:${index === images.length - 1},requireEditors:${image === target}})));`,
      'RETAIN_EDITOR_ASSETS_JS',
    ].join('\n')),
  ].join('\n'))))
}
