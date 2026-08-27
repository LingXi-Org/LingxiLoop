
import { Router } from 'express'
import {
  audit,
  createWsTicket,
  deleteSession,
} from '../../auth.js'
import { pool } from '../../db/pool.js'
import { env } from '../../env.js'
import { safe } from '../../http/async-handler.js'
import { requireAuth, } from '../../http/request-context.js'
import {
  authorizeUrl,
  consumeState,
  createState,
  errorUrl,
  handleCallback,
  type Provider,
  providerEnabled,
  returnUrlAllowed,
} from '../../oauth.js'
import { getUserQuota, sub2apiConfigured } from '../../sub2api.js'

export const identityServiceRoutes = Router()
const api = identityServiceRoutes

/* ============== Auth — LingxiIdentity OIDC ============== */

/** 302 to the provider's consent screen. State is opaque to the client —
 *  we mint it server-side, save to Redis (5min TTL), and verify on the
 *  callback to defend against CSRF + cross-provider mixups.
 *
 *  `?return=<url>` is the post-callback redirect target. Must semantically
 *  match one of LINGXILOOP_AUTH_RETURN_ALLOWLIST entries; otherwise rejected so we
 *  can't be turned into an open redirect. Omit to use AUTH_DONE_URL. */
api.get('/auth/start/:provider', safe(async (req, res) => {
  const provider = req.params.provider as Provider
  if (provider !== 'lingxi') {
    res.status(404).json({ error: 'unknown provider' }); return
  }
  if (!providerEnabled(provider)) {
    res.status(503).json({ error: `${provider} oauth not configured` }); return
  }
  const returnUrlRaw = typeof req.query.return === 'string' ? req.query.return : ''
  let returnUrl: string | null = null
  if (returnUrlRaw) {
    if (!returnUrlAllowed(returnUrlRaw)) {
      res.status(400).json({ error: 'return URL not allowed' }); return
    }
    returnUrl = returnUrlRaw
  }
  // The invite-onboarding flow sends `?invite=<token>` when sign-in
  // started from /invite/<token>. completeFlow uses this to skip
  // auto-creating a personal workspace for net-new users.
  const inviteRaw = typeof req.query.invite === 'string' ? req.query.invite : ''
  const inviteToken = inviteRaw && inviteRaw.length >= 8 && inviteRaw.length <= 200 ? inviteRaw : null
  const inviteKind = req.query.inviteKind === 'course' ? 'course' : inviteToken ? 'company' : null
  const state = await createState(provider, returnUrl, inviteToken, inviteKind)
  res.redirect(await authorizeUrl(provider, state))
}))

/** Provider redirects here after consent. We trade the auth code for a
 *  session and 302 to the saved return URL (or AUTH_DONE_URL default) with
 *  `#token=...&companyId=...` on the fragment (never in the query / log).
 *  On failure we 302 to the same target with `#error=...`. */
api.get('/auth/callback/:provider', safe(async (req, res) => {
  const provider = req.params.provider as Provider
  if (provider !== 'lingxi') {
    res.status(404).json({ error: 'unknown provider' }); return
  }
  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const providerError = typeof req.query.error === 'string' ? req.query.error : ''
  const providerErrorDescription = typeof req.query.error_description === 'string'
    ? req.query.error_description
    : ''
  const ip = req.socket.remoteAddress ?? null
  const ua = (req.headers['user-agent'] as string | undefined) ?? null
  // OIDC providers return their denial/configuration errors to the callback
  // with `error` instead of `code`. Consume state first so the error still
  // lands on the browser that initiated the sign-in, never a caller-chosen
  // redirect target.
  if (providerError) {
    const claimed = state ? await consumeState(state) : null
    const detail = `${provider} oauth error: ${providerError}${providerErrorDescription ? ` (${providerErrorDescription})` : ''}`
    console.warn(`[auth] ${detail}`)
    await audit({ kind: 'login_failed', ip, userAgent: ua, detail: { provider, error: providerError, description: providerErrorDescription || null } })
    res.redirect(errorUrl(claimed?.returnUrl ?? null, detail.slice(0, 120))); return
  }
  if (!code || !state) {
    console.warn(`[auth] ${provider} callback missing code/state; expected callback ${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`)
    res.redirect(errorUrl(null, 'OAuth callback missing code or state; verify LINGXILOOP_PUBLIC_ORIGIN and the registered callback URL')); return
  }
  const claimed = await consumeState(state)
  if (!claimed || claimed.provider !== provider) {
    res.redirect(errorUrl(null, 'bad_state')); return
  }
  try {
    const url = await handleCallback({
      provider, code, returnUrl: claimed.returnUrl, ip, userAgent: ua,
      inviteToken: claimed.inviteToken,
    })
    res.redirect(url)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[auth] ${provider} callback failed:`, msg)
    await audit({ kind: 'login_failed', ip, userAgent: ua, detail: { provider, error: msg } })
    res.redirect(errorUrl(claimed.returnUrl, msg.slice(0, 120)))
  }
}))

api.post('/auth/logout', safe(async (req, res) => {
  const auth = req.headers.authorization
  let token: string | undefined
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) token = auth.slice(7).trim()
  if (token) await deleteSession(token)
  const ip = req.socket.remoteAddress ?? null
  await audit({ kind: 'logout', userId: req.authUserId ?? null, ip })
  res.json({ ok: true })
}))

/** Self-service account deletion. Required by Apple App Store
 *  Guideline 5.1.1(v): any app that supports account creation must
 *  offer in-app deletion that removes the account and its personal
 *  data. Soft-delete model — stamp `users.deleted_at`, clear PII,
 *  CASCADE the bound rows (sessions, ws_tickets, user_identities,
 *  email_verification_tokens). Audit content (messages, etc.) stays
 *  because those are co-owned with other workspace members.
 *
 *  Idempotent: hitting DELETE /me/account on an already-deleted
 *  account returns 401 (the session was wiped on the first call).
 */
api.delete('/me/account', safe(async (req, res) => {
  const userId = requireAuth(req)
  const ip = req.socket.remoteAddress ?? null
  const ua = (req.headers['user-agent'] as string | undefined) ?? null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Read the user's email up-front for the audit log — once
    // we clear it below it's gone.
    const { rows: pre } = await client.query<{ email: string | null }>(
      `SELECT email FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    )
    if (pre.length === 0) {
      await client.query('ROLLBACK').catch(() => { /* ignore */ })
      res.status(404).json({ error: 'account already deleted or not found' })
      return
    }
    const email = pre[0].email

    // 1. Stamp deleted_at + scrub PII fields. We move email to a
    //    sentinel `deleted+<userid>@lingxiloop.invalid` so the UNIQUE
    //    constraint stays satisfied (NULL would too, but a sentinel
    //    keeps the audit trail showing "an account existed here").
    await client.query(
      `UPDATE users
          SET deleted_at = NOW(),
              email = $2,
              display_name = $3,
              password_hash = NULL,
              avatar_url = NULL,
              email_verified_at = NULL
        WHERE id = $1`,
      [userId, `deleted+${userId}@lingxiloop.invalid`, 'Deleted user'],
    )

    // 2. Burn all sessions immediately. CASCADE would handle this on
    //    a hard-DELETE, but we soft-delete so do it explicitly.
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId])
    await client.query(`DELETE FROM ws_tickets WHERE user_id = $1`, [userId])

    // 3. Drop the OAuth linkages so the user can re-sign-up later
    //    with the same Google/GitHub/Apple account (otherwise the
    //    cross-provider auto-link path would re-attach them to the
    //    deleted-user row by email or by sub).
    await client.query(`DELETE FROM user_identities WHERE user_id = $1`, [userId])

    // 4. Mark all participant rows (humans = same id) as departed
    //    so the user disappears from every workspace's member list
    //    without breaking historical message authorship.
    await client.query(
      `UPDATE participants SET departed_at = NOW()
        WHERE id = $1 AND kind = 'human' AND departed_at IS NULL`,
      [userId],
    )

    await client.query('COMMIT')

    await audit({
      kind: 'account_deleted',
      userId,
      ip, userAgent: ua,
      detail: { email },
    })

    res.json({ ok: true })
  } catch (e) {
    await client.query('ROLLBACK').catch(() => { /* ignore */ })
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[auth] account delete failed', msg)
    res.status(500).json({ error: msg })
  } finally {
    client.release()
  }
}))

/** Mint a one-shot WS-handshake ticket. The frontend posts this with its
 *  Bearer token (in the Authorization header), then opens the WebSocket
 *  with the returned ticket on the URL — so the session token itself is
 *  never put on the WS URL (which would leak it to logs / referrer). */
api.post('/auth/ws-ticket', safe(async (req, res) => {
  const userId = requireAuth(req)
  const { ticket, expiresAt } = await createWsTicket(userId)
  res.json({ ticket, expiresAt: expiresAt.toISOString() })
}))

api.get('/auth/me', safe(async (req, res) => {
  const userId = requireAuth(req)
  const { rows } = await pool.query<{ id: string; email: string; display_name: string; email_verified_at: string | null; is_admin: boolean }>(
    `SELECT id, email, display_name, email_verified_at, is_admin FROM users WHERE id = $1`, [userId],
  )
  if (!rows[0]) { res.status(401).json({ error: 'session points to missing user' }); return }
  const { rows: companies } = await pool.query<{ id: string; name: string; slug: string; role: string; tier: string }>(
    `SELECT c.id, c.name, c.slug, cm.role, COALESCE(owner.tier, 'free') AS tier
       FROM company_members cm
       JOIN companies c ON c.id = cm.company_id
       LEFT JOIN users owner ON owner.id = c.owner_user_id
      WHERE cm.user_id = $1 ORDER BY cm.joined_at ASC`,
    [userId],
  )
  // Surface which providers the user has linked. Useful in the settings UI
  // for "add another login" affordance, and for the client to know whether
  // it should offer disconnect on a single linked provider (no — that would
  // strand the account).
  const { rows: idents } = await pool.query<{ provider: string }>(
    `SELECT provider FROM user_identities WHERE user_id = $1`, [userId],
  )
  res.json({
    user: {
      id: rows[0].id,
      email: rows[0].email,
      name: rows[0].display_name,
      emailVerified: rows[0].email_verified_at !== null,
      isAdmin: rows[0].is_admin,
      providers: idents.map((r) => r.provider),
    },
    companies,
    activeCompanyId: companies[0]?.id ?? null,
    // Server-side feature flags the SPA needs at boot. Today there's only
    // one: whether the server can actually send invite/welcome emails.
    // EMAIL_DOMAIN unset → no outbound mail → the invite modal hides the
    // "Email this invite" checkbox rather than letting the user tick a
    // box that will always fail. Add other capabilities here as needed.
    serverCapabilities: {
      invitationEmail: !!env.EMAIL_DOMAIN,
    },
  })
}))

// Admin panel. The sub-router enforces requireAdmin on every route; we
// mount it here so the shared authMiddleware runs first.


/* ============== /me/quota — sub2api subscription snapshot ===========
 * Surfaces the same daily/weekly/monthly used + limit numbers that
 * sub2api enforces at the gateway. Returns `{ configured: false }` when
 * the deployment doesn't talk to sub2api, and `{ configured: true,
 * snapshot: null }` when the user exists in lingxiloop but was never
 * provisioned (or sub2api lost their subscription). Either case is fine
 * — the client shows an "unavailable" affordance rather than erroring. */
api.get('/me/quota', safe(async (req, res) => {
  const me = requireAuth(req)
  if (!sub2apiConfigured()) { res.json({ configured: false, snapshot: null }); return }
  const { rows } = await pool.query<{ sub2api_user_id: number | null }>(
    `SELECT sub2api_user_id FROM users WHERE id = $1`, [me],
  )
  const subId = rows[0]?.sub2api_user_id ?? null
  if (subId == null) { res.json({ configured: true, snapshot: null }); return }
  try {
    const snapshot = await getUserQuota(subId)
    res.json({ configured: true, snapshot })
  } catch (e) {
    // Network / sub2api glitches mustn't 500 the settings tab — the user
    // can retry by reopening it.
    console.warn('[me/quota] sub2api fetch failed', e)
    res.json({ configured: true, snapshot: null, error: 'sub2api unreachable' })
  }
}))

/* ============== /me legacy stub — now session-derived ============== */
api.get('/me', safe(async (req, res) => {
  const userId = requireAuth(req)
  const { rows } = await pool.query<{ id: string; display_name: string }>(
    `SELECT id, display_name FROM users WHERE id = $1`, [userId],
  )
  if (!rows[0]) { res.status(401).json({ error: 'session points to missing user' }); return }
  res.json({ id: rows[0].id, name: rows[0].display_name, kind: 'human' })
}))
