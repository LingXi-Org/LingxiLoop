/** Validated environment variables — fail fast on boot.
 *
 *  `dotenv/config` is imported eagerly so that running `tsx server/src/...`
 *  or `node` directly picks up `.env` at the repo root without needing
 *  `node --env-file` or `dotenv-cli` wrappers. Values in the real
 *  environment win over those in `.env` (dotenv default), so deployment
 *  doesn't need a file. */
import 'dotenv/config'

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (!v) {
    console.error(`[env] Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return v
}
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat'
export const env = {
  PORT: Number(process.env.PORT ?? 5181),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  APP_VERSION: process.env.LINGXILOOP_VERSION?.trim() || '0.0.0-dev',
  COMMIT_SHA: process.env.LINGXILOOP_COMMIT_SHA?.trim() || 'dev',
  DATABASE_URL: required(
    'DATABASE_URL',
    `postgres://${process.env.USER ?? 'postgres'}@localhost:5432/lingxiloop`,
  ),
  REDIS_URL: required('REDIS_URL', 'redis://localhost:6379'),
  DEEPSEEK_API_KEY: required('DEEPSEEK_API_KEY'),
  /** DeepSeek's OpenAI-compatible endpoint; operators may point this at an
   * approved DeepSeek gateway without enabling another model provider. */
  DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com/v1',
  /**
   * The single global DeepSeek Chat Completions model used by the Agent OS main
   * loop, context compaction, and retained learning utilities.
   */
  DEEPSEEK_MODEL: DEFAULT_MODEL,
  /** Optional capabilities exposed by the same DeepSeek-compatible gateway.
   * Official DeepSeek deployments normally leave these empty; LingxiLoop then
   * uses recency memory and uploaded avatars instead of another provider. */
  DEEPSEEK_EMBEDDING_MODEL: process.env.DEEPSEEK_EMBEDDING_MODEL?.trim() || '',
  DEEPSEEK_IMAGE_MODEL: process.env.DEEPSEEK_IMAGE_MODEL?.trim() || '',
  /**
   * Webhook URL for process-level alerts (unhandledRejection /
   * uncaughtException). Currently expects a Discord-compatible
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
   * Publicly reachable origin for /uploads URLs. Configure this when a
   * DeepSeek-compatible gateway needs to fetch uploaded learning assets.
   */
  PUBLIC_HOST: process.env.PUBLIC_HOST ?? '',
  /**
   * Cloudflare R2 (or S3-compatible) object storage. When ALL four core vars
   * below are set, the storage layer flips to R2 mode: the browser uploads
   * directly via a presigned PUT URL, avatar generation persists to R2, and
   * /uploads static-serve is disabled. If any are missing, we fall back to
   * local disk (server/uploads/) — useful for local dev without a bucket.
   *
   * `R2_ENDPOINT` — the bucket endpoint, e.g. https://<accountid>.r2.cloudflarestorage.com
   * `R2_BUCKET`   — bucket name
   * `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — API token credentials
   * `R2_PUBLIC_BASE` — public CDN/custom-domain base for read URLs, e.g.
   *   https://cdn.lingxiloop.app (no trailing slash). When unset we'll generate
   *   short-lived presigned GET URLs instead — works but not cacheable.
   */
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? '',
  R2_BUCKET: process.env.R2_BUCKET ?? '',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? '',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? '',
  R2_PUBLIC_BASE: (process.env.R2_PUBLIC_BASE ?? '').replace(/\/+$/, ''),
  /**
   * HMAC secret shared between this server (URL signer) and the Cloudflare
   * Worker fronting `cdn.example.com`. When set, R2 public URLs are emitted
   * with `?exp=<unix>&sig=<hex>` and the Worker validates both before
   * proxying R2 reads. Leave blank to skip signing (URLs served unsigned —
   * fine in local dev, NOT for prod).
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
  LINGXI_IDENTITY_ISSUER: (process.env.LINGXI_IDENTITY_ISSUER ?? '').replace(/\/+$/, ''),
  LINGXI_IDENTITY_CLIENT_ID: process.env.LINGXI_IDENTITY_CLIENT_ID ?? '',
  LINGXI_IDENTITY_CLIENT_SECRET: process.env.LINGXI_IDENTITY_CLIENT_SECRET ?? '',
  LINGXI_IDENTITY_SCOPES: process.env.LINGXI_IDENTITY_SCOPES ?? 'openid profile email',
  /**
   * LingxiIdentity is the primary web OIDC provider. Google and GitHub are
   * optional compatibility providers.
   * URLs to enable. The callback URL must match the redirect registered with
   * the provider; the done URL is where we 302 the browser after creating
   * the session, with `#token=<bearer>&companyId=<id>` on the fragment so the
   * renderer can pick it up without it landing in server access logs.
   */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? '',
  /** Public origin this server is reachable at. Used to construct the
   *  per-provider redirect_uri that we hand to Google / GitHub at flow
   *  start. Defaults to http://localhost:5181 for local dev. In prod
   *  set LINGXILOOP_PUBLIC_ORIGIN=https://loop.example.com. */
  PUBLIC_ORIGIN: (process.env.LINGXILOOP_PUBLIC_ORIGIN ?? 'http://localhost:5181').replace(
    /\/+$/,
    '',
  ),
  /** Default URL the server 302s to after a successful OAuth callback,
   *  with `#token=...&companyId=...` appended. Used when the client
   *  didn't pass `?return=` at flow start. For dev (Vite) point at
   *  http://localhost:5173/; for packaged Electron the client passes
   *  lingxiloop://auth at start time and the server picks that. */
  AUTH_DONE_URL: process.env.LINGXILOOP_AUTH_DONE_URL ?? 'http://localhost:5173/',
  /** Allow-list of return URLs the client may pass via /auth/start
   *  `?return=...`. Without this we'd have an open-redirect: any
   *  attacker could craft a malicious provider-callback chain that
   *  delivers the user's token to a foreign origin. Entries are matched by
   *  parsed scheme, host, effective port, and path boundary. Comma-separated.
   *  Common values:
   *    lingxiloop://auth                       (packaged Electron deep link)
   *    http://localhost:5173/              (Vite dev renderer)
   *    http://localhost:5180/              (Electron dev renderer)
   *    https://loop.example.com/                 (web client)
   */
  AUTH_RETURN_ALLOWLIST: (process.env.LINGXILOOP_AUTH_RETURN_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  /** Base URL used to build the public face of company invitation links
   *  (`<base>/invite/<token>`). When unset we fall back to AUTH_DONE_URL —
   *  already production-correct for the OAuth flow (the configured public origin on the
   *  web, lingxiloop://auth in packaged Electron which gets rewritten to
   *  lingxiloop://invite/<token>). Set this only if the invite-acceptance flow
   *  lives on a different origin than the OAuth redirect. */
  INVITE_BASE_URL: process.env.LINGXILOOP_INVITE_BASE_URL ?? '',
  /**
   * sub2api LLM quota gateway. When SUB2API_ADMIN_KEY is set, OAuth
   * signup provisions a per-user sub2api account + API key, and every
   * LLM client uses that user's key + the sub2api OpenAI-compatible
   * endpoint. Without the admin key we fall back to the shared
   * DeepSeek credential path (no per-user quotas).
   *
   * Three knobs:
   *   SUB2API_INTERNAL_URL — where THIS server reaches sub2api for
   *                          admin calls (user create, login-as-user,
   *                          mint key, replace-group). In-cluster:
   *                          http://sub2api:8080.
   *   SUB2API_PUBLIC_URL   — public domain for browser/operator access
   *                          (https://sub2api.example.com). Backend LLM
   *                          traffic should prefer SUB2API_INTERNAL_URL
   *                          to avoid ingress request timeouts.
   *   SUB2API_ADMIN_KEY    — `x-api-key` header value for admin
   *                          endpoints. Generated once in the sub2api
   *                          dashboard at https://sub2api.example.com/.
   *
   * Tier → sub2api group_id mapping. Numeric ids come from the
   * dashboard after you create the three quota groups. 0 means "tier
   * unmapped, leave user without group" — useful for staged rollout
   * (the user has a sub2api account but can't call upstream yet).
   */
  SUB2API_INTERNAL_URL: (process.env.SUB2API_INTERNAL_URL ?? '').replace(/\/+$/, ''),
  SUB2API_PUBLIC_URL: (process.env.SUB2API_PUBLIC_URL ?? '').replace(/\/+$/, ''),
  SUB2API_ADMIN_KEY: process.env.SUB2API_ADMIN_KEY ?? '',
  SUB2API_TIER_FREE_GROUP_ID: Number(process.env.SUB2API_TIER_FREE_GROUP_ID ?? 0),
  SUB2API_TIER_PRO_GROUP_ID: Number(process.env.SUB2API_TIER_PRO_GROUP_ID ?? 0),
  SUB2API_TIER_MAX_GROUP_ID: Number(process.env.SUB2API_TIER_MAX_GROUP_ID ?? 0),
  /**
   * Comma-separated allow-list of emails that are forced to `is_admin =
   * true` on every server boot. The bootstrap path so that adding a new
   * admin doesn't require a SQL session — just add their email here +
   * redeploy. Removing an email from the env does NOT demote the user
   * (we never write FALSE from this path); demotion goes through the
   * admin panel.
   */
  ADMIN_EMAILS: (process.env.LINGXILOOP_ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /**
   * Real-email feature. When all three core vars are set, agents can send
   * mail (Resend) and receive mail (Cloudflare Email Worker → /webhooks/
   * email/inbound). When unset we still register the CLI subcommands but
   * sends short-circuit to a mock that returns a fake message-id and logs
   * — useful for local dev so the agent can rehearse the flow without
   * burning Resend quota.
   *
   *   RESEND_API_KEY            — Resend API key (re_… token)
   *   EMAIL_DOMAIN              — root domain that hosts agent addresses,
   *                               e.g. "loop.lingxilearn.cn". Per-agent address is
   *                               <participantId>.<companySlug>@<EMAIL_DOMAIN>.
   *   EMAIL_INBOUND_HMAC_SECRET — shared secret with the CF Email Worker.
   *                               Worker signs the JSON body; server verifies
   *                               with timing-safe HMAC-SHA256 compare.
   */
  RESEND_API_KEY: process.env.RESEND_API_KEY ?? '',
  EMAIL_DOMAIN: (process.env.EMAIL_DOMAIN ?? '').toLowerCase().replace(/^\.+|\.+$/g, ''),
  EMAIL_INBOUND_HMAC_SECRET: process.env.EMAIL_INBOUND_HMAC_SECRET ?? '',
  /** Mock-mode failure injection rate, 0..1. Only honored when
   *  RESEND_API_KEY is empty (i.e. already in mock mode). Lets local dev
   *  exercise the transport_status='failed' branch without misconfiguring
   *  real credentials. 0 / unset = always succeed. */
  EMAIL_MOCK_FAIL_RATE: Math.max(
    0,
    Math.min(1, Number(process.env.EMAIL_MOCK_FAIL_RATE ?? 0) || 0),
  ),
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
  DB_GC_LLM_CALLS_DAYS: Number(process.env.DB_GC_LLM_CALLS_DAYS ?? 90),
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
  DISCORD_ALERT_WEBHOOK_URL: process.env.DISCORD_ALERT_WEBHOOK_URL ?? '',
  /** APNs (Apple Push Notification) credentials. All four must be set or
   *  push is soft-disabled (registration endpoints still accept tokens,
   *  but the sender is a no-op). See docs/PUSH_NOTIFICATIONS.md for how
   *  to mint the .p8 in the Apple Developer Portal. */
  APNS_KEY_PATH: process.env.APNS_KEY_PATH ?? '',
  APNS_KEY_ID: process.env.APNS_KEY_ID ?? '',
  APNS_TEAM_ID: process.env.APNS_TEAM_ID ?? '',
  /** APNs topic — must match the iOS bundle id (cn.lingxilearn.loop). */
  APNS_TOPIC: process.env.APNS_TOPIC ?? 'cn.lingxilearn.loop',
  /** 'development' uses api.sandbox.push.apple.com (TestFlight + dev builds),
   *  'production' uses api.push.apple.com (App Store). Mismatching env vs.
   *  build will silently 400 every push — get it right. */
  APNS_ENV: (process.env.APNS_ENV === 'production' ? 'production' : 'development') as
    | 'development'
    | 'production',
  /** FCM (Firebase Cloud Messaging, HTTP v1) credentials for Android push.
   *  Supply the Firebase service-account JSON either inline (raw or base64)
   *  via FCM_SERVICE_ACCOUNT_JSON, or as a file path via
   *  FCM_SERVICE_ACCOUNT_PATH. Absent → Android push is soft-disabled
   *  (the /push/register endpoint still accepts android tokens; the sender
   *  is a no-op). The JSON's `project_id`, `client_email`, and `private_key`
   *  are read at send time. Generated in Firebase Console → Project settings
   *  → Service accounts → "Generate new private key".
   *  Keep it OUT of git — configure it as a server secret only. */
  FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON ?? '',
  FCM_SERVICE_ACCOUNT_PATH: process.env.FCM_SERVICE_ACCOUNT_PATH ?? '',
}
// Keep environment validation side-effect free after module initialization.
