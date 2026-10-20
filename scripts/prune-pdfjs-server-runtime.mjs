#!/usr/bin/env node
// Bound the server-only PDF.js install to its product consumers. Never run on the SPA install.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const [packageArg, mode = '--dry-run'] = process.argv.slice(2)
assert.ok(packageArg && ['--dry-run', '--apply'].includes(mode),
  'Usage: node scripts/prune-pdfjs-server-runtime.mjs PACKAGE_DIR [--dry-run|--apply]')
const root = resolve(packageArg)
assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink())
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.equal(manifest.name, 'pdfjs-dist')
assert.equal(manifest.version, '6.3.289', 'Re-audit PDF.js layout before changing the pinned version')
const dependencyRoot = resolve(root, '..')
const consumers = []
const inspectConsumers = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (path !== root) inspectConsumers(path)
    } else if (entry.isFile() && /\.(?:[cm]?js|json|tsx?)$/.test(entry.name)) {
      if (readFileSync(path).includes('pdfjs-dist')) {
        consumers.push(relative(dependencyRoot, path).replaceAll('\\', '/'))
      }
    }
  }
}
inspectConsumers(dependencyRoot)
const allowedConsumers = [
  '.package-lock.json', '@lyyzka/lingxios/package.json',
  '@lyyzka/lingxios/dist/src/context/document-worker.js',
]
assert.deepEqual(consumers.sort(), allowedConsumers.sort(),
  'Re-audit PDF.js consumers before pruning the installed package')
const documentWorker = readFileSync(join(dependencyRoot,
  '@lyyzka/lingxios/dist/src/context/document-worker.js'), 'utf8')
assert.ok(documentWorker.includes("import('pdfjs-dist/legacy/build/pdf.mjs')"))
assert.ok(documentWorker.includes("import.meta.resolve('pdfjs-dist/package.json')"))

const required = [
  'LICENSE', 'package.json', 'types/src/pdf.d.ts',
  'build/pdf.mjs', 'build/pdf.worker.min.mjs',
  'legacy/build/pdf.mjs', 'legacy/build/pdf.worker.mjs', 'legacy/build/pdf.mjs.map',
  'cmaps/LICENSE', 'standard_fonts/LICENSE_FOXIT', 'standard_fonts/LICENSE_LIBERATION',
  'wasm/LICENSE_PDFJS_JBIG2', 'wasm/LICENSE_PDFJS_OPENJPEG',
]
for (const name of required) assert.ok(lstatSync(join(root, name)).isFile(), `Missing required file: ${name}`)
for (const name of ['iccs', 'image_decoders', 'legacy/image_decoders']) {
  assert.ok(lstatSync(join(root, name)).isDirectory(), `Missing runtime resource directory: ${name}`)
}

const removed = ['web', 'legacy/web',
  'build/pdf.mjs.map', 'build/pdf.worker.mjs.map', 'build/pdf.sandbox.mjs.map']
const files = directory => {
  const result = []
  const visit = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) result.push(child)
      else throw new Error(`Unexpected PDF.js filesystem entry: ${child}`)
    }
  }
  visit(directory)
  return result.sort()
}
const inventory = paths => paths.map(path => {
  const content = readFileSync(path)
  return { path: relative(root, path).replaceAll('\\', '/'), bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex') }
})
const allBefore = inventory(files(root))
const isRemoved = path => removed.some(target => path === target || path.startsWith(`${target}/`))
const selected = allBefore.filter(file => isRemoved(file.path))
assert.ok(selected.every(file => !/(?:^|\/)(?:LICENSE|NOTICE|COPYING)(?:[._/-]|$)/i.test(file.path)),
  'A license or notice entered the PDF.js trim set')
for (const target of removed) {
  const path = join(root, target)
  assert.ok(target.includes('/') ? lstatSync(path).isFile() || lstatSync(path).isDirectory()
    : lstatSync(path).isDirectory(), `Missing expected trim target: ${target}`)
}
assert.ok(selected.length > 0)
const digest = entries => createHash('sha256').update(JSON.stringify(entries)).digest('hex')
const retainedBefore = allBefore.filter(file => !isRemoved(file.path))
if (mode === '--apply') {
  for (const target of removed) rmSync(join(root, target), { recursive: true })
  const after = inventory(files(root))
  assert.equal(digest(after), digest(retainedBefore), 'Unexpected change to a retained PDF.js file')
}
console.log(JSON.stringify({ package: `${manifest.name}@${manifest.version}`, mode,
  auditedDependencyConsumers: consumers,
  removedFiles: selected.length,
  removedContentBytes: selected.reduce((sum, file) => sum + file.bytes, 0),
  removedInventorySha256: digest(selected),
  retainedFiles: retainedBefore.length,
  retainedInventorySha256: digest(retainedBefore),
  targetPaths: removed }, null, 2))
