import test from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest, route } from './index.mjs'
const env = {
  AUTH_ORIGIN_BASE_URL: 'https://admin.example.com', BACKEND_ORIGIN_BASE_URL: 'https://backend.example.com',
  ASSETS: { fetch: async request => new URL(request.url).pathname === '/index.html' ? new Response('<html>SPA</html>') : new Response('missing', { status: 404 }) },
  RETAINED_ASSETS: { get: async () => null },
}
test('API, protected files, dynamic visualize and WebSocket routes never become HTML', async () => {
  for (const path of ['/api', '/api/a', '/uploads/private', '/runtime/visualize/x', '/visualize/x', '/ws', '/files/x', '/webhooks/wukong', '/readyz', '/healthz']) {
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
