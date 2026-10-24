#!/usr/bin/env node
// Bound the server-only PDF.js install to its product consumers. Never run on the SPA install.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createRequire } from 'node:module'

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
const officeRoot = join(dependencyRoot, 'officeparser')
if (existsSync(join(officeRoot, 'package.json'))) {
  const office = JSON.parse(readFileSync(join(officeRoot, 'package.json'), 'utf8'))
  assert.equal(office.version, '8.2.0', 'Re-audit officeparser PDF.js consumers before changing its version')
  assert.equal(office.dependencies?.['pdfjs-dist'], '6.2.108')
  // OfficeParser resolves its own PDF module and worker from these two Node
  // consumers. Its entire nested6.2.108 tree stays intact; this script trims
  // only the separately pinned top-level6.3.289 used by LingxiOS.
  const nested = join(officeRoot, 'node_modules/pdfjs-dist')
  assert.equal(JSON.parse(readFileSync(join(nested, 'package.json'), 'utf8')).version, '6.2.108')
  for (const consumer of ['dist/utils/moduleLoader.js', 'dist/parsers/PdfParser.js']) {
    const require = createRequire(join(officeRoot, consumer))
    for (const [specifier, path] of [
      ['pdfjs-dist', 'build/pdf.mjs'], ['pdfjs-dist/package.json', 'package.json'],
      ['pdfjs-dist/legacy/build/pdf.mjs', 'legacy/build/pdf.mjs'],
      ['pdfjs-dist/legacy/build/pdf.worker.mjs', 'legacy/build/pdf.worker.mjs'],
    ]) assert.equal(require.resolve(specifier), join(nested, path), 'OfficeParser must retain its separate PDF.js runtime')
  }
  allowedConsumers.push(...[
    'package.json', 'node_modules/pdfjs-dist/package.json',
    'dist/defaults.js', 'dist/officeparser.browser.d.ts', 'dist/officeparser.browser.iife.js',
    'dist/officeparser.browser.mjs', 'dist/officeparser.browser.native-pdf.mjs',
    'dist/officeparser.browser.slim.d.ts', 'dist/officeparser.browser.slim.iife.js',
    'dist/officeparser.browser.slim.mjs', 'dist/parsers/PdfParser.d.ts', 'dist/parsers/PdfParser.js',
    'dist/types.d.ts', 'dist/utils/envUtils.d.ts', 'dist/utils/envUtils.js',
    'dist/utils/moduleLoader.d.ts', 'dist/utils/moduleLoader.js',
  ].map(path => 'officeparser/' + path))
}
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
