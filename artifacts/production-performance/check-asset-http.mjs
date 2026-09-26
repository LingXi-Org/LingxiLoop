// Real HTTP integration check. Failure cases: stale HTML after a release,
// fingerprinted assets expiring too soon, mutable files cached forever, and
// cache headers changing on HEAD, query strings, or conditional requests.
// Run from the repository root:
// node --import tsx --experimental-test-module-mocks artifacts/production-performance/check-asset-http.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mock } from 'node:test'
import express from 'express'

const scriptPath = fileURLToPath(import.meta.url)
const root = resolve(dirname(scriptPath), '../..')
// sendFile's default dotfile protection rejects an absolute path under .codex.
// Production has no such parent; use the OS temporary directory for fixtures.
const fixturePrefix = resolve(tmpdir(), 'LingxiLoop-asset-http-')
const fixtureRoot = await mkdtemp(fixturePrefix)
const sha256 = value => createHash('sha256').update(value).digest('hex')
const html = '<!doctype html><title>Cache integration fixture</title><main>SPA</main>'
const script = 'console.log("fingerprinted fixture");\n'
const stylesheet = '.fixture{color:blue}\n'.repeat(100)
const fixtures = {
  'index.html': html,
  'assets/app-Ab12Cd34.js': script,
  'assets/style-Ab_cd123.css': stylesheet,
  'assets/runtime.js': 'console.log("mutable fixture");\n',
  'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
  'worker-Ab12Cd34.js': 'console.log("root file");\n',
  'assets/nested/tool-Ab12Cd34.js': 'console.log("nested file");\n',
}
for (const [path, body] of Object.entries(fixtures)) {
  const target = resolve(fixtureRoot, 'dist', path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, body)
}

let httpServer
const noop = () => undefined
const asyncNoop = async () => undefined
const mockedModules = {
  'logging.ts': {},
  'env.ts': { env: {
    NODE_ENV: 'production', PORT: 0, CORS_ORIGINS: [],
    INSTANCE_ID: 'asset-http-check', OPENAI_MODEL: 'unused',
  } },
  'api/router.ts': { api: express.Router() },
  'storage.ts': { initializeNativeStorage: noop },
  'ws.ts': { attachWebSocket: server => {
    httpServer = server
    return { clients: new Set(), close: done => done() }
  } },
  'modules/documents/public.ts': { bootDocumentBus: asyncNoop },
  'db/pool.ts': { closeDatabasePools: asyncNoop },
  'redis.ts': { redis: { disconnect: noop }, sub: { disconnect: noop } },
  'modules/email/index.ts': { resendInboundEmailRouter: express.Router() },
  'im/webhook.ts': { wukongWebhookRouter: express.Router() },
  'im/wukong.ts': { wukongClient: noop },
  'modules/knowledge/embedding-proxy.ts': { openNotebookEmbeddingRouter: express.Router() },
  'http/errors.ts': { errorHandler: (error, _request, _response, next) => next(error) },
  'agent-runtime/runtime.ts': {
    lingxiOSControl: asyncNoop, listenLingxiOSControl: asyncNoop, stopLingxiOSControl: asyncNoop,
  },
}
for (const [path, namedExports] of Object.entries(mockedModules)) {
  mock.module(pathToFileURL(resolve(root, 'server/src', path)).href, { namedExports })
}

const immutable = 'public, max-age=31536000, immutable'
const mutable = 'public, max-age=3600'
const noStore = 'no-cache, no-store, must-revalidate'
const cases = [
  { path: '/assets/app-Ab12Cd34.js', cacheControl: immutable, body: script },
  { path: '/assets/app-Ab12Cd34.js?v=1', cacheControl: immutable, body: script },
  { path: '/assets/style-Ab_cd123.css', cacheControl: immutable, body: stylesheet, gzip: true },
  { path: '/assets/style-Ab_cd123.css', method: 'HEAD', cacheControl: immutable, body: '' },
  { path: '/assets/runtime.js', cacheControl: mutable, body: fixtures['assets/runtime.js'] },
  { path: '/favicon.svg', cacheControl: mutable, body: fixtures['favicon.svg'] },
  { path: '/worker-Ab12Cd34.js', cacheControl: mutable, body: fixtures['worker-Ab12Cd34.js'] },
  { path: '/assets/nested/tool-Ab12Cd34.js', cacheControl: mutable, body: fixtures['assets/nested/tool-Ab12Cd34.js'] },
  { path: '/index.html', cacheControl: noStore, body: html },
  { path: '/', cacheControl: noStore, body: html },
  { path: '/projects/cache-check', cacheControl: noStore, body: html },
  { path: '/index.html?v=1', cacheControl: noStore, body: html },
  { path: '/projects/cache-check', method: 'HEAD', cacheControl: noStore, body: '' },
]
const results = []
const previousCwd = process.cwd()
let service
try {
  const { startWebProcess } = await import(pathToFileURL(resolve(root, 'server/src/web.ts')).href)
  process.chdir(fixtureRoot)
  service = await startWebProcess()
  const address = httpServer.address()
  assert.ok(address && typeof address !== 'string', 'real HTTP server must listen on a port')
  const origin = `http://127.0.0.1:${address.port}`
  const check = async (item, options = {}) => {
    const response = await fetch(`${origin}${item.path}`, {
      method: item.method ?? 'GET',
      headers: { 'accept-encoding': item.gzip ? 'gzip' : 'identity', ...options.headers },
      cache: 'force-cache',
    })
    const body = await response.text()
    const actual = {
      method: item.method ?? 'GET', path: item.path, status: response.status,
      cacheControl: response.headers.get('cache-control'),
      contentType: response.headers.get('content-type'),
      contentEncoding: response.headers.get('content-encoding'),
      etag: response.headers.get('etag'),
      bodyBytes: Buffer.byteLength(body), bodySha256: sha256(body),
    }
    results.push({ ...actual, expectedStatus: item.status ?? 200, expectedCacheControl: item.cacheControl })
    assert.equal(actual.status, item.status ?? 200, `${item.path} status`)
    assert.equal(actual.cacheControl, item.cacheControl, `${item.path} Cache-Control`)
    assert.equal(body, item.body, `${item.path} body`)
    if (item.gzip) assert.equal(actual.contentEncoding, 'gzip', 'real compression middleware remains active')
    return actual
  }
  for (const item of cases) await check(item)
  await check({ ...cases[0], status: 304, body: '' }, { headers: { 'if-none-match': results[0].etag } })
  await check({ ...cases[8], status: 304, body: '' }, { headers: { 'if-none-match': results[8].etag } })
  await check({ ...cases[10], status: 304, body: '' }, { headers: { 'if-none-match': results[10].etag } })
} finally {
  if (service) await service.stop('asset-http-check-complete')
  process.chdir(previousCwd)
  mock.restoreAll()
  assert.ok(resolve(fixtureRoot).startsWith(fixturePrefix) && dirname(fixtureRoot) + sep === resolve(tmpdir()) + sep)
  await rm(fixtureRoot, { recursive: true, force: true })
}

const artifact = {
  passed: true,
  generatedAt: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  implementation: 'server/src/web.ts:startWebProcess',
  implementationSha256: sha256(await readFile(resolve(root, 'server/src/web.ts'))),
  command: 'node --import tsx --experimental-test-module-mocks artifacts/production-performance/check-asset-http.mjs',
  nodeVersion: process.version,
  method: 'Real production-mode Express/compression/http server on an ephemeral port, loopback HTTP fetch. Only unrelated infrastructure startup modules are mocked; static serving, cache headers, compression, ETags and lifecycle are the actual implementation.',
  fixtureDirectory: 'Isolated OS temporary directory (removed after the check)',
  mockedModules: Object.keys(mockedModules).map(path => `server/src/${path}`),
  checks: results,
}
await writeFile(resolve(root, 'artifacts/production-performance/asset-http.json'), `${JSON.stringify(artifact, null, 2)}\n`)
console.log(`Passed ${results.length} real HTTP cache checks; artifact: artifacts/production-performance/asset-http.json`)
