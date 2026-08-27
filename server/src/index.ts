import './logging.js'
import express from 'express'
import compression from 'compression'
import http from 'node:http'
import { mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from './env.js'
import { seedIfEmpty } from './seed.js'
import { api } from './api/router.js'
import { storage, UPLOAD_DIR } from './storage.js'
import { attachWebSocket, resetHumanPresenceOnBoot } from './ws.js'
import { bootDocumentBus } from './documents/rooms.js'
import { pool } from './db/pool.js'
import { redis } from './redis.js'
import { startStaleAgentRunSweeper } from './agents/observability.js'
import { inboundEmailRouter } from './api/inbound-email.js'
import { startEmailRetryWorker } from './email-retry.js'
import { startEmailGcWorker } from './email-gc.js'
import { startDbGcWorker } from './db-gc.js'
import { startCalendarScheduler } from './calendar.js'
import { startPollExpirationSweeper } from './polls.js'
import { startLlmRollupRefresher } from './agents/llm-rollup.js'
import { startTrialSweepWorker } from './trial-sweep.js'
import { startKnowledgeStorageGc, startKnowledgeWorker } from './knowledge/service.js'
import { seedAdmins } from './admin.js'
import { notifyAlert } from './alerting.js'
import { agentOSControlRouter } from './agent-os/control-plane.js'
import { wukongWebhookRouter } from './im/webhook.js'
import { reconcileLearningChannels } from './im/reconcile.js'
import { startLearningRoutineScheduler } from './agent-os/routine-scheduler.js'
import { startAgentWorkWatchdog } from './agent-os/work-watchdog.js'
import { startMemorySynthesisScheduler } from './agent-os/memory-service.js'

async function main() {
  await seedIfEmpty()
  // Promote LINGXILOOP_ADMIN_EMAILS members to is_admin on every boot —
  // idempotent, only flips FALSE→TRUE. Demotion goes through the panel.
  await seedAdmins()
  void reconcileLearningChannels().then(({ channels, failures }) =>
    console.log(`[im] reconciled ${channels - failures}/${channels} learning channels`),
  )
  // In local-storage mode the uploads dir backs the /uploads/ static handler
  // below. In R2 mode neither is needed — files live in object storage and
  // public URLs are served directly by R2 / CDN.
  if (storage.mode === 'local') {
    await mkdir(UPLOAD_DIR, { recursive: true })
  }

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
      res.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,x-company-id,x-project-id,x-lingxiloop-dev-mode')
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
  if (storage.mode === 'local') {
    app.use('/uploads', express.static(UPLOAD_DIR, {
      fallthrough: false,
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        // Uploads are served from the app origin in local-storage mode, so a
        // file the browser renders as active content (HTML/SVG/XML) would run
        // with the app's origin and could read the localStorage session token.
        // Never let the browser sniff a type, and force everything that isn't
        // a previewable raster image to download instead of render.
        res.setHeader('X-Content-Type-Options', 'nosniff')
        const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase()
        const inlineOk = ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp' || ext === 'gif'
        if (!inlineOk) res.setHeader('Content-Disposition', 'attachment')
      },
    }))
  }
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
  // Mount order matters: /api, /runtime, /uploads are matched FIRST above,
  // so the SPA fallback below only catches non-API paths. The regex on the
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
      // fallback below with no-cache headers, so deploys are picked up
      // instantly even when the static-asset CDN caches aggressively.
      maxAge: '1h',
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        }
      },
    }))
    // SPA fallback — any GET that isn't an API / runtime / uploads / ws path
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
  attachWebSocket(server)
  // Cross-instance Y.Doc fan-out — the room manager subscribes to the
  // doc redis channels here so two server instances stay convergent.
  bootDocumentBus()

  server.listen(env.PORT, () => {
    console.log(`[boot] lingxiloop server :${env.PORT} · instance ${env.INSTANCE_ID} · DeepSeek model ${env.DEEPSEEK_MODEL}`)
  })

  // Demote any 'avail' humans left over from the previous run; real
  // presence will be re-asserted as WS clients reconnect. Run AFTER
  // server.listen() and fire-and-forget — this used to be `await`'d
  // before the listen, which blocked startup. On first deploy of the
  // presence feature there were thousands of stale rows, and the
  // sequential publish loop (one Redis publish per row) made the
  // healthcheck miss its window, timing out the k8s rollout. The
  // UPDATE is the durable state; the publishes are a "tell live
  // clients now" optimization and at boot there are zero connected
  // clients, so we can defer it safely.
  void resetHumanPresenceOnBoot().catch((err) =>
    console.warn('[boot] resetHumanPresenceOnBoot crashed in background:',
      err instanceof Error ? err.message : String(err)),
  )

  startLearningRoutineScheduler()
  startAgentWorkWatchdog()
  startMemorySynthesisScheduler()
  console.log('[boot] learning routine scheduler running every 60s')

  // Outbound email retry loop — reclaims transport_status='failed' rows.
  // SKIP LOCKED keeps multi-replica deploys safe; setting
  // EMAIL_RETRY_INTERVAL_MS=0 disables it (useful when actively testing
  // the failed-state branch and not wanting silent recoveries).
  startEmailRetryWorker()

  // Email-attachment GC — periodic sweep that deletes storage objects no
  // longer referenced by any email_attachments row (DB CASCADE doesn't
  // touch object storage on its own). Disabled with EMAIL_GC_INTERVAL_MS=0.
  startEmailGcWorker()
  startDbGcWorker()

  // Mobile Pro-trial expiry — hourly sweep that downgrades lapsed trials
  // back to free (mirrors sub2api via the same path the admin UI uses).
  startTrialSweepWorker()
  const stopKnowledgeWorker = startKnowledgeWorker()
  const stopKnowledgeGc = startKnowledgeStorageGc()
  console.log('[boot] knowledge-source worker started')

  // Calendar dispatcher — once a minute, scan calendar_events for due
  // occurrences and post the scheduled prompt into the target conversation
  // (which wakes the assignee agent via the same mailbox path).
  startCalendarScheduler()

  // Poll expiration sweeper — once a minute, close polls past their
  // expiresAt and broadcast the close event. Safe across replicas: each
  // close goes through a per-poll transaction with FOR UPDATE, so a
  // racing replica seeing the same row finds closedAt already set and
  // bails idempotently.
  startPollExpirationSweeper(env.POLL_SWEEP_INTERVAL_MS)

  // Observability pre-aggregation refresher — keeps llm_calls_rollup current
  // so the admin Observability page reads ~30k hourly buckets (~230ms) instead
  // of scanning the whole 470k-row llm_calls table 6× per load (5-25s). First
  // tick backfills; steady-state upserts the recent few hours. Advisory-locked
  // so one replica refreshes. LLM_ROLLUP_INTERVAL_MS=0 disables.
  startLlmRollupRefresher()

  // Agent run orphan sweeper — if a pod finishes during server
  // rolling restart / NEG cutover, its final /runtime/runs/:id/finish
  // call can be lost after all semantic work is done. Active turns
  // update agent_runs.updated_at through status heartbeats/events, so
  // a 10min stale running row is an orphan, not real work.
  if (process.env.ENABLE_AGENT_RUN_SWEEPER !== 'false') {
    startStaleAgentRunSweeper()
    console.log('[boot] stale agent-run sweeper running every 60s')
  }

  // Graceful shutdown
  const shutdown = async (sig: string) => {
    console.log(`[shutdown] ${sig}`)
    stopKnowledgeWorker()
    stopKnowledgeGc()
    server.close()
    try { await pool.end() } catch { /* ignore */ }
    try { redis.disconnect() } catch { /* ignore */ }
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// Process-level safety nets. On modern Node (≥ 15) an unhandled
// promise rejection terminates the process by default — for lingxiloop
// that would knock out the wake bus + scheduler + HTTP API and every
// agent goes silent until the pod restarts. Most of our async paths
// either await with try/catch or `.catch()`-suffixed fire-and-forget;
// these handlers catch the cases we missed (the recordEvent /
// claimAndWake stack is a known offender) so a single transient
// upstream blip can't drop the whole server.
process.on('unhandledRejection', (reason, _p) => {
  // notifyAlert never throws and is fire-and-forget — we still log
  // synchronously through it so a webhook outage doesn't lose the
  // stderr record.
  void notifyAlert({ label: 'server.unhandledRejection', error: reason })
})
process.on('uncaughtException', (err) => {
  void notifyAlert({ label: 'server.uncaughtException', error: err })
})

main().catch((err) => {
  console.error('[boot] fatal', err)
  process.exit(1)
})
