import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { isVisualizePublicResource, VISUALIZE_PUBLIC_RESOURCES } from '../../../shared/visualize-public-resources.js'

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
  put('gen-ui.js', record(record(record(bundle).files)['gen-ui.js']).sha256)
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
