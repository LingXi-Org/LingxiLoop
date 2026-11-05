/** Full local product service for the focused 50-page benchmark.
 * Requires the exact published runtime, an already migrated dedicated database,
 * and the real local Redis/WuKong services. Does not replace product API routes.
 * Private output contains an ephemeral test login cookie; never commit it.
 * Run with: node --import tsx /path/to/scripts/native-artifact-serve.mjs
 *   --root=/path/to/frozen-checkout --port=24411 --api-port=24811
 *   --out=/workspace/scratch/native-artifact-baseline.json
 */
import assert from 'node:assert/strict'
import {serviceFailure}from'./native-artifact-failure.mjs'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { connect } from 'node:net'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'
import { createFixture } from './native-artifact-fixture.mjs'
import { ensureNativeArtifactBucket, nativeArtifactStorageConfiguration, nativeArtifactRuntimeConfiguration, nativeFixtureAsset } from './native-artifact-storage.mjs'

const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')))
const root = resolve(args.root ?? '.'), output = resolve(args.out ?? '/tmp/native-artifact-arm.json')
const port = Number(args.port ?? 24411), apiPort = Number(args['api-port'] ?? 24811)
assert.ok([24411, 24412].includes(port) && apiPort === port + 400, 'only dedicated local acceptance ports are allowed')
let phase = 'database-connect'
const servicePhase = next => {
  phase = next
  if (args.status) writeFileSync(resolve(args.status), JSON.stringify({ phase }) + '\n', { mode: 0o600 })
}
process.on('uncaughtExceptionMonitor', error => {
  const codes = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND', 'ERR_ASSERTION', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOENT'])
  if (args.status) writeFileSync(resolve(args.status), JSON.stringify({ phase, failed: true, code: codes.has(error?.code) ? error.code : 'SERVICE_FAILED',fault:serviceFailure(error) }) + '\n', { mode: 0o600 })
})
servicePhase('database-connect')
const target = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid')
assert.equal(target.hostname, '127.0.0.1', 'only the dedicated local test database is allowed')
assert.equal(target.port, '25432')
assert.match(target.pathname, /^\/native_artifact_(?:baseline|candidate)_test$/)
assert.match(process.env.REDIS_URL ?? '', /^redis:\/\/127\.0\.0\.1:26379\/(?:1|2)$/)
assert.ok(!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'native-artifact-provider-disabled', 'performance service must not inherit provider credentials')
process.chdir(root)
const origin = `https://localhost:${port}`, backend = `http://127.0.0.1:${apiPort}`
const editorBase = `https://artifact.localhost:${port}`
const storageConfiguration = args.format === 'native' ? nativeArtifactStorageConfiguration(process.env, origin) : {
  R2_ENDPOINT: 'http://127.0.0.1:1', R2_BUCKET: 'native-artifact-test', R2_ACCESS_KEY_ID: 'unused-test-only',
  R2_SECRET_ACCESS_KEY: 'unused-test-only', R2_PUBLIC_BASE: `${origin}/native-artifact-fixture`,
  R2_URL_SIGNING_SECRET: 'native-artifact-local-test-only',
}
Object.assign(process.env, {
  NODE_ENV: 'production', PORT: String(apiPort), NATIVE_ARTIFACT_WRITES_ENABLED: 'true',
  OPENAI_API_KEY: 'native-artifact-provider-disabled', OPENAI_BASE_URL: 'http://127.0.0.1:1',
  LINGXILOOP_DISABLE_EMBEDDINGS: '1', WUKONG_USER_TOKEN_SECRET: 'native-artifact-local-test-only',
  WUKONG_API_URL: 'http://127.0.0.1:25001', WUKONG_WS_URL: `${origin.replace('https:', 'wss:')}/native-im`,
  WUKONG_API_TOKEN: 'dev-wukong-api-token', WUKONG_WEBHOOK_SECRET: 'native-artifact-local-test-only',
  LINGXILOOP_GATEWAY_HMAC_SECRET: 'native-artifact-local-test-only',
  LINGXILOOP_INVITE_BASE_URL: origin, LINGXILOOP_PUBLIC_ORIGIN: origin, LINGXILOOP_ARTIFACT_EDITOR_BASE: editorBase,
  ...storageConfiguration,
  ...nativeArtifactRuntimeConfiguration(process.env,origin),
})
if (args.format === 'native') {
  await ensureNativeArtifactBucket(storageConfiguration,origin)
  servicePhase('object-storage-ready')
}
const load = path => import(pathToFileURL(resolve(root, path)).href)
const { pool } = await load('server/src/db/pool.ts')
const { assertMigrationsCurrent } = await load('server/src/db/migrate.ts')
await assertMigrationsCurrent()
servicePhase('database-ready')
const { ensureEducationPlan } = await load('server/src/modules/entitlements/public.ts')
await ensureEducationPlan(pool)
servicePhase('tenant-seeding')
const userId = 'native-artifact-person', companyId = 'native-artifact-school', projectId = 'native-artifact-course', conversationId = 'native-artifact-conversation'
await pool.query("INSERT INTO users(id,email,display_name) VALUES($1,'native-artifact@example.test','Native artifact acceptance') ON CONFLICT(id) DO NOTHING", [userId])
await pool.query("INSERT INTO companies(id,name,slug,type,plan_id) VALUES($1,'Native artifact acceptance',$1,'EDUCATION','plan-education') ON CONFLICT(id) DO NOTHING", [companyId])
await pool.query("INSERT INTO company_memberships(company_id,user_id,role,is_admin) VALUES($1,$2,'TEACHER',TRUE) ON CONFLICT DO NOTHING", [companyId, userId])
await pool.query(`WITH period AS (INSERT INTO company_membership_periods(membership_id,role) SELECT id,role FROM company_memberships WHERE company_id=$1 AND user_id=$2 AND period_id IS NULL RETURNING id,membership_id)
  UPDATE company_memberships member SET period_id=period.id FROM period WHERE member.id=period.membership_id`, [companyId, userId])
await pool.query("INSERT INTO education_contracts(id,company_id,plan_id,status,starts_at,ends_at,seat_limit) VALUES($1,$1,'plan-education','ACTIVE',now()-interval '1 day',now()+interval '30 days',100) ON CONFLICT(id) DO NOTHING", [companyId])
await pool.query("INSERT INTO organization_seats(id,company_id,contract_id,user_id,status) VALUES($1,$1,$1,$2,'ACTIVE') ON CONFLICT(id) DO NOTHING", [companyId, userId])
await pool.query("INSERT INTO projects(id,company_id,kind,name,status,created_by,is_default) VALUES($1,$2,'INSTITUTIONAL_COURSE','Native artifact course','ACTIVE',$3,TRUE) ON CONFLICT(id) DO NOTHING", [projectId, companyId, userId])
await pool.query("INSERT INTO project_memberships(project_id,company_id,user_id,role) VALUES($1,$2,$3,'TEACHER') ON CONFLICT DO NOTHING", [projectId, companyId, userId])
await pool.query("INSERT INTO participants(id,company_id,kind,name,role,initial,avatar_bg,status) VALUES($1,$2,'human','Native artifact acceptance','owner','N','#426b46','avail') ON CONFLICT DO NOTHING", [userId, companyId])
await pool.query("INSERT INTO conversations(id,company_id,project_id,kind,title,members) VALUES($1,$2,$3,'group','Native artifact acceptance',$4::jsonb) ON CONFLICT(id) DO NOTHING", [conversationId, companyId, projectId, JSON.stringify([userId])])
await pool.query("INSERT INTO im_channel_bindings(channel_id,company_id,profile) VALUES($1,$2,$3::jsonb) ON CONFLICT(channel_id) DO NOTHING", [conversationId, companyId, JSON.stringify({ channelType: 2, members: [userId] })])
const { startWebProcess } = await load('server/src/web.ts')
servicePhase('web-starting')
const product = await startWebProcess()
servicePhase('im-starting')
const { wukongClient } = await load('server/src/im/wukong.ts')
await wukongClient().upsertChannel({ channelId: conversationId, channelType: 2, members: [userId] })
servicePhase('auth-starting')
const { gatewayFixture } = await load('server/scripts/slides-acceptance-gateway.mjs')
const gateway = await gatewayFixture({ origin: backend, userId, gatewaySecret: process.env.LINGXILOOP_GATEWAY_HMAC_SECRET })
servicePhase('auth-ready')
const api = async (path, method = 'GET', body) => {
  const response = await fetch(gateway.url + '/api' + path, { method, headers: { cookie: gateway.cookie, 'content-type': 'application/json', 'x-company-id': companyId, 'x-project-id': projectId },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  if (!response.ok) throw Error(`${method} ${path}: HTTP ${response.status} ${(await response.text()).slice(0, 300)}`)
  return response.json()
}
const design = await api(`/conversations/${conversationId}/design`, 'POST')
servicePhase('design-created')
const slides = await api(`/projects/${projectId}/slides`, 'POST', { title: '50 页图片公式验收' })
servicePhase('slides-created')
const documents = { design, slides }, manifests = {}, images = new Map()
for (const [kind, artifact] of Object.entries(documents)) {
  servicePhase(`fixture-${kind}`)
  const urls = Array.from({ length: 50 }, (_, index) => `${origin}/native-artifact-fixture/image-${index + 1}.png`)
  const fixture = createFixture(kind, artifact.id, urls)
  for (const image of fixture.images) images.set('/native-artifact-fixture/' + image.filename, image.bytes)
  manifests[kind] = fixture.manifest
  if (args.format === 'native') {
    if (kind === 'slides') {
      servicePhase('fixture-slides-assets')
      for (const image of fixture.images) {
        const response = await fetch(`${gateway.url}/api/artifacts/${artifact.id}/assets?name=${encodeURIComponent(image.filename)}`, {
          method: 'POST', headers: { cookie: gateway.cookie, 'content-type': image.contentType, 'x-company-id': companyId, 'x-project-id': projectId },
          body: image.bytes, signal: AbortSignal.timeout(30000),
        })
        assert.equal(response.status, 201, 'native fixture image upload must succeed through the actual product route')
        fixture.document.assets[image.id] = nativeFixtureAsset(image, await response.json(), artifact.id)
      }
      // Transport URLs change; semantic fixture content and byte hashes do not.
      fixture.manifest.nativeSha256 = createHash('sha256').update(JSON.stringify(fixture.document)).digest('hex')
    }
    const { prepareBatch } = await load('shared/artifact-operations.ts')
    const current = await api(`/artifacts/${artifact.id}/document`)
    const operations = [...current.document.pageOrder.map(pageId => ({ type: 'page.delete', pageId })),
      ...Object.values(fixture.document.assets).map(asset => ({ type: 'asset.set', asset })),
      { type: 'theme.set', theme: fixture.document.themes['fixture-theme'] },
      { type: 'document.patch', patch: { title: fixture.document.title, themeId: fixture.document.themeId } },
      ...fixture.document.pageOrder.map((id, index) => ({ type: 'page.insert', page: fixture.document.pages[id], index }))]
    await api(`/artifacts/${artifact.id}/operations`, 'POST', prepareBatch(current.document, operations, `fixture-${kind}`))
  } else {
    const grant = await api(`/artifacts/${artifact.id}/editor-grant`, 'POST')
    const path = new URL(grant.url, backend).pathname
    const listing = await (await fetch(backend + path + '_files.json')).json()
    const types = { png: 'image/png', json: 'application/json', js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml' }
    const files = [...fixture.legacyFiles].sort(([a], [b]) => Number(!a.endsWith('.png')) - Number(!b.endsWith('.png')))
      .map(([name, bytes]) => [name, { base64: bytes.toString('base64'), contentType: types[name.split('.').at(-1)] ?? 'text/html', ifMatch: listing.files[name]?.sha256 ?? null }])
    files.push(...Object.entries(listing.files).filter(([name]) => !fixture.legacyFiles.has(name)).map(([name, file]) => [name, { delete: true, ifMatch: file.sha256 }]))
    // Fifty real PNGs exceed the old 16 MiB publish budget. Publish referenced
    // binary assets first, through the real endpoint, in bounded serial batches.
    let batch = {}, batchBytes = 0
    const publish = async () => {
      if (!Object.keys(batch).length) return
      const response = await fetch(backend + path + '__deck/publish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files: batch }) })
      assert.equal(response.status, 200, `legacy fixture publish returned ${response.status}`)
      batch = {}; batchBytes = 0
    }
    for (const [name, file] of files) {
      const size = Buffer.byteLength(JSON.stringify({ [name]: file }))
      assert.ok(size < 8 * 1024 * 1024, 'fixture file exceeds bounded acceptance upload')
      if (batchBytes + size > 8 * 1024 * 1024) await publish()
      batch[name] = file; batchBytes += size
    }
    await publish()
  }
}
const tls = resolve(dirname(output), `native-artifact-tls-${port}`)
await mkdir(tls, { recursive: true })
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-keyout', resolve(tls, 'key.pem'), '-out', resolve(tls, 'cert.pem'), '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,DNS:*.artifact.localhost,DNS:*.localhost'], { stdio: 'ignore' })
const cert = await readFile(resolve(tls, 'cert.pem'))
const publicKey = execFileSync('openssl', ['x509', '-pubkey', '-noout'], { input: cert })
const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: publicKey })
const spki = createHash('sha256').update(der).digest('base64')
const { isolatedEditor } = await load('shared/artifact-editor-origin.ts')
// Raw HTTP transport preserves encoded bytes; Node fetch would auto-decompress.
const rawFetch = request => new Promise((resolveResponse, reject) => {
  const upstream = httpRequest(request.url, { method: request.method, headers: Object.fromEntries(request.headers) }, response => {
    const headers = new Headers()
    for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value)
    resolveResponse(new Response([204, 304].includes(response.statusCode) || request.method === 'HEAD' ? null : Readable.toWeb(response), { status: response.statusCode, headers }))
  })
  upstream.on('error', reject)
  if (request.body) Readable.fromWeb(request.body).pipe(upstream)
  else upstream.end()
})
const server = createHttpsServer({ key: await readFile(resolve(tls, 'key.pem')), cert }, async (request, response) => {
  try {
    const url = new URL(request.url, `https://${request.headers.host}`)
    if (url.hostname === 'localhost' && images.has(url.pathname)) {
      const bytes = images.get(url.pathname)
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': bytes.length, 'Cache-Control': 'public,max-age=31536000,immutable', 'Access-Control-Allow-Origin': '*' }); response.end(bytes); return
    }
    const headers = new Headers()
    for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value)
    const incoming = new Request(url, { method: request.method, headers, ...(!['GET', 'HEAD'].includes(request.method) ? { body: Readable.toWeb(request), duplex: 'half' } : {}) })
    let result = await isolatedEditor(incoming, editorBase, backend, rawFetch)
    if (!result) {
      const upstream = new URL(url.pathname + url.search, url.pathname.startsWith('/api/') ? gateway.url : backend)
      headers.delete('host')
      result = await rawFetch(new Request(upstream, { method: incoming.method, headers, ...(incoming.body ? { body: incoming.body, duplex: 'half' } : {}) }))
    }
    response.writeHead(result.status, Object.fromEntries(result.headers))
    if (result.body) Readable.fromWeb(result.body).pipe(response)
    else response.end()
  } catch (error) { response.writeHead(500, { 'content-type': 'text/plain' }); response.end('Local benchmark transport failed'); console.error(error.message) }
})
server.on('upgrade', (request, socket, head) => {
  const destinationPort = request.url.startsWith('/native-im') ? 25200 : apiPort
  const target = connect(destinationPort, '127.0.0.1', () => {
    const path = request.url.startsWith('/native-im') ? '/' : request.url
    target.write(`${request.method} ${path} HTTP/1.1\r\n${Object.entries(request.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`)
    if (head.length) target.write(head)
    socket.pipe(target).pipe(socket)
  })
  target.on('error', () => socket.destroy())
})
await new Promise(resolveReady => server.listen(port, '127.0.0.1', resolveReady))
const cookies = gateway.cookie.split('; ').map(value => { const index = value.indexOf('='); return { name: value.slice(0, index), value: value.slice(index + 1) } })
const shellUrl = `${origin}/?project=${projectId}&view=conversations&conversation=${conversationId}`
const state = { origin, cookies, spki, shellUrl, shellReadySelector: '[data-design-open-trigger]',
  workbench: {
    design: { url: shellUrl, readySelector: '[data-design-open-trigger]', openSelector: '[data-design-open-trigger]', closeSelector: '#conversation-design-panel button[aria-label="关闭设计"]' },
    slides: { url: `${origin}/?project=${projectId}&view=slides`, readySelector: '[data-slides-page]', openSelector: `[data-artifact-open-trigger="${slides.id}"]`, closeSelector: '[data-testid="artifact-surface"] button[aria-label="返回演示文稿列表"]' },
  },
  urls: { design: shellUrl, slides: `${origin}/?project=${projectId}&view=slides&deck=${slides.id}` }, artifactIds: { design: design.id, slides: slides.id }, companyId, projectId, conversationId,
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), fixtureManifests: manifests,
  authentication: 'real Better Auth sign-in and D1 session through the actual control-plane Worker; product signature/tenant/project checks and PostgreSQL/Redis/WuKong active',
  imageTransport: { design: 'fixed-local-http', slides: args.format === 'native' ? 'authorized-product-api-and-local-s3' : 'legacy-grant-and-postgresql-files' },
  limitation: 'Slides use each editor\'s actual protected image route; Design uses matching fixed local HTTP images. Live model calls excluded. Not a production deployment.' }
await writeFile(output, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 })
servicePhase('ready')
console.log(JSON.stringify({ ready: true, origin, privateState: output, commit: state.commit, kinds: ['design', 'slides'] }))
const stop = async () => { server.closeAllConnections(); server.close(); await gateway.worker.dispose(); await product.stop('benchmark-shutdown'); process.exit() }
process.once('SIGINT', stop); process.once('SIGTERM', stop)
