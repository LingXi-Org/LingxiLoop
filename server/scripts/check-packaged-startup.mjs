import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// The final stage is Debian/glibc x64. Confirm the native GNU Canvas path
// still works after the optional musl-only binary has been removed.
const canvasRoot = 'node_modules/@napi-rs'
assert.ok(process.report.getReport().header.glibcVersionRuntime, 'Expected glibc runtime')
assert.equal(process.arch, 'x64', 'Expected linux/amd64 Canvas runtime')
assert.equal(existsSync(join(canvasRoot, 'canvas-linux-x64-musl/skia.linux-x64-musl.node')), false,
  'Unexpected musl Canvas binary in glibc image')
assert.equal(existsSync(join(canvasRoot, 'canvas-linux-x64-gnu/skia.linux-x64-gnu.node')), true,
  'Missing GNU Canvas binary')
assert.equal(existsSync(join(canvasRoot, 'canvas/LICENSE')), true, 'Missing Canvas license')
const require = createRequire(import.meta.url)
const { createCanvas } = require('@napi-rs/canvas')
const canvas = createCanvas(1, 1)
canvas.getContext('2d').fillRect(0, 0, 1, 1)
assert.ok(canvas.toBuffer('image/png').length > 0, 'Canvas drawing failed')
assert.ok(Object.hasOwn(require.cache, join(process.cwd(), canvasRoot,
  'canvas-linux-x64-gnu/skia.linux-x64-gnu.node')), 'Canvas did not load GNU native binding')

// The server deps stage removes only PDF viewer assets and unused generic maps.
// Keep future product imports from silently depending on those removed paths.
const pdfPackage = 'node_modules/pdfjs-dist'
for (const path of [
  'web', 'legacy/web', 'build/pdf.mjs.map',
  'build/pdf.worker.mjs.map', 'build/pdf.sandbox.mjs.map',
]) assert.equal(existsSync(join(pdfPackage, path)), false, `Unexpected PDF.js viewer payload: ${path}`)
for (const path of ['LICENSE', 'package.json', 'build/pdf.mjs', 'legacy/build/pdf.mjs',
  'legacy/build/pdf.worker.mjs', 'cmaps/LICENSE', 'standard_fonts/LICENSE_FOXIT',
  'wasm/LICENSE_PDFJS_JBIG2']) {
  assert.equal(existsSync(join(pdfPackage, path)), true, `Missing PDF.js runtime resource: ${path}`)
}
const inspectSources = directory => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) inspectSources(path)
    else if (entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)) {
      assert.doesNotMatch(readFileSync(path, 'utf8'), /pdfjs-dist\/(?:web|legacy\/web)\b/,
        `Server source imports a removed PDF.js viewer path: ${path}`)
    }
  }
}
inspectSources('server/src')

// Run the production launcher against the files in this package, not a source
// checkout. Static imports must link before the existing fail-fast env check.
// No credentials, .env file, database, Redis, or provider are needed.
for (const service of ['web', 'worker']) {
  const result = spawnSync(process.execPath, [
    fileURLToPath(import.meta.resolve('tsx/cli')), `server/src/bin/${service}.ts`,
  ], {
    encoding: 'utf8',
    timeout: 20_000,
    env: { NODE_ENV: 'production', DOTENV_CONFIG_PATH: '/dev/null', TSX_DISABLE_CACHE: '1' },
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  assert.ifError(result.error)
  assert.equal(result.status, 1, `${service}: expected the no-credentials environment guard`)
  assert.match(output, /\[env\] Missing required environment variable: DATABASE_URL/,
    `${service}: packaged entrypoint failed before environment validation\n${output}`)
  assert.doesNotMatch(output, /ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError/)
  console.log(`${service}: packaged entrypoint linked; stopped at environment validation`)
}
