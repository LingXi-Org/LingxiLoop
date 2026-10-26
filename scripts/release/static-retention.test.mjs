import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { createR2RequestPacer, inventory, putImmutableObject, retainStaticAssets, RETENTION_CONCURRENCY, R2_REQUEST_INTERVAL_MS } from '../release-static.mjs'
const execute = promisify(execFile)
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`
const script = fileURLToPath(new URL('../release-static.mjs', import.meta.url))
const options = { account: 'fixture-account', bucket: 'fixture-bucket', token: 'fixture-secret' }
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
function virtualPacer() {
  let now = 0
  return { requestPacer: createR2RequestPacer({ now: () => now, wait: async ms => { now += ms; await tick() } }), now: () => now }
}
async function withAssets(count, run) {
  const directory = await mkdtemp(join(tmpdir(), 'lingxi-retention-pool-'))
  try {
    await mkdir(join(directory, 'assets'))
    for (let i = 0; i < count; i++) await writeFile(join(directory, `assets/file${i}-12345678.js`), `asset${i}`)
    await writeFile(join(directory, 'index.html'), 'not an immutable chunk')
    await run(directory, inventory(directory))
  } finally { await rm(directory, { recursive: true, force: true }) }
}
test('three jobs overlap slow reads, never exceed the fixed bound, and leave inventory ordering unchanged', async () => {
  await withAssets(6, async (directory, files) => {
    const original = JSON.stringify(files), progress = [], pending = []
    let active = 0, maximum = 0
    const retained = retainStaticAssets(directory, files, { ...options, requestPacer: begin => begin(), fetcher: async (url, init) => {
      assert.equal(init.redirect, 'error'); assert.ok(init.signal instanceof AbortSignal)
      const ordinal = Number(new URL(url).pathname.match(/file(\d+)-/)[1])
      active++; maximum = Math.max(maximum, active)
      const item = deferred(); pending.push(item)
      await item.promise; active--
      return new Response(`asset${ordinal}`)
    } }, value => progress.push(value))
    await tick(); assert.equal(pending.length, 3); assert.equal(active, 3)
    for (let index = 0; index < 6; index++) { pending[index].resolve(); await tick() }
    await retained
    assert.equal(maximum, RETENTION_CONCURRENCY); assert.equal(active, 0)
    assert.equal(JSON.stringify(files), original)
    assert.deepEqual(progress.map(item => item.completed), [0, 1, 2, 3, 4, 5, 6])
    assert.ok(progress.every(item => Object.keys(item).sort().join(',') === 'completed,total' && item.total === 6))
  })
})
test('GET and PUT share one350ms cadence, exact original request counts, bytes and cache metadata', async () => {
  await withAssets(3, async (directory, files) => {
    const clock = virtualPacer(), requests = []
    await retainStaticAssets(directory, files, { ...options, requestPacer: clock.requestPacer, fetcher: async (url, init) => {
      requests.push({ start: clock.now(), method: init.method || 'GET' })
      assert.equal(init.redirect, 'error'); assert.equal(init.headers.authorization, 'Bearer fixture-secret')
      if (!init.method) return new Response(null, { status: 404 })
      const ordinal = Number(new URL(url).pathname.match(/file(\d+)-/)[1])
      assert.equal(Buffer.from(init.body).toString(), `asset${ordinal}`)
      assert.equal(init.headers['content-type'], 'text/javascript')
      assert.equal(init.headers['cache-control'], 'public, max-age=31536000, immutable')
      return new Response(null, { status: 200 })
    } })
    assert.equal(requests.filter(item => item.method === 'GET').length, 3)
    assert.equal(requests.filter(item => item.method === 'PUT').length, 3)
    for (let i = 1; i < requests.length; i++) assert.ok(requests[i].start - requests[i - 1].start >= R2_REQUEST_INTERVAL_MS)
  })
})
test('failure stops new assets and queued PUTs, awaits all in-flight reads, and preserves the first denial', async () => {
  await withAssets(6, async (directory, files) => {
    const pending = [], methods = []; let settled = false
    const retained = retainStaticAssets(directory, files, { ...options, requestPacer: begin => begin(), fetcher: async (_url, init) => {
      methods.push(init.method || 'GET'); const item = deferred(); pending.push(item); return item.promise
    } }).finally(() => { settled = true })
    const rejected = assert.rejects(retained, /R2 lookup failed: HTTP 403/)
    await tick(); assert.equal(pending.length, 3)
    pending[0].resolve(new Response(null, { status: 403 })); await tick()
    assert.equal(settled, false); assert.equal(pending.length, 3)
    pending[1].resolve(new Response(null, { status: 404 })); await tick()
    assert.equal(settled, false); assert.deepEqual(methods, ['GET', 'GET', 'GET'])
    pending[2].resolve(new Response('asset2'))
    await rejected; assert.equal(settled, true)
    assert.deepEqual(methods, ['GET', 'GET', 'GET'])
  })
})
test('a denial also stops already queued paced starts; 401/403/429 are not retried', async () => {
  for (const status of [401, 403, 429]) await withAssets(4, async (directory, files) => {
    const clock = virtualPacer(), methods = []
    await assert.rejects(retainStaticAssets(directory, files, { ...options, requestPacer: clock.requestPacer, fetcher: async (_url, init) => {
      methods.push(init.method || 'GET'); return new Response(null, { status })
    } }), new RegExp(`HTTP ${status}`))
    assert.deepEqual(methods, ['GET'])
  })
})
test('existing bytes are verified before reuse; conflict, body loss, redirects and thrown request errors never upload or leak URLs/secrets', async () => {
  const key = 'chunks/https://private.invalid/token-fixture-secret', bytes = Buffer.from('expected')
  for (const [fetcher, error] of [
    [async () => new Response('different'), 'IMMUTABLE_ARTIFACT_CONFLICT'],
    [async () => { throw Error('https://private.invalid/fixture-secret') }, 'R2_REQUEST_UNCONFIRMED'],
    [async () => ({ ok: true, arrayBuffer: async () => { throw Error('fixture-secret https://private.invalid') } }), 'R2_READ_UNCONFIRMED'],
    [async () => new Response(null, { status: 302, headers: { location: 'https://private.invalid/fixture-secret' } }), 'R2 lookup failed: HTTP 302'],
  ]) {
    const methods = []
    await assert.rejects(putImmutableObject(key, bytes, { ...options, requestPacer: begin => begin(), fetcher: async (url, init) => { methods.push(init.method || 'GET'); return fetcher(url, init) } }), actual => actual.message === error && !/fixture-secret|https:\/\//.test(actual.message))
    assert.deepEqual(methods, ['GET'])
  }
  for (const status of [401, 403, 429]) {
    const methods = []
    await assert.rejects(putImmutableObject(key, bytes, { ...options, requestPacer: begin => begin(), fetcher: async (_url, init) => { methods.push(init.method || 'GET'); return new Response(null, { status: init.method ? status : 404 }) } }), new RegExp(`HTTP ${status}`))
    assert.deepEqual(methods, ['GET', 'PUT'])
  }
  let reads = 0
  await putImmutableObject(key, bytes, { ...options, requestPacer: begin => begin(), fetcher: async () => { reads++; return new Response(bytes) } })
  assert.equal(reads, 1)
})
test('actual inventory CLI overlaps three asset reads while preserving every inventory and configuration fingerprint byte', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lingxi-static-retention-'))
  try {
    const initial = {
      'dist/assets/a-12345678.js': 'first asset', 'dist/assets/b-12345678.css': 'second asset', 'dist/assets/c-12345678.svg': 'third asset', 'dist/index.html': '<html>baseline</html>',
      'worker/wrangler.jsonc': '{"name":"fixture-worker"}', 'worker/src/index.mjs': 'export default {}', 'worker/src/index.test.mjs': 'excluded test', 'server/build/admin-control/package-lock.json': '{"fixture":"lock"}',
      'third_party/assistant-ui/streaming-text/LICENSE': 'license one', 'third_party/assistant-ui-elements/LICENSE': 'license two', 'third_party/react-chat-elements/reply-message/LICENSE': 'license three',
    }
    for (const [path, bytes] of Object.entries(initial)) { await mkdir(dirname(join(directory, path)), { recursive: true }); await writeFile(join(directory, path), bytes) }
    await writeFile(join(directory, 'fetch-fixture.mjs'), `import {readFileSync} from 'node:fs';
let count=0, release; const firstWave=new Promise(resolve=>release=resolve);
globalThis.fetch=async(url,init)=>{
 if(init.method==='PUT')throw Error('fixture objects must be reused');
 if(init.redirect!=='error')throw Error('redirect guard missing');
 count++;if(count===3)release();
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('serial retention did not dispatch three reads')),1800);firstWave.then(()=>{clearTimeout(timer);resolve()})});
 const key=decodeURIComponent(new URL(url).pathname.split('/objects/')[1]);
 return new Response(readFileSync('dist/'+key.slice('chunks/'.length)));
};`)
    const { stdout } = await execute(process.execPath, ['--import', join(directory, 'fetch-fixture.mjs'), script, 'inventory', 'main-frontend', 'dist', 'worker/wrangler.jsonc'], {
      cwd: directory, timeout: 10000, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: 'fixture-account', CLOUDFLARE_API_TOKEN: 'fixture-token', RELEASE_ARTIFACT_BUCKET: 'fixture-bucket', BACKEND_ORIGIN_BASE_URL: 'https://backend.fixture.invalid', AUTH_ORIGIN_BASE_URL: 'https://admin.fixture.invalid' },
    })
    assert.deepEqual(stdout.trim().split('\n'), ['Retained assets: 0/3', 'Retained assets: 3/3'])
    const fixture = {
      '@worker/server/build/admin-control/package-lock.json': initial['server/build/admin-control/package-lock.json'], '@worker/worker/src/index.mjs': initial['worker/src/index.mjs'], '@worker/worker/wrangler.jsonc': initial['worker/wrangler.jsonc'],
      'assets/a-12345678.js': initial['dist/assets/a-12345678.js'], 'assets/b-12345678.css': initial['dist/assets/b-12345678.css'], 'assets/c-12345678.svg': initial['dist/assets/c-12345678.svg'], 'index.html': initial['dist/index.html'],
      'licenses/assistant-ui-elements.txt': 'license two', 'licenses/assistant-ui-streaming-text.txt': 'license one', 'licenses/react-chat-elements-reply-message.txt': 'license three',
    }
    const files = Object.entries(fixture).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({ path, hash: hash(bytes), bytes: Buffer.byteLength(bytes) }))
    const effectiveVars = { BACKEND_ORIGIN_BASE_URL: 'https://backend.fixture.invalid', AUTH_ORIGIN_BASE_URL: 'https://admin.fixture.invalid' }
    files.push({ path: '@effective-vars', hash: hash(JSON.stringify(effectiveVars)), bytes: Buffer.byteLength(JSON.stringify(effectiveVars)) })
    const expected = { files, hash: hash(JSON.stringify(files)), configurationVersion: `cfg-${hash(JSON.stringify({ config: hash(initial['worker/wrangler.jsonc']), effectiveVars })).slice(7, 31)}` }
    assert.equal(await readFile(join(directory, 'release-artifacts/main-frontend/inventory.json'), 'utf8'), JSON.stringify(expected, null, 2))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
