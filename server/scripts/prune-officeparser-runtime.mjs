#!/usr/bin/env node
// Server-only trim for the audited editable-PPTX consumer. Never use for a browser install.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative, resolve } from 'node:path'

const [dependencyArg, sourceArg, mode = '--dry-run'] = process.argv.slice(2)
assert.ok(dependencyArg && sourceArg && ['--dry-run', '--apply'].includes(mode),
  'Usage: node prune-officeparser-runtime.mjs NODE_MODULES HOMEWORK_PRESENTATION_SOURCE [--dry-run|--apply]')
const root = resolve(dependencyArg)
assert.ok(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink())
const sha = content => createHash('sha256').update(content).digest('hex')
// Pin the actual entry points, lazy OCR gate, config merger and PDF loader,
// rather than assuming that an unchanged package version implies unchanged code.
const auditedContent = {
  'officeparser/package.json': '28ab7a159a8b5fe8bd5fce0d78308eb6e489ee386ae256d4fb1a9ff4f9b4bed2',
  'officeparser/dist/index.js': 'e2f22c9d1ea9ac7114e18923729196dd7c11023a2941aa2c93c6ad075ba7251e',
  'officeparser/dist/index.mjs': '5bf615a2d6ae18722add48fcab7854a6b1f276a858cdbaa1edefcb3269d34ef0',
  'officeparser/dist/utils/ocrUtils.js': 'ff9ca73347d2150287013dacaa75b05ab6936947aecfbc9c7cf287b77d1dc5f8',
  'officeparser/dist/utils/configUtils.js': '2d6abf09d4a28bd71d34e32b4a4e91bba53c38162d2cabf4f2a4bff34b9ce8ab',
  'officeparser/dist/parsers/PowerPointParser.js': '7b2d2b1da9cea63c74c4011a0d7224021b6f6eb3993e0a0140059b2b59f7471d',
  'officeparser/dist/utils/moduleLoader.js': '6baf5ddafb6a6630835d9561fe83d7701976725e46402ce9d4a36b2062cfa806',
  'tesseract.js/package.json': 'fa342f37afd665595eca66ee867197c47c9ac35a7967123d1132c39a40b3dfbd',
  'tesseract.js/src/index.js': '882360f8435a9f2b80265fffc5df2a7c849c39afd05c36ffd89db9d1024979d0',
  'tesseract.js/src/worker-script/node/getCore.js': '139e22c350e002fd3794d32a850fc45f5593ee66f9160d70df5fd492bcbec4cb',
  'tesseract.js-core/package.json': '554b867684677c81aa3ffab61f31e83618445fa09adee99e8fff3515cee6ca54',
  'tesseract.js-core/index.js': 'cc5d319080bc2ef3c288128690ea598c8cbc1d1f2f13a6a750c0ba344ff5a162',
}
assert.equal(sha(readFileSync(resolve(sourceArg))),
  '7e2b64fc65cc224484526c43e7f85ca87c08aae216c4095e8909aa0ce4dfd2b7',
  'Re-audit the product PPTX options/consumer before trimming OCR assets')
for (const [path, digest] of Object.entries(auditedContent)) {
  assert.equal(sha(readFileSync(join(root, path))), digest, `Re-audit changed dependency content: ${path}`)
}
for (const [name, version] of [['officeparser', '8.2.0'], ['tesseract.js', '7.0.0'], ['tesseract.js-core', '7.0.0']]) {
  const manifest = JSON.parse(readFileSync(join(root, name, 'package.json'), 'utf8'))
  assert.equal(manifest.name, name)
  assert.equal(manifest.version, version)
  assert.ok(lstatSync(join(root, name, name === 'tesseract.js' ? 'LICENSE.md' : 'LICENSE')).isFile(), `Missing license: ${name}`)
}
const require = createRequire(join(root, 'officeparser/dist/index.js'))
assert.equal(require.resolve('tesseract.js'), join(root, 'tesseract.js/src/index.js'))
assert.equal(require.resolve('tesseract.js-core'), join(root, 'tesseract.js-core/index.js'))
// OfficeParser's PDF imports are separately audited and retained in full. They
// cannot be inferred unused from the top-level LingxiOS PDF.js consumer.
const nestedPdf = 'officeparser/node_modules/pdfjs-dist'
assert.equal(JSON.parse(readFileSync(join(root, nestedPdf, 'package.json'), 'utf8')).version, '6.2.108')
for (const [specifier, path] of [
  ['pdfjs-dist', 'build/pdf.mjs'], ['pdfjs-dist/package.json', 'package.json'],
  ['pdfjs-dist/legacy/build/pdf.mjs', 'legacy/build/pdf.mjs'],
  ['pdfjs-dist/legacy/build/pdf.worker.mjs', 'legacy/build/pdf.worker.mjs'],
]) assert.equal(require.resolve(specifier), join(root, nestedPdf, path), 'OfficeParser PDF resolution changed')

const packages = ['officeparser', 'tesseract.js', 'tesseract.js-core']
const files = directory => {
  const result = []
  const visit = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile()) result.push(child)
      else throw new Error(`Unexpected filesystem entry in audited package: ${child}`)
    }
  }
  visit(directory)
  return result.sort()
}
// Detect additional installed consumers before deleting any shared OCR payload.
const externalConsumers = []
const inspect = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (packages.some(name => path === join(root, name))) continue
    if (entry.isDirectory()) inspect(path)
    else if (entry.isFile() && /\.(?:[cm]?js|json)$/.test(entry.name)
      && /["'](?:officeparser(?:\/[^"']*)?|tesseract\.js(?:-core)?(?:\/[^"']*)?)["']/.test(readFileSync(path, 'utf8'))) {
      externalConsumers.push(relative(root, path).replaceAll('\\', '/'))
    }
  }
}
inspect(root)
assert.deepEqual(externalConsumers.sort(), ['.package-lock.json'], 'Re-audit additional installed OfficeParser/OCR consumers')

const targets = [
  ...['officeparser.browser.iife.js', 'officeparser.browser.mjs', 'officeparser.browser.native-pdf.mjs',
    'officeparser.browser.slim.iife.js', 'officeparser.browser.slim.mjs'].map(name => `officeparser/dist/${name}`),
  ...['tesseract.esm.min.js', 'tesseract.esm.min.js.map', 'tesseract.min.js', 'tesseract.min.js.map',
    'worker.min.js', 'worker.min.js.map'].map(name => `tesseract.js/dist/${name}`),
  ...['', '-lstm', '-simd', '-simd-lstm', '-relaxedsimd', '-relaxedsimd-lstm']
    .flatMap(variant => ['.wasm', '.wasm.js'].map(extension => `tesseract.js-core/tesseract-core${variant}${extension}`)),
].sort()
// Keep all Node entry/glue JS, type declarations, README/SBOM, and every license
// (including minified-browser license sidecars). No upstream file is rewritten.
for (const path of targets) assert.ok(lstatSync(join(root, path)).isFile(), `Missing expected trim target: ${path}`)
assert.ok(targets.every(path => !/(?:LICENSE|NOTICE|COPYING)/i.test(path)))
const inventory = () => packages.flatMap(name => files(join(root, name))).sort().map(path => {
  const content = readFileSync(path)
  return { path: relative(root, path).replaceAll('\\', '/'), bytes: content.length, sha256: sha(content) }
})
const before = inventory()
const removed = before.filter(file => targets.includes(file.path))
const retained = before.filter(file => !targets.includes(file.path))
assert.equal(removed.length, targets.length)
const digest = entries => sha(JSON.stringify(entries))
if (mode === '--apply') {
  for (const path of targets) rmSync(join(root, path))
  assert.equal(digest(inventory()), digest(retained), 'Retained OfficeParser/OCR/PDF files changed')
}
const bytes = entries => entries.reduce((sum, file) => sum + file.bytes, 0)
console.log(JSON.stringify({ mode, packages: ['officeparser@8.2.0', 'tesseract.js@7.0.0', 'tesseract.js-core@7.0.0'],
  auditedExternalConsumers: externalConsumers, beforeContentBytes: bytes(before),
  removedContentBytes: bytes(removed), retainedContentBytes: bytes(retained),
  removedFiles: removed.length, retainedFiles: retained.length,
  removedInventorySha256: digest(removed), retainedInventorySha256: digest(retained),
  retainedNestedPdf: { version: '6.2.108', contentBytes: bytes(before.filter(file => file.path.startsWith(`${nestedPdf}/`))),
    inventorySha256: digest(before.filter(file => file.path.startsWith(`${nestedPdf}/`))) },
  perPackage: packages.map(name => ({ name, beforeContentBytes: bytes(before.filter(file => file.path.startsWith(`${name}/`))),
    removedContentBytes: bytes(removed.filter(file => file.path.startsWith(`${name}/`))) })),
  removedInventory: removed }, null, 2))
