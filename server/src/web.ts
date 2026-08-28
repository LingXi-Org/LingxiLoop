import './logging.js'
import express from 'express'
import compression from 'compression'
import http from 'node:http'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from './env.js'
import { api } from './api/router.js'
import { initializeNativeStorage } from './storage.js'
import { attachWebSocket, resetHumanPresenceOnBoot } from './ws.js'
import { bootDocumentBus } from './modules/documents/public.js'
import { pool } from './db/pool.js'
import { redis, sub } from './redis.js'
import { inboundEmailRouter } from './modules/email/index.js'
import { agentOSControlRouter } from './agent-os/control-plane.js'
import { wukongWebhookRouter } from './im/webhook.js'
import { wukongClient } from './im/wukong.js'
import { Lifecycle, type ServiceHandle } from './runtime/lifecycle.js'

export async function startWebProcess(): Promise<ServiceHandle> {
  // Construct every mandatory infrastructure adapter before exposing HTTP.
  // Missing WuKongIM configuration is a startup error, never a latent fallback.
  initializeNativeStorage()
  wukongClient()
  const app = express()
  // gzip responses ≥1kb to keep control-plane and asset traffic compact. SSE
  // must stay uncompressed: compression buffers event-stream chunks, which
  // would stall wake-streams until the buffer flushes.
  app.use(compression({
    filter: (req, res) => {
      const type = res.getHeader('Content-Type')
      if (typeof type === 'string' && type.includes('text/event-stream')) return false
      return compression.filter(req, res)
    },
  }))
  // CORS — only kicks in when LINGXILOOP_CORS_ORIGINS is set. Browsers send
  // `Origin` only on cross-origin requests, so same-origin (Vite proxy,
  // colocated static deploy) is unaffected. `*` allows any origin but
  // disables credentials per the CORS spec. We do NOT enable credentials
  // because auth here is header-based (Bearer token), not cookies.
  const corsAllow = new Set(env.CORS_ORIGINS)
  const corsAny = corsAllow.has('*')
  app.use((req, res, next) => {
    const origin = req.headers.origin
    if (origin && (corsAny || corsAllow.has(origin))) {
      res.setHeader('Access-Control-Allow-Origin', corsAny ? '*' : origin)
      res.setHeader('Vary', 'Origin')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,x-company-id,x-project-id')
      res.setHeader('Access-Control-Max-Age', '600')
      if (req.method === 'OPTIONS') { res.status(204).end(); return }
    }
    next()
  })
  // Inbound-email webhook (Cloudflare Email Worker → here). Mount BEFORE
  // the generic JSON parser — the router has its own express.json with a
  // `verify` hook that captures rawBody for HMAC validation. Once it
  // parses, body-parser flips req._body=true so the generic parser below
  // becomes a no-op for these requests.
  app.use('/webhooks/email', inboundEmailRouter)
  app.use('/webhooks/wukong', wukongWebhookRouter)

  // Bumped from 256kb to 32mb because the upload endpoint takes base64-encoded
  // file bodies up to MAX_UPLOAD_BYTES (25MB raw → ~34MB base64). R2-mode
  // uploads bypass this limit entirely (browser PUTs directly to R2).
  app.use(express.json({ limit: '34mb' }))
  app.use((req, res, next) => {
    const t = Date.now()
    res.on('finish', () => {
      const ms = Date.now() - t
      if (ms > 250 || res.statusCode >= 400) {
        console.log(`[http] ${req.method} ${req.url} → ${res.statusCode} ${ms}ms`)
      }
    })
    next()
  })
  app.use('/api', api)
  // The independent Agent OS uses a service identity and scoped work leases;
  // it never receives a human session or direct database credentials.
  app.use('/internal/agent-os', agentOSControlRouter)

  // ============== Host gating ==============
  // If an operator adds an API-only subdomain, prevent its unknown routes
  // from falling through to the SPA. The supported production origin serves
  // Web and API together on one host.
  app.use((req, res, next) => {
    const host = (req.hostname || '').toLowerCase()
    if (host.startsWith('api.')) {
      res.status(404).json({ error: 'not found' })
      return
    }
    next()
  })

  // ============== Web SPA bundle ==============
  // The same Docker image bakes in the frontend `dist/` next to the server
  // source, so this single container serves both JSON and the SPA. Same-origin
  // Web needs no CORS configuration. Local dev keeps using Vite and the
  // existing /api proxy, so the static handler is skipped when dist/ isn't
  // present.
  //
  // Mount order matters: /api and /runtime are matched FIRST above,
  // so the SPA catch-all below only receives non-API paths. The regex on the
  // SPA route explicitly excludes those prefixes too, as a belt-and-braces
  // against future routes that might fall through to here.
  // Dev (NODE_ENV !== 'production') always uses Vite on :5173 — we
  // explicitly skip the static handler so a stale dist/ from a previous
  // `npm run build` doesn't get served on :5181 and confuse the
  // localhost flow.
  const DIST_DIR = resolve(process.cwd(), 'dist')
  const INDEX_HTML = join(DIST_DIR, 'index.html')
  const hasDist = env.NODE_ENV === 'production' && existsSync(INDEX_HTML)
  if (hasDist) {
    app.use(express.static(DIST_DIR, {
      index: false,
      // Hashed JS/CSS get long cache; index.html is served via the SPA
      // catch-all below with no-cache headers, so deploys are picked up
      // instantly even when the static-asset CDN caches aggressively.
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        }
      },
    }))
    // SPA catch-all — any GET that isn't an API / runtime / uploads / ws path
    // returns index.html so client-side routes like /invite/<token> work on
    // first load + on refresh. POST/PUT/DELETE never fall through to here.
    app.get(/^(?!\/(api|runtime|uploads|ws)(\/|$)).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.sendFile(INDEX_HTML)
    })
    console.log(`[boot] serving SPA from ${DIST_DIR}`)
  } else {
    // No bundle present (typical for local-dev where Vite serves the
    // renderer on :5173). Keep `/` informational so dev probes still work.
    app.get('/', (_req, res) => res.json({
      name: 'lingxiloop', instance: env.INSTANCE_ID, spa: 'dev (served by vite)',
    }))
  }

  // App-level error handler — catches anything the router-level handler missed
  // (body-parse errors, middleware exceptions, etc.) and ALWAYS returns a JSON
  // body so the client error display gets something actionable instead of an
  // empty 500 page. Must come last in the middleware chain.
  app.use((err: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const msg = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error ? err.stack : undefined
    console.error(`[app] uncaught on ${req.method} ${req.url}:`, msg)
    if (stack) console.error(stack)
    if (res.headersSent) return
    const status = (err as { status?: number; statusCode?: number })?.status
                ?? (err as { statusCode?: number })?.statusCode
                ?? 500
    res.status(status).json({ error: msg || 'internal server error' })
  })

  const server = http.createServer(app)
  const lifecycle = new Lifecycle()
  lifecycle.addDisposer('postgres', () => pool.end())
  lifecycle.addDisposer('redis', () => { sub.disconnect(); redis.disconnect() })
  lifecycle.addDisposer('http', () => {
    if (!server.listening) return
    return new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => error ? rejectClose(error) : resolveClose())
    })
  })

  try {
    const wss = attachWebSocket(server)
    lifecycle.addDisposer('websocket', () => new Promise<void>((resolveClose, rejectClose) => {
      for (const client of wss.clients) client.terminate()
      wss.close((error) => error ? rejectClose(error) : resolveClose())
    }))
    // Cross-instance Y.Doc fan-out — the room manager subscribes to the
    // doc redis channels here so two server instances stay convergent.
    await bootDocumentBus()
    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: Error) => rejectListen(error)
      server.once('error', onError)
      server.listen(env.PORT, () => {
        server.off('error', onError)
        console.log(`[web] listening :${env.PORT} · instance ${env.INSTANCE_ID} · OpenAI model ${env.OPENAI_MODEL}`)
        resolveListen()
      })
    })
    void resetHumanPresenceOnBoot().catch((error: unknown) => {
      console.error('[ws] stale presence reset failed after listener startup', error)
    })
  } catch (error) {
    await lifecycle.stop('startup-failure').catch(() => undefined)
    throw error
  }

  return lifecycle
}
