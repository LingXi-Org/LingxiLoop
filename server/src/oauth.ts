/**
 * OAuth/OIDC — LingxiIdentity, Google + GitHub. Server-side authorization-code flow.
 *
 * Flow per provider:
 *   1. GET /api/auth/start/<provider> — server saves a random `state` to
 *      Redis (5min TTL) keyed by sha256(state), 302s to the provider's
 *      consent URL with that state.
 *   2. Provider redirects user back to /api/auth/callback/<provider>?code=…&state=…
 *   3. Server consumes the state (single-use), exchanges code → tokens,
 *      fetches the user profile, finds-or-creates the local user via
 *      user_identities (auto-bind by verified email), creates a session,
 *      302s to AUTH_DONE_URL#token=…&companyId=….
 *
 * State protection (CSRF + replay):
 *   - state is base64url(randomBytes(32)).
 *   - We store only its sha256 hash in Redis under `oauth:state:<sha>`.
 *     The plaintext lives only in the user's browser (URL) and the
 *     provider's redirect — DB read alone can't replay.
 *   - 5min TTL is plenty for a user-driven OAuth handshake.
 *
 * Auto-linking policy (locked in by user choice 2026-05-12):
 *   - If a user_identities row already exists for (provider, provider_id):
 *     log them in as that user.
 *   - Else if the provider returned a verified email AND we have a user
 *     with that email_lower (whether via another provider or a legacy
 *     password account), link the new identity to that user.
 *   - Else create a fresh user + their personal company.
 *
 * For GitHub specifically: `email` from /user is often null because users
 * keep it private. We instead hit /user/emails and pick `primary + verified`.
 */
import { randomBytes, createHash, randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'
import { redis } from './redis.js'
import { env } from './env.js'
import { audit, createSession, gravatarUrlForEmail } from './auth.js'
import { onboardStarterAgents } from './onboardCompany.js'
import { storage } from './storage.js'
import { provisionUser as provisionSub2apiUser, sub2apiConfigured } from './sub2api.js'
import { isWaitlistEnabled, enqueueWaitlist, isAllowlistedAdmin } from './admin.js'
import { discoverOidc, normalizeOidcProfile, type OidcProfile } from './oidc.js'
import { isAllowedReturnUrl } from './oauth-return-url.js'

export type Provider = 'lingxi' | 'google' | 'github'

interface ProviderConfig {
  authorizeUrl: string
  tokenUrl: string
  userInfoUrl: string
  scope: string
  clientId: string
  clientSecret: string
  tokenAuthMethod?: 'client_secret_basic' | 'client_secret_post'
}

async function providerConfig(p: Provider): Promise<ProviderConfig> {
  if (p === 'lingxi') {
    const discovered = await discoverOidc(env.LINGXI_IDENTITY_ISSUER)
    return {
      authorizeUrl: discovered.authorization_endpoint,
      tokenUrl: discovered.token_endpoint,
      userInfoUrl: discovered.userinfo_endpoint,
      scope: env.LINGXI_IDENTITY_SCOPES,
      clientId: env.LINGXI_IDENTITY_CLIENT_ID,
      clientSecret: env.LINGXI_IDENTITY_CLIENT_SECRET,
      tokenAuthMethod: discovered.token_endpoint_auth_methods_supported?.includes('client_secret_basic')
        ? 'client_secret_basic'
        : 'client_secret_post',
    }
  }
  if (p === 'google') return {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl:     'https://oauth2.googleapis.com/token',
    userInfoUrl:  'https://openidconnect.googleapis.com/v1/userinfo',
    scope:        'openid email profile',
    clientId:     env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
  }
  return {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl:     'https://github.com/login/oauth/access_token',
    userInfoUrl:  'https://api.github.com/user',
    scope:        'read:user user:email',
    clientId:     env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  }
}

export function providerEnabled(p: Provider): boolean {
  if (p === 'lingxi') return Boolean(env.LINGXI_IDENTITY_ISSUER && env.LINGXI_IDENTITY_CLIENT_ID && env.LINGXI_IDENTITY_CLIENT_SECRET)
  if (p === 'google') return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
  if (p === 'github') return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
  return false
}

function redirectUri(p: Provider): string {
  return `${env.PUBLIC_ORIGIN}/api/auth/callback/${p}`
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('base64url')
}

interface StateData {
  provider: Provider
  /** Where to 302 after a successful callback. null = use server default. */
  returnUrl: string | null
  /** Pending invite token, when the sign-in started from /invite/<token>.
   *  Carried through OAuth so the callback can SKIP the auto-create-workspace
   *  step for net-new users (they don't want their own workspace — they want
   *  to land in the inviter's). */
  inviteToken: string | null
  /** Distinguishes organization and course invitations across the OAuth round trip. */
  inviteKind: 'company' | 'course' | null
}

/** Validate a client-supplied return URL against the configured allow-list.
 *  Parsed URL components are compared so serialized-prefix tricks cannot
 *  spoof an allowed host, port, custom-scheme callback, or path boundary. */
export function returnUrlAllowed(url: string): boolean {
  return isAllowedReturnUrl(url, env.AUTH_RETURN_ALLOWLIST)
}

/** Mint a state token, save it + the requested return URL + optional invite
 *  token to Redis, return the plaintext state. */
export async function createState(
  p: Provider,
  returnUrl: string | null,
  inviteToken: string | null = null,
  inviteKind: 'company' | 'course' | null = null,
): Promise<string> {
  const state = randomBytes(32).toString('base64url')
  const key = `oauth:state:${hashState(state)}`
  const data: StateData = { provider: p, returnUrl, inviteToken, inviteKind }
  await redis.set(key, JSON.stringify(data), 'EX', 300)
  return state
}

/** Single-use consume — returns the saved StateData, or null if the
 *  state is unknown / expired / already consumed. */
export async function consumeState(state: string): Promise<StateData | null> {
  const key = `oauth:state:${hashState(state)}`
  const v = await redis.getdel(key)
  if (!v) return null
  try {
    const parsed = JSON.parse(v) as StateData
    if (parsed.provider !== 'lingxi' && parsed.provider !== 'google' && parsed.provider !== 'github') return null
    return parsed
  } catch {
    return null
  }
}

/** Build the provider's authorize URL the browser is 302'd to in step 1. */
export async function authorizeUrl(p: Provider, state: string): Promise<string> {
  const cfg = await providerConfig(p)
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri(p),
    response_type: 'code',
    scope: cfg.scope,
    state,
  })
  if (p === 'google') {
    // Always prompt = consent so we don't get a silent re-auth that bypasses
    // account selection (helps when the user has multiple Google accounts).
    params.set('prompt', 'select_account')
    params.set('access_type', 'online')
  }
  return `${cfg.authorizeUrl}?${params.toString()}`
}

interface NormalizedProfile {
  providerId: string
  email: string         // lowercased; throws if provider didn't yield a verified email
  displayName: string
  avatarUrl: string | null
}

/** Step 2: trade the auth code for an access token. */
async function exchangeCode(p: Provider, code: string): Promise<string> {
  const cfg = await providerConfig(p)
  const body = new URLSearchParams({
    code,
    redirect_uri: redirectUri(p),
    grant_type: 'authorization_code',
  })
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded',
    accept: 'application/json',
  }
  if (cfg.tokenAuthMethod === 'client_secret_basic') {
    headers.authorization = `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`
  } else {
    body.set('client_id', cfg.clientId)
    body.set('client_secret', cfg.clientSecret)
  }
  const r = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers,
    body,
  })
  if (!r.ok) throw new Error(`${p} token exchange ${r.status}: ${await r.text()}`)
  const j = await r.json() as { access_token?: string; error?: string; error_description?: string }
  if (!j.access_token) throw new Error(`${p} token response missing access_token: ${j.error_description ?? j.error ?? 'unknown'}`)
  return j.access_token
}

interface GoogleProfile { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }
interface GitHubProfile { id: number; login: string; name?: string | null; email?: string | null; avatar_url?: string }
interface GitHubEmail   { email: string; primary: boolean; verified: boolean }

async function fetchProfile(p: Provider, accessToken: string): Promise<NormalizedProfile> {
  const cfg = await providerConfig(p)
  if (p === 'lingxi') {
    const r = await fetch(cfg.userInfoUrl, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } })
    if (!r.ok) throw new Error(`LingxiIdentity userinfo ${r.status}`)
    return normalizeOidcProfile(await r.json() as OidcProfile)
  }
  if (p === 'google') {
    const r = await fetch(cfg.userInfoUrl, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!r.ok) throw new Error(`google userinfo ${r.status}`)
    const g = await r.json() as GoogleProfile
    if (!g.email || !g.email_verified) throw new Error('google account has no verified email')
    return {
      providerId: g.sub,
      email: g.email.toLowerCase(),
      displayName: (g.name && g.name.trim()) || g.email.split('@')[0]!,
      avatarUrl: g.picture ?? null,
    }
  }
  // GitHub: /user doesn't expose email when the user hides it. Hit /user/emails
  // and pick `primary && verified`. Otherwise refuse — we need a real address
  // for the user record + cross-provider auto-binding.
  const [userR, emailsR] = await Promise.all([
    fetch(cfg.userInfoUrl, { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', 'user-agent': 'lingxiloop' } }),
    fetch('https://api.github.com/user/emails', { headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json', 'user-agent': 'lingxiloop' } }),
  ])
  if (!userR.ok) throw new Error(`github user ${userR.status}`)
  if (!emailsR.ok) throw new Error(`github emails ${emailsR.status}`)
  const u = await userR.json() as GitHubProfile
  const emails = await emailsR.json() as GitHubEmail[]
  const primary = emails.find((e) => e.primary && e.verified)
  if (!primary) throw new Error('github account has no verified primary email')
  return {
    providerId: String(u.id),
    email: primary.email.toLowerCase(),
    displayName: (u.name && u.name.trim()) || u.login,
    avatarUrl: u.avatar_url ?? null,
  }
}

/** Common image content types we accept. The Google/GitHub avatar URLs
 *  both serve JPEG today; we still inspect Content-Type so a provider
 *  surprise PNG or WebP doesn't get mis-labeled. Anything outside this
 *  set falls back to the provider URL unchanged. */
const AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}
const AVATAR_MAX_BYTES = 2 * 1024 * 1024  // 2MB — way more than any real avatar
const AVATAR_FETCH_TIMEOUT_MS = 5000

/** Pull the provider's avatar URL down and re-host on LingxiLoop storage so
 *  the renderer fetches from our CDN, not lh3.googleusercontent.com /
 *  avatars.githubusercontent.com. Three wins:
 *    - Provider URL rotation (Google changes the ACg8oc... path when the
 *      user updates their photo) doesn't break us
 *    - Same-origin in the renderer → no third-party CORS / Referer / CSP
 *      surprises, no broken-image races
 *    - One stable URL per user → avatar-cache invalidation is meaningful
 *
 *  Best-effort: any failure (slow fetch, non-image response, oversized
 *  body) returns the original URL so sign-in is never blocked. */
export async function mirrorAvatar(userId: string, providerUrl: string | null): Promise<string | null> {
  if (!providerUrl) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), AVATAR_FETCH_TIMEOUT_MS)
  try {
    const r = await fetch(providerUrl, {
      signal: ctl.signal,
      headers: { 'user-agent': 'lingxiloop' },
    })
    if (!r.ok) return providerUrl
    const mime = (r.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const ext = AVATAR_MIME_TO_EXT[mime]
    if (!ext) return providerUrl
    const ab = await r.arrayBuffer()
    if (ab.byteLength > AVATAR_MAX_BYTES) return providerUrl
    const buf = Buffer.from(ab)
    const key = `avatars/${userId}.${ext}`
    return await storage.put(key, buf, mime)
  } catch (e) {
    console.warn(`[oauth] avatar mirror failed for ${userId}; falling back to provider URL`, e instanceof Error ? e.message : e)
    return providerUrl
  } finally {
    clearTimeout(timer)
  }
}

export interface CompletionResult {
  userId: string
  email: string
  displayName: string
  companyId: string | null
}

/** Signals that the OAuth flow landed on a brand-new user while the
 *  waitlist gate is on. No user row, no session — the callback handler
 *  redirects to a "you're on the waitlist" page instead. */
export class WaitlistedError extends Error {
  constructor(public email: string, public displayName: string) {
    super(`waitlisted: ${email}`)
  }
}

/** Signals that the OAuth flow resolved to an existing user whose account
 *  is currently suspended. No new session is minted — the handler turns
 *  this into a `#suspended=1` redirect so the renderer can show the
 *  "your account has been suspended" screen. The `reason` is the freeform
 *  note the admin attached, surfaced to the user verbatim so they know
 *  what to dispute. May be null when no reason was given. */
export class SuspendedError extends Error {
  constructor(public email: string, public reason: string | null) {
    super(`suspended: ${email}`)
  }
}

/** Step 3 — the meat. Exchange code, fetch profile, find-or-create user,
 *  link the identity, return the session-ready summary. The caller mints
 *  the actual session token + builds the redirect. */
export async function completeFlow(
  p: Provider,
  code: string,
  /** When this OAuth flow started from an invite link, the token is threaded
   *  through state. We use it ONLY to decide whether to auto-create a
   *  personal workspace for net-new users — invited users shouldn't end up
   *  with a stray "Their Name's workspace" they'll never use. The accept
   *  endpoint redeems the actual invite separately. */
  inviteToken: string | null = null,
): Promise<CompletionResult> {
  const accessToken = await exchangeCode(p, code)
  const profile = await fetchProfile(p, accessToken)
  return await findOrCreateUserByProfile(p, profile, inviteToken)
}

export async function findOrCreateUserByProfile(
  p: Provider,
  profile: NormalizedProfile,
  inviteToken: string | null = null,
): Promise<CompletionResult> {
  // Find-or-create. Race-safe by leaning on (provider, provider_id) PK and
  // (email_lower) lookup inside a single transaction.
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Path A: identity already linked → just look up the user.
    {
      const r = await client.query<{ user_id: string }>(
        `SELECT user_id FROM user_identities WHERE provider = $1 AND provider_id = $2`,
        [p, profile.providerId],
      )
      const linked = r.rows[0]?.user_id
      if (linked) {
        await client.query('COMMIT')
        return await finalize(linked, profile)
      }
    }

    // Path B: cross-provider auto-link. We just verified the provider attests
    // to the email's ownership (Google: email_verified=true; GitHub: primary
    // && verified). If we already have a user with that email, link.
    {
      const r = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`, [profile.email],
      )
      const existing = r.rows[0]?.id
      if (existing) {
        await client.query(
          `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (provider, provider_id) DO NOTHING`,
          [p, profile.providerId, existing, profile.email],
        )
        await client.query('COMMIT')
        return await finalize(existing, profile)
      }
    }

    // Path C: brand new user. If the waitlist gate is on AND this email
    // isn't on the bootstrap admin allow-list, enqueue them instead of
    // creating a real account. Admins on the env allow-list bypass the
    // gate so the first deploy can onboard without a chicken-and-egg.
    if (await isWaitlistEnabled() && !isAllowlistedAdmin(profile.email)) {
      await client.query('ROLLBACK').catch(() => {})
      await enqueueWaitlist({
        provider: p,
        providerId: profile.providerId,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      })
      throw new WaitlistedError(profile.email, profile.displayName)
    }

    // Mint user. Personal-workspace creation is GATED on `inviteToken`:
    // if the OAuth flow started from /invite/<token>, the user is here to
    // join someone *else's* workspace — auto-creating their own would
    // leave a stray "Their Name's workspace" they never wanted (the
    // invite-onboarding bug, pre-fix).
    const userId = `u-${randomUUID().slice(0, 12)}`
    await client.query(
      `INSERT INTO users (id, email, display_name, password_hash, email_verified_at, is_admin, tier)
         VALUES ($1, $2, $3, NULL, NOW(), $4, 'free')`,
      [userId, profile.email, profile.displayName, isAllowlistedAdmin(profile.email)],
    )
    await client.query(
      `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
         VALUES ($1, $2, $3, $4)`,
      [p, profile.providerId, userId, profile.email],
    )

    // Mirror the provider's avatar to our storage so the renderer fetches
    // from lingxiloop's CDN, not third-party hosts. Falls back to provider
    // URL on failure, then to Gravatar — never empty on first login.
    // Stamp onto users.avatar_url so every workspace this user later joins
    // (via invite or self-created) re-uses ONE face, not per-tenant
    // gravatar fallbacks.
    const mirroredAvatar = await mirrorAvatar(userId, profile.avatarUrl)
    const avatar = mirroredAvatar ?? gravatarUrlForEmail(profile.email)
    await client.query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatar, userId])

    let companyId: string | null = null
    if (!inviteToken) {
      companyId = `co-${randomUUID().slice(0, 10)}`
      const slugSeed = (profile.email.split('@')[0] || 'workspace').replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'workspace'
      let finalSlug = slugSeed
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await client.query(
            `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
            [companyId, `${profile.displayName}'s workspace`, finalSlug, userId],
          )
          break
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (!/duplicate key/.test(msg)) throw e
          finalSlug = `${slugSeed}-${randomUUID().slice(0, 4)}`
        }
      }
      await client.query(
        `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [companyId, userId],
      )
      await client.query(
        `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id)
           VALUES ($1, 'human', $2, NULL, $3, '#FF8870', $4, 'avail', $5)
           ON CONFLICT (id, company_id) DO NOTHING`,
        [userId, profile.displayName, profile.displayName.charAt(0).toUpperCase(), avatar, companyId],
      )
    }
    await client.query('COMMIT')

    // Learning-team onboarding is best-effort — never block first login.
    // Skipped on the invite path: the user is about to land in the inviter's
    // workspace, which already has its own learning team and rooms.
    if (companyId) {
      // Starter agents are provisioned directly into the managed AgentOS runtime.
      try {
        await onboardStarterAgents(companyId)
      } catch (e) { console.warn('[oauth] starter onboarding failed', e) }
    }

    // Mirror the user into sub2api so their LLM calls land on a
    // per-user quota counter from now on. Pool query is outside the
    // create transaction so a sub2api hiccup never rolls back signup.
    // A future backfill can pick up users whose sub2api_user_id stays
    // NULL (sub2api was down at signup time).
    if (sub2apiConfigured()) {
      try {
        const r = await provisionSub2apiUser({
          lingxiloopUserId: userId,
          email: profile.email,
          displayName: profile.displayName,
          tier: 'free',
        })
        await pool.query(
          `UPDATE users SET sub2api_user_id = $1, sub2api_api_key = $2 WHERE id = $3`,
          [r.sub2apiUserId, r.apiKey, userId],
        )
      } catch (e) {
        console.warn(`[oauth] sub2api provisioning failed for ${userId}; legacy fallback`, e instanceof Error ? e.message : e)
      }
    }

    return { userId, email: profile.email, displayName: profile.displayName, companyId }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

/** Shared finalization: bump last_login + return the company summary so the
 *  callback handler can mint a session + 302 to AUTH_DONE_URL.
 *
 *  Suspension gate lives here — both Path A (existing identity) and Path B
 *  (cross-provider auto-link) funnel through this function, so one check
 *  blocks every returning-user path without us having to repeat it. We
 *  read suspended_at + suspension_reason in the same UPDATE round-trip:
 *  UPDATE on a suspended user is harmless (last_login_at on a suspended
 *  account is fine to bump — it shows the admin "they tried"), and the
 *  RETURNING clause hands us the suspension status atomically with no
 *  TOCTOU window between two SELECTs. */
async function finalize(userId: string, profile: NormalizedProfile): Promise<CompletionResult> {
  const { rows: bump } = await pool.query<{
    suspended_at: string | null; suspension_reason: string | null
  }>(
    `UPDATE users SET last_login_at = NOW()
      WHERE id = $1
      RETURNING suspended_at, suspension_reason`,
    [userId],
  )
  if (bump[0]?.suspended_at) {
    throw new SuspendedError(profile.email, bump[0].suspension_reason)
  }
  const { rows } = await pool.query<{ company_id: string }>(
    `SELECT company_id FROM company_members WHERE user_id = $1 ORDER BY joined_at ASC LIMIT 1`,
    [userId],
  )
  return {
    userId,
    email: profile.email,
    displayName: profile.displayName,
    companyId: rows[0]?.company_id ?? null,
  }
}

/** Construct the final redirect URL the browser is sent to after a
 *  successful callback. Token + companyId go in the URL fragment so they
 *  never reach server access logs / Referer headers. `base` is the
 *  client-supplied return URL (already validated) or the server default. */
export function doneUrl(base: string, token: string, companyId: string | null): string {
  const frag = new URLSearchParams({ token })
  if (companyId) frag.set('companyId', companyId)
  return `${base}#${frag.toString()}`
}

/** Convenience for the callback handler: trade the code, mint a session,
 *  audit, return the done URL. The `returnUrl` came from the state row
 *  (already validated against the allow-list at /auth/start time); when
 *  absent we fall back to env.AUTH_DONE_URL.
 *
 *  Three terminal states besides "success":
 *   - WaitlistedError: brand-new user while the waitlist gate is on —
 *     enqueued, no session minted; redirect `#waitlist=1`.
 *   - SuspendedError: returning user whose account is currently suspended
 *     — no session minted; redirect `#suspended=1&reason=<admin note>`.
 *   - any other throw bubbles up; the caller surfaces `#error=…`. */
export async function handleCallback(args: {
  provider: Provider; code: string; returnUrl: string | null
  ip: string | null; userAgent: string | null
  /** Signed-in user has a pending invite. When set, completeFlow skips
   *  the auto-create-workspace step for net-new users — the accept
   *  endpoint plants them straight into the inviter's company instead. */
  inviteToken?: string | null
}): Promise<string> {
  let result: CompletionResult
  try {
    result = await completeFlow(args.provider, args.code, args.inviteToken ?? null)
  } catch (e) {
    if (e instanceof WaitlistedError) {
      await audit({
        kind: 'signup_waitlisted',
        ip: args.ip,
        userAgent: args.userAgent,
        detail: { provider: args.provider, email: e.email },
      })
      return waitlistUrl(args.returnUrl ?? env.AUTH_DONE_URL, e.email)
    }
    if (e instanceof SuspendedError) {
      // Suspended-user login attempt is interesting to track — it tells the
      // admin "they tried to come back" and is the audit trail of forced
      // logouts being meaningful. No session is minted; the renderer shows
      // the suspension screen with the admin's reason.
      await audit({
        kind: 'login_suspended',
        ip: args.ip,
        userAgent: args.userAgent,
        detail: { provider: args.provider, email: e.email, reason: e.reason },
      })
      return suspendedUrl(args.returnUrl ?? env.AUTH_DONE_URL, e.email, e.reason)
    }
    throw e
  }
  const { token } = await createSession(result.userId, {
    ip: args.ip ?? undefined, ua: args.userAgent ?? undefined,
  })
  await audit({
    kind: 'login',
    userId: result.userId,
    companyId: result.companyId,
    ip: args.ip,
    userAgent: args.userAgent,
    detail: { provider: args.provider, email: result.email },
  })
  return doneUrl(args.returnUrl ?? env.AUTH_DONE_URL, token, result.companyId)
}

/** Sibling to doneUrl/errorUrl. `?waitlist=1&email=...` tells the
 *  renderer to show the "you're on the waitlist" screen.
 *
 *  Why query string AND fragment: email isn't a secret (the user just
 *  signed in with it; it's already in the server's audit log), and
 *  fragments are quietly dropped by some browsers/proxies on cross-origin
 *  302s — when that happened the loopback HTML's JS saw neither token nor
 *  waitlist and rendered the wildly misleading "No session token" screen.
 *  Query strings survive redirects unconditionally, so the new shape puts
 *  the signal in the query. We keep the hash fragment as a transitional
 *  duplicate so older client builds (that still only parse `location.hash`)
 *  don't regress against a server that's been upgraded first. */
export function waitlistUrl(base: string, email: string): string {
  const params = new URLSearchParams({ waitlist: '1', email })
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}${params.toString()}#${params.toString()}`
}

/** `#suspended=1&email=...&reason=...` — the renderer shows a
 *  "your account has been suspended" screen with the admin's reason.
 *  Reason is optional; we only set it on the fragment when present so the
 *  URL stays clean when it's null. */
export function suspendedUrl(base: string, email: string, reason: string | null): string {
  const frag = new URLSearchParams({ suspended: '1', email })
  if (reason) frag.set('reason', reason)
  return `${base}#${frag.toString()}`
}

/** Used by the callback's failure path. Same shape as doneUrl but with
 *  `&error=...` so the renderer can surface a message. */
export function errorUrl(base: string | null, error: string): string {
  const target = base ?? env.AUTH_DONE_URL
  const frag = new URLSearchParams({ error })
  return `${target}#${frag.toString()}`
}
