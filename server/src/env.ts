/** Validated environment variables — fail fast on boot.
 *
 *  `dotenv/config` is imported eagerly so that running `tsx server/src/...`
 *  or `node` directly picks up `.env` at the repo root without needing
 *  `node --env-file` or `dotenv-cli` wrappers. Values in the real
 *  environment win over those in `.env` (dotenv default), so deployment
 *  doesn't need a file. */
import 'dotenv/config'
import { createHmac } from 'node:crypto'

function required(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.error(`[env] Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return v
}
function integerAtLeast(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < minimum) {
    console.error(`[env] ${name} must be an integer >= ${minimum}`)
    process.exit(1)
  }
  return value
}
function wukongUserTokenSecret(): string {
  const configured = process.env.WUKONG_USER_TOKEN_SECRET?.trim()
  if (configured) return configured
  const webhookSecret = process.env.WUKONG_WEBHOOK_SECRET?.trim()
  if (!webhookSecret) return required('WUKONG_USER_TOKEN_SECRET')
  console.warn('[env] WUKONG_USER_TOKEN_SECRET not provided; deriving it from WUKONG_WEBHOOK_SECRET')
  return createHmac('sha256', webhookSecret)
    .update('lingxiloop:wukong-user-token:v1')
    .digest('base64url')
}
const DEFAULT_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5-mini'
export const env = {
  PORT: Number(process.env.PORT ?? 5181),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  APP_VERSION: process.env.LINGXILOOP_VERSION?.trim() || '0.0.0-dev',
  COMMIT_SHA: process.env.LINGXILOOP_COMMIT_SHA?.trim() || 'dev',
  /** Release gate for the deterministic, source-grounded HTML deck pipeline. */
  PRESENTATION_HTML_ENABLED: process.env.PRESENTATION_HTML_ENABLED?.trim().toLowerCase() === 'true',
  AGENT_OS_APPROVAL_TTL_MS: integerAtLeast('AGENT_OS_APPROVAL_TTL_MS', 24 * 60 * 60_000, 60_000),
  DATABASE_POOL_MAX: integerAtLeast('DATABASE_POOL_MAX', 20, 1),
  WUKONG_USER_TOKEN_SECRET: wukongUserTokenSecret(),
  DATABASE_URL: required('DATABASE_URL'),
  REDIS_URL: required('REDIS_URL'),
  GATEWAY_HMAC_SECRET: process.env.LINGXILOOP_GATEWAY_HMAC_SECRET
    ?? (process.env.NODE_ENV === 'production' ? required('LINGXILOOP_GATEWAY_HMAC_SECRET') : 'dev-only-gateway-secret'),
  OPENAI_API_KEY: required('OPENAI_API_KEY'),
  /** Standard OpenAI API endpoint. */
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
  /**
   * The single global OpenAI Chat Completions model used by the Agent OS main
   * loop, context compaction, and retained learning utilities.
   */
  OPENAI_MODEL: DEFAULT_MODEL,
  OPENAI_EMBEDDING_MODEL: required('OPENAI_EMBEDDING_MODEL'),
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL?.trim() || '',
  /**
   * Webhook URL for process-level alerts (unhandledRejection /
   * uncaughtException). Currently expects a Discord webhook
   * `{ content: "..." }` JSON payload. When unset, alerts are still
   * logged but no network call is made.
   */
  ALERT_WEBHOOK_URL: process.env.ALERT_WEBHOOK_URL ?? '',
  /**
   * Minimum interval (ms) between alerts that share the same
   * (label, error-fingerprint). Defaults to 60s — protects the webhook
   * from a tight loop of identical crashes hammering it.
   */
  ALERT_DEDUPE_MS: Number(process.env.ALERT_DEDUPE_MS ?? 60_000),
  /** for distributed deploys, identify this instance in logs / pubsub */
  INSTANCE_ID: process.env.INSTANCE_ID ?? `app-${Math.random().toString(36).slice(2, 7)}`,
  /**
   * Publicly reachable application origin.
   */
  /**
   * Cloudflare R2 object storage. All values are required at startup.
   *
   * `R2_ENDPOINT` — the bucket endpoint, e.g. https://<accountid>.r2.cloudflarestorage.com
   * `R2_BUCKET`   — bucket name
   * `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — API token credentials
   * `R2_PUBLIC_BASE` — required public CDN/custom-domain base for read URLs,
   *   e.g. https://cdn.lingxiloop.app (no trailing slash).
   */
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? '',
  R2_BUCKET: process.env.R2_BUCKET ?? '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
  R2_PUBLIC_BASE: (process.env.R2_PUBLIC_BASE ?? '').replace(/\/+$/, ''),
  /**
   * HMAC secret shared between this server (URL signer) and the Cloudflare
   * Worker fronting `cdn.example.com`. Private R2 URLs are emitted
   * with `?exp=<unix>&sig=<hex>` and the Worker validates both before
   * proxying R2 reads. This value is required at startup; there is no unsigned
   * private-object mode.
   */
  R2_URL_SIGNING_SECRET: process.env.R2_URL_SIGNING_SECRET ?? '',
  /** TTL (seconds) baked into each signed URL. Keep short — message
   *  attachments are re-signed on every read, so users never see expired
   *  links during normal browsing. Default 1 hour. */
  R2_URL_TTL_SECONDS: Number(process.env.R2_URL_TTL_SECONDS ?? 3600),
  /**
   * Base URL of an Agent Skills hub — any HTTP service that implements
   * the contract below. Agents use it via `lingxiloop skills search/install`.
   * Leave blank to disable the hub commands; agents can still create
   * their own skills via `lingxiloop skills create`.
   *
   *   GET  <hub>/search?q=<query>
   *     → [{ name, description, version?, author?, install_url }]
   *
   *   GET  <hub>/skills/<name>   (also any explicit install_url)
   *     → { name, description, version?, author?, files: [
   *           { path: 'SKILL.md', body: '...' },
   *           { path: 'scripts/foo.py', body: '...' },
   *           ...
   *         ] }
   */
  SKILLHUB_URL: (process.env.SKILLHUB_URL ?? '').replace(/\/+$/, ''),
  /**
   * Comma-separated allow-list of origins for CORS. The browser only
   * sends an Origin header for cross-origin requests, so leaving this
   * blank preserves same-origin / Vite-proxy behavior in dev. Set to
   * the renderer's origin when you ship a build that talks directly
   * to this server from a different host (e.g. a packaged Electron
   * app pointing at an operator-provided HTTPS origin). Use `*` to allow any
   * origin (no credentials).
   */
  CORS_ORIGINS: (process.env.LINGXILOOP_CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Public origin used for generated product links. */
  PUBLIC_ORIGIN: (process.env.LINGXILOOP_PUBLIC_ORIGIN ?? 'http://localhost:5181').replace(
    /\/+$/,
    '',
  ),
  /** Public base URL used to build company invitation links. */
  INVITE_BASE_URL: required('LINGXILOOP_INVITE_BASE_URL'),
  /**
   * Real-email feature. When all three core vars are set, agents can send
   * mail (Resend) and receive mail (Cloudflare Email Worker → /webhooks/
   * email/inbound). All three values are required by the native subsystem.
   *
   *   RESEND_API_KEY            — Resend API key (re_… token)
   *   EMAIL_DOMAIN              — root domain that hosts agent addresses,
   *                               e.g. "loop.lingxilearn.cn". Per-agent address is
   *                               <participantId>.<companySlug>@<EMAIL_DOMAIN>.
   *   RESEND_WEBHOOK_SECRET     — endpoint-specific Resend/Svix signing
   *                               secret for the `email.received` webhook.
   */
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET ?? '',
  EMAIL_DOMAIN: (process.env.EMAIL_DOMAIN ?? '').toLowerCase().replace(/^\.+|\.+$/g, ''),
  /** Interval between outbound retry-loop ticks. Defaults to 60s; set to
   *  0 to disable retry entirely (failed sends stay failed forever). The
   *  loop uses SKIP LOCKED so multiple replicas can run it concurrently. */
  EMAIL_RETRY_INTERVAL_MS: Number(process.env.EMAIL_RETRY_INTERVAL_MS ?? 60_000),
  /** Interval between email-attachment GC sweeps. Defaults to 24h. The
   *  sweep enumerates the storage prefix, compares against DB-referenced
   *  keys, and deletes orphans older than the safety threshold. Setting
   *  to 0 disables — useful when running on a backend whose enumeration
   *  is expensive or when you'd rather invoke `runGcTick()` ad-hoc. */
  EMAIL_GC_INTERVAL_MS: Number(process.env.EMAIL_GC_INTERVAL_MS ?? 24 * 60 * 60_000),
  /** Interval between DB row-retention sweeps (db-gc.ts). Each tick
   *  deletes up to 10 batches of DB_GC_BATCH rows per table, so the
   *  default 5min cadence burns a large backlog gradually without
   *  starving vacuum. 0 disables the worker entirely. */
  DB_GC_INTERVAL_MS: Number(process.env.DB_GC_INTERVAL_MS ?? 5 * 60_000),
  /** Rows per delete batch. Small batches = short locks. */
  DB_GC_BATCH: Number(process.env.DB_GC_BATCH ?? 10_000),
  /** Per-table retention windows in days; 0 disables that table's sweep.
   *  Readers only touch recent rows (see db-gc.ts header) — bump these
   *  if a new feature ever needs deeper history. */
  DB_GC_AGENT_LOG_DAYS: Number(process.env.DB_GC_AGENT_LOG_DAYS ?? 30),
  DB_GC_AGENT_EVENTS_DAYS: Number(process.env.DB_GC_AGENT_EVENTS_DAYS ?? 30),
  DB_GC_AGENT_RUNS_DAYS: Number(process.env.DB_GC_AGENT_RUNS_DAYS ?? 30),
  /** Days past expires_at before a ws_ticket row is reaped. */
  DB_GC_WS_TICKETS_DAYS: Number(process.env.DB_GC_WS_TICKETS_DAYS ?? 1),
  /** Interval between poll-expiration sweeps. Defaults to 60s. The sweep
   *  flips polls past their expiresAt to closed and broadcasts the close
   *  event. Set to 0 to disable (polls then stay open forever even after
   *  their declared expiration — manual close still works). */
  POLL_SWEEP_INTERVAL_MS: Number(process.env.POLL_SWEEP_INTERVAL_MS ?? 60_000),
  /** Bearer token gating GET /api/metrics. Unset → endpoint returns 404
   *  (don't leak internal counts to unauthenticated callers in deploys
   *  that haven't set up Prometheus yet). When set, scrapers pass it as
   *  ?token=<value> OR Authorization: Bearer <value>. */
  METRICS_BEARER_TOKEN: process.env.METRICS_BEARER_TOKEN ?? '',
  /** Discord webhook for operational alerts (terminal retry failure,
   *  attachment upload error). Separate from the release webhook so
   *  release announcements don't drown out paging-level signals.
   *  Unset → alerts are no-ops + log only. */
}
// Keep environment validation side-effect free after module initialization.
