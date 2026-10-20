// Keep the Debian/glibc Canvas binding used by server-side PDF.js. The pinned
// optional musl binding cannot be selected by this exact platform/loader.
// Default is a dry run; the Docker deps stage supplies --apply.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'

const [rootArg, action] = process.argv.slice(2)
assert.ok(rootArg && (action === undefined || action === '--apply'),
  'Usage: node prune-glibc-canvas-runtime.mjs NODE_MODULES [--apply]')
const root = resolve(rootArg)
const packagePath = name => join(root, '@napi-rs', name)
const parent = packagePath('canvas')
const gnu = packagePath('canvas-linux-x64-gnu')
const musl = packagePath('canvas-linux-x64-musl')
const gnuBinary = join(gnu, 'skia.linux-x64-gnu.node')
const muslBinary = join(musl, 'skia.linux-x64-musl.node')
const loader = join(parent, 'js-binding.js')
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex')
const version = path => JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')).version

assert.equal(process.platform, 'linux', 'Canvas trim requires Linux')
assert.equal(process.arch, 'x64', 'Canvas trim requires x64')
assert.ok(process.report.getReport().header.glibcVersionRuntime,
  'Canvas trim requires the current glibc runtime')
for (const path of [parent, gnu, musl]) {
  assert.ok(lstatSync(path).isDirectory(), `Expected installed package directory: ${path}`)
  assert.equal(version(path), '1.0.8', `Canvas package changed: ${path}`)
}
assert.deepEqual(readdirSync(musl).sort(),
  ['README.md', 'package.json', 'skia.linux-x64-musl.node'].sort(),
  'musl package layout changed; review before trimming')
assert.ok(existsSync(join(parent, 'LICENSE')), 'Missing Canvas license')
assert.equal(sha256(loader), 'be59c8d4888630cf88656f65b63dd150e60bdb1d5eab0ba5b47c0a6cb389533e',
  'Canvas libc loader changed; review branch selection')
assert.equal(sha256(gnuBinary), '738cf404fc3422bd1f57dae002f19b2f4f41d2dd5614e8023e0b64d7ef3a8e10',
  'GNU binding changed; review native runtime')
assert.ok(lstatSync(muslBinary).isFile(), 'Expected musl binding file')
assert.equal(sha256(muslBinary), '00790d510c990e1972f33d3c587d3d9faccddd4bf49c2bbe1938a05c40844034',
  'musl binding changed; review before trimming')

// Run the installed loader on the actual build platform before deletion.
const require = createRequire(join(root, '..', 'package.json'))
const { createCanvas } = require('@napi-rs/canvas')
const canvas = createCanvas(1, 1)
canvas.getContext('2d').fillRect(0, 0, 1, 1)
assert.ok(canvas.toBuffer('image/png').length > 0, 'Canvas drawing failed')
assert.ok(Object.hasOwn(require.cache, gnuBinary), 'Canvas did not load the GNU binding')
assert.ok(!Object.hasOwn(require.cache, muslBinary), 'Canvas unexpectedly loaded the musl binding')

const receipt = {
  platform: 'linux/x64/glibc', packageVersion: '1.0.8',
  removedPath: 'node_modules/@napi-rs/canvas-linux-x64-musl/skia.linux-x64-musl.node',
  regularBytes: lstatSync(muslBinary).size,
  sha256: '00790d510c990e1972f33d3c587d3d9faccddd4bf49c2bbe1938a05c40844034',
  applied: action === '--apply',
}
if (action === '--apply') {
  unlinkSync(muslBinary)
  assert.ok(!existsSync(muslBinary), 'musl binding remains after trim')
  assert.ok(existsSync(gnuBinary), 'GNU binding missing after trim')
}
console.log(JSON.stringify(receipt))
