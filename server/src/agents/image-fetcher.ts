/**
 * Materialize an image URL into a base64 `data:` URL safe to ship as OpenAI
 * `input_image`.
 *
 * Why this exists — the incident (2026-05-14):
 *
 *   OpenAI's Responses API treats `image_url` as fail-loud — they fetch the
 *   URL server-side, and a single 404 / wrong content-type / timeout /
 *   oversize image rejects the *whole* POST with HTTP 400. Combined with
 *   sub2api wrapping that as 502 and our agent runtime having no retry, one
 *   rotten avatar bricked every agent turn in any conversation referencing
 *   it. Determ. failure loop, hours of dead agents.
 *
 * The fix: GET the bytes here ourselves with strict caps (size / timeout /
 * content-type / SSRF guard), encode base64, hand OpenAI a self-contained
 * `data:` URL. OpenAI never touches the network for our images again. Any
 * fetch failure on our side → we drop the image silently → turn still runs
 * (the model loses one face, gains 0% chance of bricking).
 *
 * Tradeoff vs. HEAD-probe + raw URL: ~33% larger request body to OpenAI
 * (base64 overhead). Image *tokens* are identical (computed from decoded
 * pixel dimensions, not wire format), so billing is unchanged; only the
 * lingxiloop-server ↔ OpenAI hop pays. Worth it — HEAD-probe still leaks
 * failures via TOCTOU (200 on HEAD, 4xx on the GET OpenAI does later) and
 * via OpenAI's fetcher hitting different network conditions than ours.
 *
 * Cache: successes cached 10 min (CDN bytes are stable); failures cached
 * 1 min (so transient blips self-recover without sticking). Total cache
 * memory bounded at ~100 MB via byte-aware eviction.
 */

interface MaterializeOk { ok: true; dataUrl: string; bytes: number }
interface MaterializeErr {
  ok: false
  reason: 'http' | 'timeout' | 'too-large' | 'bad-type' | 'blocked' | 'error'
  status?: number
}
export type MaterializeResult = MaterializeOk | MaterializeErr

/** 10 MB per image. OpenAI's per-image limits vary by model but are
 *  typically <=20 MB on the wire; staying well under avoids edge rejection
 *  and bounds attacker leverage on attachment URLs. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** Bound the in-process cache memory footprint. ~100 MB allows roughly
 *  hundreds of cached avatars or tens of cached user attachments without
 *  growing unboundedly. Oldest entry is evicted when a new entry would
 *  push us over. */
const MAX_CACHE_BYTES = 100 * 1024 * 1024
const FETCH_TIMEOUT_MS = 5000
const SUCCESS_TTL_MS = 10 * 60_000
const FAILURE_TTL_MS = 60_000

interface CacheEntry { at: number; result: MaterializeResult; bytes: number }
const cache = new Map<string, CacheEntry>()
let cacheBytes = 0

function readCache(url: string): MaterializeResult | null {
  const entry = cache.get(url)
  if (!entry) return null
  const ttl = entry.result.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS
  if (Date.now() - entry.at > ttl) {
    cache.delete(url)
    cacheBytes -= entry.bytes
    return null
  }
  return entry.result
}

function writeCache(url: string, result: MaterializeResult, bytes: number): void {
  // Evict in insertion order (Map preserves it) until the new entry fits.
  // For failures bytes=0 so this is a no-op; only success entries actually
  // consume the budget.
  while (cache.size > 0 && cacheBytes + bytes > MAX_CACHE_BYTES) {
    const oldestKey = cache.keys().next().value
    if (oldestKey === undefined) break
    const oldest = cache.get(oldestKey)
    cache.delete(oldestKey)
    cacheBytes -= oldest?.bytes ?? 0
  }
  cache.set(url, { at: Date.now(), result, bytes })
  cacheBytes += bytes
}

/** Reject loopback / RFC1918 / link-local hostnames so a stray URL can't be
 *  used to probe the cluster's internal network from this process. Real
 *  avatar/attachment URLs go to public CDN hostnames so this is purely a
 *  defense-in-depth net. */
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.startsWith('127.') || h.startsWith('10.') || h.startsWith('0.')) return true
  if (h.startsWith('169.254.') || h.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  // IPv6 loopback / link-local. Crude but adequate — we don't expect raw v6
  // hostnames in our config; CDN/storage are all named.
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

/** Fetch `url`, validate it's an image we can ship, and return a base64
 *  `data:` URL on success. Never throws — callers iterate over many URLs
 *  and shouldn't have to wrap each. */
export async function materializeImage(url: string): Promise<MaterializeResult> {
  const cached = readCache(url)
  if (cached) return cached

  let parsed: URL
  try { parsed = new URL(url) }
  catch {
    const r: MaterializeResult = { ok: false, reason: 'blocked' }
    writeCache(url, r, 0); return r
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const r: MaterializeResult = { ok: false, reason: 'blocked' }
    writeCache(url, r, 0); return r
  }
  if (isBlockedHost(parsed.hostname)) {
    const r: MaterializeResult = { ok: false, reason: 'blocked' }
    writeCache(url, r, 0); return r
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  let result: MaterializeResult
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' })
    if (!res.ok) {
      result = { ok: false, reason: 'http', status: res.status }
    } else {
      const ctype = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
      if (!ctype.startsWith('image/')) {
        result = { ok: false, reason: 'bad-type' }
      } else {
        const declared = Number(res.headers.get('content-length') ?? '')
        if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
          result = { ok: false, reason: 'too-large' }
        } else {
          result = await streamWithCap(res, ctype)
        }
      }
    }
  } catch (err) {
    const name = (err as Error)?.name
    result = { ok: false, reason: name === 'AbortError' ? 'timeout' : 'error' }
  } finally {
    clearTimeout(timer)
  }
  const cacheBytesForEntry = result.ok ? result.dataUrl.length : 0
  writeCache(url, result, cacheBytesForEntry)
  return result
}

async function streamWithCap(res: Response, mime: string): Promise<MaterializeResult> {
  // Don't trust Content-Length — chunked / missing / lying responses still
  // need a hard cap during the actual read. Bail the instant we cross
  // MAX_IMAGE_BYTES so a malicious / misconfigured origin can't OOM us.
  const reader = res.body?.getReader()
  if (!reader) return { ok: false, reason: 'error' }
  const chunks: Buffer[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel().catch(() => { /* ignore */ })
      return { ok: false, reason: 'too-large' }
    }
    chunks.push(Buffer.from(value))
  }
  const buf = Buffer.concat(chunks)
  return { ok: true, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, bytes: total }
}

/** Test hook — clear the cache between runs so failure cases don't leak
 *  across test cases. Not used in production. */
export function _resetMaterializeCacheForTest(): void {
  cache.clear()
  cacheBytes = 0
}
