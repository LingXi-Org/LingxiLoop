import test from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest, route } from './index.mjs'
const env = {
  AUTH_ORIGIN_BASE_URL: 'https://admin.example.com', BACKEND_ORIGIN_BASE_URL: 'https://backend.example.com',
  ASSETS: { fetch: async request => {
    const path = new URL(request.url).pathname
    if (path === '/') return new Response('<html>SPA</html>')
    if (path === '/index.html') return new Response(null, { status: 307, headers: { location: '/' } })
    return new Response('missing', { status: 404 })
  } },
  RETAINED_ASSETS: { get: async () => null },
}
test('API, protected files, dynamic visualize, artifact editor and WebSocket routes never become HTML', async () => {
  for (const path of ['/api', '/api/a', '/uploads/private', '/runtime/visualize/x', '/visualize/x', '/artifact-editor/design/grant/', '/_blob/0123456789abcdef0123456789abcdef', '/ws', '/files/x', '/webhooks/wukong', '/readyz', '/healthz']) {
    assert.notEqual(route(path), 'asset')
    let called
    const request = new Request(`https://loop.example.com${path}?a=1`, { headers: { cookie: 'session=secret', authorization: 'Bearer user', 'x-lingxiloop-gateway': 'old.signature', 'last-event-id': '42' } })
    const stream = new Response('data: event\n\n', { headers: { 'content-type': 'text/event-stream', 'set-cookie': 'a=b' } })
    const response = await handleRequest(request, env, async req => { called = req; return stream })
    assert.equal(response, stream)
    assert.equal(called.headers.get('cookie'), 'session=secret')
    assert.equal(called.headers.get('last-event-id'), '42')
    assert.equal(new URL(called.url).host, path.startsWith('/api') ? 'admin.example.com' : 'backend.example.com')
    assert.equal(called.headers.get('x-lingxiloop-gateway'), path.startsWith('/api') ? null : 'old.signature')
    assert.equal(new URL(called.url).search, '?a=1')
  }
})
test('upstream loop, hop loops and internal endpoints fail closed', async () => {
  assert.equal((await handleRequest(new Request('https://loop.example.com/api'), { ...env, AUTH_ORIGIN_BASE_URL: 'https://loop.example.com' })).status, 503)
  assert.equal((await handleRequest(new Request('https://loop.example.com/api', { headers: { 'x-lingxiloop-static-hop': '1' } }), env)).status, 508)
  assert.equal((await handleRequest(new Request('https://loop.example.com/%69nternal/x'), env)).status, 404)
})
test('only HTML navigation receives SPA; old hashed chunks come from retained R2', async () => {
  const navigation = await handleRequest(new Request('https://loop.example.com/chat/1', { headers: { accept: 'text/html' } }), env)
  assert.equal(await navigation.text(), '<html>SPA</html>')
  assert.equal(navigation.headers.get('cache-control'), 'no-store')
  const retained = { ...env, RETAINED_ASSETS: { get: async key => { assert.equal(key, 'chunks/assets/index-12345678.js'); return { body: 'old chunk', httpEtag: '"hash"', writeHttpMetadata: headers => headers.set('content-type', 'text/javascript') } } } }
  assert.equal(await (await handleRequest(new Request('https://loop.example.com/assets/index-12345678.js'), retained)).text(), 'old chunk')
  assert.equal((await handleRequest(new Request('https://loop.example.com/assets/missing.js', { headers: { accept: 'text/html' } }), env)).status, 404)
})
test('WebSocket 101 response is passed through without reconstructing it', async () => {
  const upgrade = { status: 101, webSocket: {} }
  assert.equal(await handleRequest(new Request('https://loop.example.com/ws', { headers: { upgrade: 'websocket' } }), env, async request => { assert.equal(request.headers.get('upgrade'), 'websocket'); return upgrade }), upgrade)
})
test('auth service binding keeps the public request origin for password and sign-in flows', async () => {
  let observed
  const response = await handleRequest(new Request('https://loop.example.com/api/auth/sign-in/email', { method: 'POST', headers: { cookie: 'session=secret', 'content-type': 'application/json' }, body: '{}' }), { ...env, AUTH: { fetch: async request => { observed = request; return new Response('auth') } } })
  assert.equal(observed.url, 'https://loop.example.com/api/auth/sign-in/email')
  assert.equal(await observed.text(), '{}')
  assert.equal(observed.headers.get('cookie'), 'session=secret')
  assert.equal(await response.text(), 'auth')
})

test('fixed visualize assets are anonymous immutable CORS resources, including retained old hashes', async () => {
  const path=`/assets/visualize-${'a'.repeat(64)}.js`
  for (const retained of [false,true]) {
    const fixture={...env,
      ASSETS:{fetch:async()=>retained ? new Response('missing',{status:404}) : new Response('public renderer',{headers:{'content-type':'text/javascript'}})},
      RETAINED_ASSETS:{get:async key=>{assert.equal(key,`chunks${path}`);return {body:'public renderer',httpEtag:'"hash"',writeHttpMetadata:headers=>headers.set('content-type','text/javascript')}}}}
    const response=await handleRequest(new Request(`https://loop.example.com${path}`,{headers:{origin:'null'}}),fixture)
    assert.equal(response.status,200)
    assert.equal(response.headers.get('cache-control'),'public, max-age=31536000, immutable')
    assert.equal(response.headers.get('access-control-allow-origin'),'*')
    assert.equal(response.headers.get('x-content-type-options'),'nosniff')
    assert.equal(await response.text(),'public renderer')
  }
})
import { artifactEditorOrigin } from '../../../shared/artifact-editor-origin.ts'

test('executable Design origins are grant-bound and never proxy authenticated product requests', async () => {
  const base = 'https://artifact.example.com', token = 'signed.grant'
  const origin = await artifactEditorOrigin(token, base)
  const isolated = { ...env, ARTIFACT_EDITOR_BASE: base }
  let calls = 0
  const fetcher = async request => {
    calls++
    assert.equal(new URL(request.url).origin, env.BACKEND_ORIGIN_BASE_URL)
    for (const header of ['cookie', 'authorization', 'x-lingxiloop-gateway']) assert.equal(request.headers.get(header), null)
    return new Response('<html>editor</html>', { headers: { 'set-cookie': 'private=value',
      'content-security-policy': "sandbox allow-scripts allow-downloads; default-src 'self'" } })
  }
  const result = await handleRequest(new Request(`${origin}/artifact-editor/design/${token}/`, { headers: {
    cookie: 'session=private', authorization: 'Bearer private', 'x-lingxiloop-gateway': 'private',
  } }), isolated, fetcher)
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('set-cookie'), null)
  assert.match(result.headers.get('content-security-policy'), /^sandbox allow-scripts allow-same-origin /)
  for (const path of ['/api/auth/session', '/', '/assets/main.js', '/artifact-editor/design/other.grant/', '/artifact-editor/slides/signed.grant/']) {
    assert.equal((await handleRequest(new Request(origin + path), isolated, fetcher)).status, 404)
  }
  assert.equal((await handleRequest(new Request(`${origin}/artifact-editor/design/${token}/project/sw.js`, { headers: { 'service-worker': 'script' } }), isolated, fetcher)).status, 404)
  assert.equal(calls, 1)
  const main = await handleRequest(new Request(`https://loop.example.com/artifact-editor/design/${token}/`), isolated,
    async () => new Response('editor', { headers: { 'content-security-policy': 'sandbox allow-scripts allow-downloads' } }))
  assert.doesNotMatch(main.headers.get('content-security-policy'), /allow-same-origin/)
  const data = await handleRequest(new Request(`${origin}/artifact-editor/design/${token}/project/Main.dc.html`), isolated,
    async () => new Response('data', { headers: { 'content-security-policy': "sandbox; default-src 'none'" } }))
  assert.equal(data.headers.get('content-security-policy'), "sandbox; default-src 'none'")
})
