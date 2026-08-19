#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { listPackage } = require('@electron/asar')

const ALLOWED_RUNTIME_MODULES = new Set([
  'argparse',
  'builder-util-runtime',
  'debug',
  'electron-updater',
  'fs-extra',
  'graceful-fs',
  'js-yaml',
  'jsonfile',
  'lazy-val',
  'lodash.escaperegexp',
  'lodash.isequal',
  'ms',
  'sax',
  'semver',
  'tiny-typed-emitter',
  'universalify',
])

const root = resolve(process.argv[2] || 'release')
if (!existsSync(root)) {
  console.error(`Desktop package directory does not exist: ${root}`)
  process.exit(2)
}

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const allowed = packageJson.build?.files ?? []
const forbiddenManifestEntry = allowed.find((entry) => /(^|[/\\])(server|server\/lingxigraph)([/\\]|$)|(^|[/\\])\.env/i.test(entry))
if (forbiddenManifestEntry) {
  throw new Error(`electron-builder files allow-list includes a forbidden backend/secret path: ${forbiddenManifestEntry}`)
}

const files = []
function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) walk(full)
    else files.push(full)
  }
}
walk(root)

const normalized = files.map((file) => relative(root, file).replaceAll('\\', '/'))
const appAsar = normalized.filter((file) => file.endsWith('/resources/app.asar') || file === 'resources/app.asar')
if (appAsar.length === 0) throw new Error(`No Electron resources/app.asar found under ${root}`)

const asarEntries = appAsar.flatMap((file) => listPackage(join(root, file)).map((entry) => `app.asar${entry}`))
for (const file of appAsar) {
  const packagedManifest = JSON.parse(require('@electron/asar').extractFile(join(root, file), 'package.json').toString('utf8'))
  const dependencies = Object.keys(packagedManifest.dependencies ?? {})
  if (packagedManifest.bin != null || dependencies.length !== 1 || dependencies[0] !== 'electron-updater') {
    throw new Error(`Packaged package.json must expose only electron-updater and no CLI: ${JSON.stringify({ bin: packagedManifest.bin, dependencies })}`)
  }
}
const unexpectedAsar = asarEntries.filter((entry) => {
  const path = entry.replaceAll('\\', '/').replace(/^app\.asar\/?/, '')
  if (!path || path === 'package.json' || path === 'dist' || path === 'electron' || path === 'build' || path === 'node_modules' ||
      path.startsWith('dist/') || path.startsWith('electron/') || path.startsWith('build/')) return false
  if (!path.startsWith('node_modules/')) return true
  const moduleName = path.slice('node_modules/'.length).split('/')[0]
  return !ALLOWED_RUNTIME_MODULES.has(moduleName)
})
if (unexpectedAsar.length > 0) {
  throw new Error(`Unexpected files found in app.asar:\n${unexpectedAsar.slice(0, 50).join('\n')}`)
}

const forbidden = normalized.filter((file) => {
  const path = `/${file.toLowerCase()}`
  const name = basename(path)
  return path.includes('/resources/app/server/') ||
    path.includes('/lingxigraph/') ||
    /\/(\.env($|\.)|[^/]*(secret|private[-_]?key)[^/]*)/.test(path) ||
    /\.(pem|p8|p12|key)$/.test(name)
})
const forbiddenAsar = asarEntries.filter((entry) => {
  const path = entry.toLowerCase()
  return path.startsWith('app.asar/server/') ||
    path.includes('/lingxigraph/') ||
    /\/(\.env($|\.)|[^/]*(secret|private[-_]?key)[^/]*)/.test(path) ||
    /\.(pem|p8|p12|key)$/.test(path)
})
if (forbidden.length > 0 || forbiddenAsar.length > 0) {
  throw new Error(`Forbidden backend or secret-like files found in desktop package:\n${[...forbidden, ...forbiddenAsar].join('\n')}`)
}

console.log(`Desktop layout verified: ${appAsar.length} app.asar file(s), ${asarEntries.length} app entries, no backend/runtime/secrets`)
