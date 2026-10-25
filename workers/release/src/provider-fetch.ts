export const PROVIDER_FETCH_PATH = '/v1/bootstrap/mihomo/provider-fetch'
export const MAX_PROVIDER_INPUT_BYTES = 16 * 1024
export const MAX_PROVIDER_BYTES = 2 * 1024 * 1024
export type ProviderFetchEnv = { MIHOMO_ORIGIN_SHA256?: string }
const privateHeaders = { 'cache-control': 'private, no-store, no-transform', 'x-content-type-options': 'nosniff' }
function rejected(error: string, status: number, upstreamStatus?: number) {
  return Response.json({ error, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) }, { status, headers: privateHeaders })
}
async function cancel(body: ReadableStream | null) { try { await body?.cancel() } catch { /* Never expose upstream transport details. */ } }
async function originHash(origin: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(origin))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Caller authenticates ADMIN only. No CI or executor credential may enter here. */
export async function handleProviderFetch(request: Request, env: ProviderFetchEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const endpoint = new URL(request.url)
  if (endpoint.pathname !== PROVIDER_FETCH_PATH || endpoint.search || endpoint.hash) return rejected('PROVIDER_FETCH_NOT_FOUND', 404)
  if (request.method !== 'POST') return rejected('METHOD_NOT_ALLOWED', 405)
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return rejected('PROVIDER_JSON_REQUIRED', 415)
  if (!/^[a-f0-9]{64}$/.test(env.MIHOMO_ORIGIN_SHA256 ?? '')) return rejected('PROVIDER_ORIGIN_NOT_CONFIGURED', 503)
  const length = request.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)) || Number(length) > MAX_PROVIDER_INPUT_BYTES)) return rejected('PROVIDER_INPUT_TOO_LARGE', 413)
  let input: unknown
  try {
    const reader = request.body?.getReader()
    const chunks: Uint8Array[] = []
    let count = 0
    if (!reader) return rejected('PROVIDER_INPUT_INVALID', 400)
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      count += value.byteLength
      if (count > MAX_PROVIDER_INPUT_BYTES) { try { await reader.cancel() } catch {} return rejected('PROVIDER_INPUT_TOO_LARGE', 413) }
      chunks.push(value)
    }
    const bytes = new Uint8Array(count)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch { return rejected('PROVIDER_INPUT_INVALID', 400) }
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== 1 || typeof (input as { url?: unknown }).url !== 'string') return rejected('PROVIDER_INPUT_INVALID', 400)
  const raw = (input as { url: string }).url
  let url: URL
  try { url = new URL(raw) } catch { return rejected('PROVIDER_URL_INVALID', 400) }
  if (url.protocol !== 'https:' || url.username || url.password || raw.includes('#') || /[\x00-\x20\x7f]/.test(raw) || /^https:\/\/[^/?#]*@/i.test(raw)) return rejected('PROVIDER_URL_INVALID', 400)
  if (await originHash(url.origin) !== env.MIHOMO_ORIGIN_SHA256) return rejected('PROVIDER_ORIGIN_MISMATCH', 403)
  let upstream: Response
  try {
    // Never forward caller headers, bearer identity, cookies or a request body.
    // The guarded original URL is fetched once; redirects and retries are absent.
    upstream = await fetcher(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20000) })
  } catch { return rejected('PROVIDER_FETCH_UNAVAILABLE', 502) }
  if (upstream.status >= 300 && upstream.status < 400) { await cancel(upstream.body); return rejected('PROVIDER_REDIRECT_REJECTED', 502, upstream.status) }
  if (!upstream.ok) { await cancel(upstream.body); return rejected('PROVIDER_UPSTREAM_REJECTED', upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502, upstream.status) }
  const declared = upstream.headers.get('content-length')
  if (declared && /^\d+$/.test(declared) && (!Number.isSafeInteger(Number(declared)) || Number(declared) > MAX_PROVIDER_BYTES)) { await cancel(upstream.body); return rejected('PROVIDER_RESPONSE_TOO_LARGE', 413) }
  const reader = upstream.body?.getReader()
  void reader?.closed.catch(() => {})
  const chunks: Uint8Array[] = []
  let count = 0
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        count += value.byteLength
        if (count > MAX_PROVIDER_BYTES) { try { await reader.cancel() } catch {} return rejected('PROVIDER_RESPONSE_TOO_LARGE', 413) }
        chunks.push(value)
      }
    } catch { try { await reader.cancel() } catch {} return rejected('PROVIDER_BODY_UNAVAILABLE', 502) }
  }
  // Keep at most the bounded original chunks until completeness is known.
  // No decode/re-encode or unbounded arrayBuffer is used. A truncated/oversize
  // subscription becomes a sanitized error before any success headers escape.
  let index = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { if (index === chunks.length) controller.close(); else controller.enqueue(chunks[index++]) },
  }, { highWaterMark: 0 })
  return new Response(body, { headers: { ...privateHeaders, 'content-type': 'application/octet-stream', 'content-encoding': 'identity' } })
}
