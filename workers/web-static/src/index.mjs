// The auth Worker signs product API requests. It must in turn use the separate
// backend hostname; neither upstream may resolve back to the public SPA route.
const dynamic = /^\/(?:api|uploads|runtime|ws|files|visualize|webhooks|readyz|healthz)(?:\/|$)/i
const internal = /^\/(?:internal)(?:\/|$)/i
const immutable = /^\/assets\/[\w./-]+-[\w-]{8,}\.[\w.]+$/
export { immutable }
export function route(path) {
  if (internal.test(path)) return 'deny'
  if (/^\/api(?:\/|$)/i.test(path)) return 'auth'
  return dynamic.test(path) ? 'backend' : 'asset'
}
function upstream(value, requestUrl, env) {
  const origin = new URL(value)
  const publicHosts = [requestUrl.host, ...(env.PUBLIC_HOSTS || '').split(',')].map(x => x.trim().toLowerCase())
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || publicHosts.includes(origin.host.toLowerCase())) throw new Error('invalid independent upstream')
  return new URL(requestUrl.pathname + requestUrl.search, origin)
}
export async function handleRequest(request, env, fetcher = fetch) {
  const url = new URL(request.url)
  let path
  try { path = decodeURIComponent(url.pathname) } catch { return new Response('Invalid path', { status: 400 }) }
  if (/[\\\x00-\x1f]/.test(path)) return new Response('Invalid path', { status: 400 })
  const target = route(path)
  if (target === 'deny') return new Response('Not found', { status: 404 })
  if (target !== 'asset') {
    if (request.headers.has('x-lingxiloop-static-hop')) return new Response('Proxy loop', { status: 508 })
    let destination
    try { destination = upstream(target === 'auth' ? env.AUTH_ORIGIN_BASE_URL : env.BACKEND_ORIGIN_BASE_URL, url, env) }
    catch { return new Response('Independent upstream is not configured', { status: 503 }) }
    const headers = new Headers(request.headers)
    headers.delete('host')
    // Browser-supplied gateway assertions are never trusted by this ingress.
    // /api is authenticated and signed afresh by the auth Worker.
    if (target === 'auth') headers.delete('x-lingxiloop-gateway')
    headers.set('x-lingxiloop-static-hop', '1')
    headers.set('x-forwarded-host', url.host)
    headers.set('x-forwarded-proto', 'https')
    const response = await (target === 'auth' && env.AUTH ? env.AUTH.fetch.bind(env.AUTH) : fetcher)(new Request(target === 'auth' && env.AUTH ? url : destination, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual', ...(request.body ? { duplex: 'half' } : {}) }))
    // Returning the original response preserves 101/webSocket and streaming
    // bodies, Set-Cookie, redirects, range/ETag and gateway HMAC semantics.
    return response
  }
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
  const response = await env.ASSETS.fetch(request)
  if (response.status === 404 && immutable.test(url.pathname)) {
    const object = await env.RETAINED_ASSETS.get(`chunks${url.pathname}`)
    if (object) {
      const headers = new Headers({ 'cache-control': 'public, max-age=31536000, immutable', etag: object.httpEtag })
      object.writeHttpMetadata(headers)
      return new Response(request.method === 'HEAD' ? null : object.body, { headers })
    }
    return response
  }
  if (response.status !== 404) {
    const headers = new Headers(response.headers)
    if (immutable.test(url.pathname)) headers.set('cache-control', 'public, max-age=31536000, immutable')
    else if (headers.get('content-type')?.includes('text/html')) headers.set('cache-control', 'no-store')
    return new Response(response.body, { status: response.status, headers })
  }
  if (/\.[^/]+$/.test(path) || !request.headers.get('accept')?.includes('text/html')) return response
  const index = await env.ASSETS.fetch(new Request(new URL('/index.html', url), request))
  const headers = new Headers(index.headers)
  headers.set('cache-control', 'no-store')
  return new Response(index.body, { status: index.status, headers })
}
export default { fetch(request, env) { return handleRequest(request, env) } }
