import { randomUUID, timingSafeEqual } from 'node:crypto'
import { Router } from 'express'
import { isWaitlistEnabled } from '../../admin.js'
import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany, } from '../../http/request-context.js'
import { openNotebookClient } from '../../knowledge/open-notebook-client.js'
import {
  openNotebookEnabled,
} from '../../knowledge/service.js'
import { OgError, ogPreview } from '../../og.js'
import { redis } from '../../redis.js'
import { normalizeStorageKey, storage, storageKeyFromPublicUrl, } from '../../storage.js'

export const platformServiceRoutes = Router()
const api = platformServiceRoutes

/** Per-mime upload policy.
 *
 *  - `kind` decides how the message bubble renders the attachment.
 *  - `ext` becomes the file extension on disk (used for nice download names).
 *
 *  The whitelist is conservative: images for inline preview, common docs +
 *  archives for "send file", and the text-ish family so agents can read the
 *  content into context. Anything outside this map gets rejected at the
 *  upload edge.
 */
const MIME_POLICY: Record<string, { kind: 'img' | 'file'; ext: string }> = {
  // Images — inline preview + vision
  'image/png':  { kind: 'img',  ext: 'png'  },
  'image/jpeg': { kind: 'img',  ext: 'jpg'  },
  'image/webp': { kind: 'img',  ext: 'webp' },
  'image/gif':  { kind: 'img',  ext: 'gif'  },
  // Documents
  'application/pdf': { kind: 'file', ext: 'pdf' },
  'application/msword': { kind: 'file', ext: 'doc' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { kind: 'file', ext: 'docx' },
  'application/vnd.ms-excel': { kind: 'file', ext: 'xls' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { kind: 'file', ext: 'xlsx' },
  'application/vnd.ms-powerpoint': { kind: 'file', ext: 'ppt' },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { kind: 'file', ext: 'pptx' },
  // Archives
  'application/zip': { kind: 'file', ext: 'zip' },
  'application/x-tar': { kind: 'file', ext: 'tar' },
  'application/gzip': { kind: 'file', ext: 'gz' },
  // Text & code (extractable into agent context)
  'text/plain': { kind: 'file', ext: 'txt' },
  'text/markdown': { kind: 'file', ext: 'md' },
  'text/csv': { kind: 'file', ext: 'csv' },
  // NOTE: text/html is intentionally NOT accepted. An uploaded .html served
  // from the app origin (local-storage mode) would run as the app and could
  // read the localStorage session token — stored XSS → account takeover. The
  // /uploads static handler also forces nosniff + attachment disposition as
  // defense in depth, but the durable fix is never storing active content.
  'application/json': { kind: 'file', ext: 'json' },
  'application/x-yaml': { kind: 'file', ext: 'yml' },
  'application/x-toml': { kind: 'file', ext: 'toml' },
  // Audio / video — light support
  'audio/mpeg': { kind: 'file', ext: 'mp3' },
  'audio/wav': { kind: 'file', ext: 'wav' },
  'video/mp4': { kind: 'file', ext: 'mp4' },
  'video/quicktime': { kind: 'file', ext: 'mov' },
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024  // 25 MB (Skype-like ceiling)

/** Build a stable storage key from policy + a random UUID. Files land
 *  under `attachments/` so they don't collide with avatar keys. */
function attachmentKey(mime: string, companyId: string): { key: string; ext: string } | null {
  const policy = MIME_POLICY[mime]
  if (!policy) return null
  const id = randomUUID().replace(/-/g, '')
  return { key: `attachments/${companyId}/${id}.${policy.ext}`, ext: policy.ext }
}

/**
 * Tell the client which upload path is available. Frontend uses this to
 * decide between presign (R2) and base64 (local fallback) — saves a round
 * trip per attachment vs. probing the presign endpoint and handling 501.
 */
api.get('/uploads/capabilities', (_req, res) => {
  res.json({
    mode: storage.mode,
    presignSupported: storage.mode === 'r2',
    maxBytes: MAX_UPLOAD_BYTES,
    // Echo the allowed mimes so the frontend can render the right `accept`
    // attribute on the file input (and reject early before round-tripping).
    allowedMimes: Object.keys(MIME_POLICY),
  })
})

/**
 * Presign a direct browser→R2 PUT. Returns the URL the browser PUTs the
 * file to, plus the public URL it'll be available at after the upload.
 * Only works when storage is in R2 mode — local mode advertises this via
 * `/uploads/capabilities` so the client knows to use the base64 fallback.
 *
 * Body: { name, mime, size }
 * Returns: { uploadUrl, publicUrl, key, name, mime, size, kind }
 */
api.post('/uploads/presign', async (req, res) => {
  // Auth + tenant gate. Without this, anyone on the open internet could mint
  // signed R2 PUT URLs and burn through our storage quota / host arbitrary
  // content under our domain. Membership-only is enough — we don't restrict
  // uploads by role since attachments are a basic chat affordance.
  const { companyId } = await requireCompany(req)
  if (storage.mode !== 'r2') {
    res.status(501).json({ error: 'presign not available in local mode — POST /uploads instead' })
    return
  }
  const name = String(req.body?.name ?? '').trim().slice(0, 200)
  const mime = String(req.body?.mime ?? '').trim().toLowerCase()
  const size = Number(req.body?.size ?? 0)
  if (!name || !mime) { res.status(400).json({ error: 'name + mime required' }); return }
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `size out of range (got ${size}, max ${MAX_UPLOAD_BYTES})` })
    return
  }
  const policy = MIME_POLICY[mime]
  const k = attachmentKey(mime, companyId)
  if (!policy || !k) { res.status(415).json({ error: `mime not allowed: ${mime}` }); return }
  const signed = await storage.presignPut(k.key, mime)
  res.json({
    uploadUrl: signed.uploadUrl,
    publicUrl: signed.publicUrl,
    key: k.key,
    name,
    mime,
    size,
    kind: policy.kind,
  })
})

/**
 * Base64 upload — works in both storage modes. The browser sends a
 * `{name, mime, dataBase64}` body; the server decodes, validates, and
 * writes via the storage abstraction. This is the local-mode primary
 * path AND the R2-mode fallback for tiny files where the round-trip cost
 * of presign isn't worth it.
 */
api.post('/uploads', async (req, res) => {
  // Auth + tenant gate. Without this, anyone on the open internet could push
  // 25MB blobs into our storage — a DoS + cost vector. Membership-only is
  // sufficient since attachments are a baseline chat feature.
  const { companyId } = await requireCompany(req)
  const name = String(req.body?.name ?? '').trim().slice(0, 200)
  const mime = String(req.body?.mime ?? '').trim().toLowerCase()
  const dataBase64 = String(req.body?.dataBase64 ?? '')
  if (!name || !mime || !dataBase64) {
    res.status(400).json({ error: 'name, mime, dataBase64 are required' })
    return
  }
  const policy = MIME_POLICY[mime]
  if (!policy) {
    res.status(415).json({ error: `mime not allowed: ${mime}` })
    return
  }
  let buf: Buffer
  try {
    buf = Buffer.from(dataBase64, 'base64')
  } catch {
    res.status(400).json({ error: 'invalid base64' })
    return
  }
  if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
    res.status(413).json({ error: `size out of range (got ${buf.length}, max ${MAX_UPLOAD_BYTES})` })
    return
  }
  const k = attachmentKey(mime, companyId)
  if (!k) { res.status(415).json({ error: `mime not allowed: ${mime}` }); return }
  const url = await storage.put(k.key, buf, mime)
  res.json({
    url,
    key: k.key,
    name,
    mime,
    size: buf.length,
    kind: policy.kind,
  })
})

api.post('/uploads/refresh-url', safe(async (req, res) => {
  await requireCompany(req)
  const url = String(req.body?.url ?? '').trim()
  const requestedKey = String(req.body?.key ?? '').trim()
  const key = normalizeStorageKey(requestedKey) ?? (url ? storageKeyFromPublicUrl(url) : null)
  if (!key) throw new HttpError(400, 'not a LingxiLoop storage URL')
  res.json({ key, url: await storage.publicUrl(key) })
}))

// Liveness: "is this process alive?" — MUST NOT touch the DB. A slow or
// overloaded DB must never cause Kubernetes to KILL the pod: that's how a
// transient DB hiccup snowballed into the 502 outage — the liveness probe hit
// the same exhausted pool, timed out, and pods were SIGTERM-killed (exit 143),
// shedding capacity exactly when it was needed. Point the livenessProbe here.
api.get('/livez', (_req, res) => { res.json({ ok: true, ts: Date.now() }) })

api.get('/meta', (_req, res) => {
  res.json({
    product: 'LingxiLoop',
    version: env.APP_VERSION,
    commitSha: env.COMMIT_SHA,
    reasoningRuntime: 'agent-os',
  })
})

// Readiness: "can this pod serve?" — checks DB reachability, but FAILS FAST.
// Capped at 1s so the probe gets a deterministic 200/503 instead of hanging on
// a busy pool until its own 2s deadline (which read as a flaky timeout and could
// trip both replicas at once under load). A NotReady pod is only pulled from
// rotation — never killed — so it rejoins as soon as the DB frees up.
api.get('/health', async (_req, res) => {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health db check timed out')), 1000)),
    ])
    res.json({ ok: true, ts: Date.now() })
  } catch (e) {
    res.status(503).json({ ok: false, error: String(e) })
  }
})

// Production dependency readiness used by the scheduled public smoke. It
// exercises the real database connection, Redis command path, and the
// configured Agent OS worker without exposing credentials or internals.
api.get('/health/dependencies', async (_req, res) => {
  const checks = { database: false, redis: false, agentOs: false, openNotebook: !openNotebookEnabled() }
  const dependencies: Array<Promise<unknown>> = [
    Promise.race([
      pool.query('SELECT 1').then(() => { checks.database = true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('database timeout')), 2_000)),
    ]),
    Promise.race([
      redis.ping().then(() => { checks.redis = true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('redis timeout')), 2_000)),
    ]),
    fetch(`${(process.env.AGENT_OS_URL ?? 'http://localhost:5190').replace(/\/+$/, '')}/health`, {
      signal: AbortSignal.timeout(3_000),
    }).then((response) => {
      checks.agentOs = response.ok
      if (!response.ok) throw new Error(`Agent OS health returned ${response.status}`)
    }),
  ]
  if (openNotebookEnabled()) dependencies.push(openNotebookClient.health().then((healthy) => {
    checks.openNotebook = healthy
    if (!healthy) throw new Error('Open Notebook health check failed')
  }))
  await Promise.allSettled(dependencies)
  const ok = Object.values(checks).every(Boolean)
  res.status(ok ? 200 : 503).json({ ok, dependencies: checks, ts: Date.now() })
})

/* GET /api/og?url=<encoded url> — Open-Graph / link-preview proxy.
 *
 * The chat renderer calls this when it autodetects a URL in a message body
 * so it can draw a card with the page's title / description / image. We
 * proxy the fetch server-side because:
 *   - Browsers can't read cross-origin HTML to extract og:* themselves.
 *   - One Redis cache here serves every client (and every replay of the
 *     same message), so the upstream site sees one hit instead of N.
 *   - Centralizing the fetch lets us enforce size / time / SSRF safety.
 *
 * Cached responses are returned at sub-ms latency; misses can take up to
 * FETCH_TIMEOUT_MS in og.ts (~6s). Errors that come from the user input
 * (bad URL, blocked private host) return 4xx so the frontend can silently
 * skip rendering the card; transient upstream / network failures map to
 * 502 / 504 the same way. */
api.get('/og', async (req, res) => {
  const url = typeof req.query.url === 'string' ? req.query.url : ''
  if (!url) {
    res.status(400).json({ error: 'url required' })
    return
  }
  try {
    const og = await ogPreview(url)
    // 5min CDN/browser cache so identical requests from sibling clients in
    // a conversation don't all hit our Redis. Redis itself still owns the
    // longer 7-day server-side cache.
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.json(og ?? { url, empty: true })
  } catch (e) {
    if (e instanceof OgError) {
      res.status(e.status).json({ error: e.message })
      return
    }
    res.status(500).json({ error: 'og fetch failed' })
  }
})

/* GET /api/public/signup-config — unauthenticated read of the bits of
 * app_settings that govern what the marketing page (loop.lingxilearn.cn) should
 * offer brand-new visitors. Today that's just `waitlist_enabled`: when
 * true, the landing page hides the desktop download buttons and shows
 * a "Join Waitlist" CTA instead, so visitors don't install an app they
 * can't yet sign into.
 *
 * Always sends `Access-Control-Allow-Origin: *` because the consumer is
 * a static site on a different host than this API, and the response
 * contains no per-user data. */
api.get('/public/signup-config', async (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=30')
  try {
    const waitlistEnabled = await isWaitlistEnabled()
    res.json({ waitlist_enabled: waitlistEnabled })
  } catch {
    res.json({ waitlist_enabled: false })
  }
})

/* GET /api/metrics — Prometheus text exposition for the email + agent
 * counters. Token-gated via METRICS_BEARER_TOKEN env var; the endpoint
 * is 404 when the token is unset so a deploy that hasn't set up
 * Prometheus doesn't accidentally leak internal counts to anyone who
 * stumbles on the URL. Accepts the token as `?token=` query OR
 * `Authorization: Bearer <token>` header — Prometheus scrapers can
 * configure either way. */
api.get('/metrics', async (req, res) => {
  // Read process.env directly (not env.*) so an operator can rotate the
  // token without restarting the server, and so integration tests can
  // toggle the gated/ungated paths without a fresh module graph.
  const expected = process.env.METRICS_BEARER_TOKEN ?? ''
  if (!expected) { res.status(404).send('not found'); return }
  const fromQuery = typeof req.query.token === 'string' ? req.query.token : ''
  const fromHeader = (() => {
    const h = req.headers.authorization
    if (typeof h === 'string' && h.startsWith('Bearer ')) return h.slice(7).trim()
    return ''
  })()
  const got = fromQuery || fromHeader
  // Constant-time compare to defend against timing oracles.
  const a = Buffer.from(expected)
  const b = Buffer.from(got)
  let ok = a.length === b.length
  if (ok) {
    try { ok = timingSafeEqual(a, b) }
    catch { ok = false }
  }
  if (!ok) { res.status(401).send('bad token'); return }
  const { renderProm } = await import('../../metrics.js')
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  res.send(renderProm())
})
