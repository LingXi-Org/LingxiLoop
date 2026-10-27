import { createHash } from 'node:crypto'
import { lstat, realpath, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isVisualizePublicResource, VISUALIZE_PUBLIC_RESOURCES, visualizeResourceFile } from '../../../shared/visualize-public-resources.js'

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
/** Expose only fixed public asset hashes; no paths, capabilities or document metadata. */
export function publicVisualizeResourceHashes(runtime: unknown, vendor: unknown, bundle: unknown): Readonly<Record<string, string>> {
  const hashes: Record<string, string> = {}
  const put = (name: string, value: unknown) => {
    if (isVisualizePublicResource(name) && typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) hashes[name] = value
  }
  for (const [name, value] of Object.entries(record(record(runtime).files))) put(name, record(value).sha256)
  const resources = record(vendor).resources
  if (Array.isArray(resources)) for (const value of resources) {
    const entry = record(value)
    if (typeof entry.file === 'string') put(`vendor/${entry.file}`, entry.sha256)
  }
  for (const [name, value] of Object.entries(record(record(bundle).files))) put(name, record(value).sha256)
  return Object.freeze(hashes)
}

let manifest: Promise<Readonly<Record<string, string>>> | undefined
/** A successful manifest is immutable for this server image/process. Failures retry normally. */
export function readPublicVisualizeResourceHashes(): Promise<Readonly<Record<string, string>>> {
  manifest ??= Promise.all([
    'third_party/zcode/skills/visualize/assets/runtime-manifest.json',
    'third_party/zcode/skills/visualize/assets/vendor/manifest.json',
    'server/assets/visualize-runtime/manifest.json',
  ].map(async path => JSON.parse(await readFile(resolve(path), 'utf8')) as unknown))
    .then(([runtime, vendor, bundle]) => {
      const hashes = publicVisualizeResourceHashes(runtime, vendor, bundle)
      if (VISUALIZE_PUBLIC_RESOURCES.some(name => !hashes[name])) throw new Error('Visualize public resource manifest is incomplete')
      return hashes
    })
    .catch(error => { manifest = undefined; throw error })
  return manifest
}

/** Bounded by the fixed whitelist and 8 MiB; pending cold reads coalesce. */
export function createVisualizeAssetCache(load: (name: string) => Promise<Buffer>, maxBytes = 8 * 1024 * 1024) {
  const entries = new Map<string, Promise<Buffer>>()
  let size = 0
  return async (name: string, hash: string) => {
    if (!isVisualizePublicResource(name) || !/^[a-f0-9]{64}$/.test(hash)) throw new Error('Unknown Visualize public resource')
    const key = `${name}:${hash}`
    let pending = entries.get(key)
    if (!pending) {
      pending = load(name).then(bytes => {
        if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error('Visualize resource integrity failed')
        if (size + bytes.length > maxBytes) entries.delete(key)
        else size += bytes.length
        return bytes
      }).catch(error => { entries.delete(key); throw error })
      // One immutable manifest per process; the whitelist bounds entry count.
      entries.set(key, pending)
    }
    return pending
  }
}
const publicBytes = createVisualizeAssetCache(async name => {
  const file = resolve(visualizeResourceFile(name)!)
  if ((await lstat(file)).isSymbolicLink() || await realpath(file) !== file) throw new Error('Invalid Visualize public resource')
  return readFile(file)
})
export async function readPublicVisualizeResource(name: string) {
  const hash = (await readPublicVisualizeResourceHashes())[name]
  if (!isVisualizePublicResource(name) || !hash) throw new Error('Unknown Visualize public resource')
  return { bytes: await publicBytes(name, hash), mime: name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }
}
