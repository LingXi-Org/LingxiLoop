#!/usr/bin/env node
// Run after `npm run build -- --manifest`; measure emitted bytes, not browser latency.
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const [directory = 'dist', destination, desktopEntry, check] = process.argv.slice(2)
const root = resolve(directory)
const manifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'))
const keyFor = name => Object.entries(manifest).find(([, chunk]) => chunk.name === name)?.[0]
const entries = ['index.html', keyFor('App'), keyFor('GlobalInteractionProvider'), desktopEntry ?? keyFor('DesktopApp')]
for (const entry of entries) {
  if (!manifest[entry]) throw new Error(`Missing build entry: ${entry}`)
}

const sizes = new Map()
async function size(file) {
  if (!sizes.has(file)) {
    const content = await readFile(resolve(root, file))
    sizes.set(file, { file, bytes: content.length, gzipBytes: gzipSync(content).length })
  }
  return sizes.get(file)
}

async function journey(roots) {
  const visited = new Set(), files = new Set()
  function visit(key) {
    if (visited.has(key)) return
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) throw new Error(`Missing imported chunk: ${key}`)
    files.add(chunk.file)
    for (const css of chunk.css ?? []) files.add(css)
    for (const dependency of chunk.imports ?? []) visit(dependency)
  }
  roots.forEach(visit)
  const assets = await Promise.all([...files].sort().map(size))
  return { roots, requestCount: assets.length,
    bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    gzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0), assets }
}

const initialPage = await journey(entries.slice(0, 3))
const defaultChat = await journey(entries)
const deferred = ['CanvasView', 'DocumentPeekPane', 'CalendarPeekPane', 'PresentationDrawerContent', 'SettingsDialog', 'PersonalDashboard']
const report = {
  measurement: 'Production manifest static import closure. Excludes runtime data, font requests and browser timings.',
  initialPage, defaultChat,
  deferred: Object.fromEntries(deferred.map(name => {
    const entry = Object.values(manifest).find(chunk => chunk.src?.endsWith(`/${name}.tsx`))
    return [name, { file: entry?.file ?? null, separateDynamicEntry: entry?.isDynamicEntry === true,
      inDefaultChat: entry ? defaultChat.assets.some(asset => asset.file === entry.file) : null }]
  })),
}
const json = `${JSON.stringify(report, null, 2)}\n`
if (destination) await writeFile(resolve(destination), json)
else process.stdout.write(json)
if (check === '--check-deferred') {
  for (const [name, entry] of Object.entries(report.deferred)) {
    if (!entry.separateDynamicEntry || entry.inDefaultChat) throw new Error(`${name} is not deferred from default chat`)
  }
}
