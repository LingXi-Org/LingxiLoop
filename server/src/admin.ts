/**
 * Admin panel — backend helpers.
 *
 * Three concerns live here:
 *   1. Allow-list reconciliation (LINGXILOOP_ADMIN_EMAILS → users.is_admin)
 *      on boot, so a fresh deploy doesn't need a SQL session to mint
 *      the first admin. Idempotent — we only set TRUE; demotion goes
 *      through the panel.
 *   2. Settings k/v read/write. The two keys we care about today are
 *      `waitlist_enabled` and `signups_paused`; the row shape is
 *      generic so adding a third toggle is free.
 *   3. Waitlist approve flow. An admin click here has to do everything
 *      oauth.ts Path C does (user row + identity link + company +
 *      starter agents) PLUS delete the waitlist
 *      row — wrapped so we never half-promote a user.
 *
 * Auth boundary: `requireAdmin` is the only thing routes call; it relies
 * on `requireAuth` having already attached a userId. Returns the userId
 * for ergonomic destructuring at the call site.
 */
import { randomUUID } from 'node:crypto'
import { pool } from './db/pool.js'
import { env } from './env.js'
import type { AuthedRequest } from './auth.js'
import { audit } from './auth.js'
import { onboardStarterAgents } from './onboardCompany.js'
import { mirrorAvatar } from './oauth.js'
import { formatAddress, mintMessageId, sendViaProvider } from './email.js'

/* ============== Bootstrap admin allow-list ============== */

/** On boot, force `is_admin = TRUE` for every email in LINGXILOOP_ADMIN_EMAILS
 *  that already has a users row. Emails not yet signed up are skipped
 *  silently — they get the bit on their next /auth/me probe via the
 *  pre-set check below. */
export async function seedAdmins(): Promise<void> {
  if (env.ADMIN_EMAILS.length === 0) return
  const r = await pool.query(
    `UPDATE users SET is_admin = TRUE
      WHERE LOWER(email) = ANY($1::text[]) AND is_admin = FALSE`,
    [env.ADMIN_EMAILS],
  )
  if ((r.rowCount ?? 0) > 0) {
    console.log(`[admin] promoted ${r.rowCount} user(s) to admin via env allow-list`)
  }
}
/** True iff the email is on the env allow-list. Used by oauth.ts at user
 *  creation time so the first admin can sign in via OAuth and immediately
 *  be admin (without waiting for the next boot's reconcile). */
export function isAllowlistedAdmin(email: string): boolean {
  return env.ADMIN_EMAILS.includes(email.trim().toLowerCase())
}
/* ============== requireAdmin middleware ============== */

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Resolve the request's user, throw 401 if anonymous and 403 if not admin.
 *  Returns the user id so handlers can use it directly. */
export async function requireAdmin(req: AuthedRequest): Promise<string> {
  const uid = req.authUserId
  if (!uid) throw new HttpError(401, 'authentication required')
  const { rows } = await pool.query<{ is_admin: boolean }>(
    `SELECT is_admin FROM users WHERE id = $1`, [uid],
  )
  if (!rows[0]?.is_admin) throw new HttpError(403, 'admin only')
  return uid
}

/* ============== Settings k/v ============== */

export interface AppSettings {
  waitlist_enabled: boolean
  signups_paused: boolean
}

const DEFAULTS: AppSettings = {
  waitlist_enabled: false,
  signups_paused: false,
}

/** Read every setting in one round-trip, fill defaults for missing rows. */
export async function getSettings(): Promise<AppSettings> {
  const { rows } = await pool.query<{ key: string; value: unknown }>(
    `SELECT key, value FROM app_settings`,
  )
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    waitlist_enabled: typeof map.get('waitlist_enabled') === 'boolean'
      ? map.get('waitlist_enabled') as boolean
      : DEFAULTS.waitlist_enabled,
    signups_paused: typeof map.get('signups_paused') === 'boolean'
      ? map.get('signups_paused') as boolean
      : DEFAULTS.signups_paused,
  }
}

export async function setSetting(key: keyof AppSettings, value: boolean, updatedBy: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, NOW(), $3)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = NOW(),
             updated_by = EXCLUDED.updated_by`,
    [key, JSON.stringify(value), updatedBy],
  )
}

/** Single-key read — small helper for oauth.ts so we don't have to pull
 *  the whole settings object every signup. */
export async function isWaitlistEnabled(): Promise<boolean> {
  try {
    const { rows } = await pool.query<{ value: unknown }>(
      `SELECT value FROM app_settings WHERE key = 'waitlist_enabled' LIMIT 1`,
    )
    return rows[0]?.value === true
  } catch {
    return false
  }
}

/* ============== Waitlist mutations ============== */

export interface WaitlistRow {
  id: string
  provider: string
  providerId: string
  email: string
  displayName: string
  /** Always non-null on read: falls back to a gravatar identicon so
   *  every waitlist row has SOMETHING to render in the admin queue. */
  avatarUrl: string | null
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  requestedAt: string
  decidedAt: string | null
  decidedBy: string | null
}

/** Insert a waitlist row for a fresh OAuth signup. Idempotent on
 *  (provider, provider_id) — a returning waitlist visitor re-clicking
 *  Sign In updates the timestamp instead of erroring. */
export async function enqueueWaitlist(args: {
  provider: string
  providerId: string
  email: string
  displayName: string
  avatarUrl: string | null
}): Promise<WaitlistRow> {
  const id = `wl-${randomUUID().slice(0, 12)}`
  const r = await pool.query<WaitlistRowDb>(
    `INSERT INTO waitlist (id, provider, provider_id, email, display_name, avatar_url)
        VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (provider, provider_id) DO UPDATE
        SET email        = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            avatar_url   = EXCLUDED.avatar_url,
            requested_at = NOW(),
            status       = CASE
              WHEN waitlist.status = 'rejected' THEN 'rejected'
              ELSE 'pending'
            END
     RETURNING *`,
    [id, args.provider, args.providerId, args.email, args.displayName, args.avatarUrl],
  )
  return rowToWaitlist(r.rows[0]!)
}

interface WaitlistRowDb {
  id: string
  provider: string
  provider_id: string
  email: string
  display_name: string
  avatar_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  requested_at: string
  decided_at: string | null
  decided_by: string | null
}

function rowToWaitlist(r: WaitlistRowDb): WaitlistRow {
  return {
    id: r.id,
    provider: r.provider,
    providerId: r.provider_id,
    email: r.email,
    displayName: r.display_name,
    avatarUrl: r.avatar_url,
    status: r.status,
    note: r.note,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
  }
}

export async function listWaitlist(filter: {
  status?: 'pending' | 'approved' | 'rejected'
  q?: string
  limit?: number
  offset?: number
}): Promise<{ items: WaitlistRow[]; total: number }> {
  const where: string[] = []
  const params: unknown[] = []

  if (filter.status) {
    params.push(filter.status)
    where.push(`status = $${params.length}`)
  }

  const q = filter.q?.trim().toLowerCase()
  if (q) {
    params.push(`%${q}%`)
    where.push(`(
      LOWER(email) LIKE $${params.length}
      OR LOWER(display_name) LIKE $${params.length}
      OR LOWER(provider) LIKE $${params.length}
      OR LOWER(provider_id) LIKE $${params.length}
      OR LOWER(COALESCE(note, '')) LIKE $${params.length}
    )`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  // Count first (uses only filter params, no limit/offset)
  const countResult = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM waitlist ${whereSql}`,
    params,
  )
  const total = Number(countResult.rows[0]?.n ?? 0)

  const limit = Math.min(500, Math.max(1, filter.limit ?? 50))
  const offset = Math.max(0, filter.offset ?? 0)
  const limitParams = [...params, limit, offset]

  const { rows } = await pool.query<WaitlistRowDb>(
    `SELECT * FROM waitlist ${whereSql}
       ORDER BY requested_at DESC
       LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`,
    limitParams,
  )
  return { items: rows.map(rowToWaitlist), total }
}

/** Minimal HTML-attribute escape for values we interpolate into the
 *  welcome-email template (the user's displayName). Email HTML isn't a
 *  great place to leak a stray `<script>` even though no client renders
 *  it — keep it conservative. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Mark the configured approved-user entry URL for the waitlist gate. */
function approvedEntryUrl(raw: string): string {
  const u = new URL(raw)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('approved entry URL must use http(s)')
  u.searchParams.set('approved', '1')
  return u.toString()
}

/** Build the HTML body for the welcome email. Brand-aligned (Manrope
 *  system font stack, sky-blue → wisteria gradient CTA,
 *  paper background) and email-client-safe (table-based layout, inline
 *  styles, no external CSS). The hero + logo images live on R2 at
 *  deterministic keys under `email/`. */
function buildWelcomeEmailHtml(args: {
  firstName: string
  signInUrl: string
}): string {
  const cdn = env.R2_PUBLIC_BASE
  if (!cdn) throw new Error('R2_PUBLIC_BASE is required for welcome email assets')
  const heroUrl = `${cdn}/email/welcome-hero.png`
  const logoUrl = `${cdn}/email/logo.png`
  const name = escapeHtml(args.firstName)
  const fontStack = `'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`

  // Crop the hero to a banner via object-fit so the CTA stays above the
  // mobile fold. Native source is 1536×1024 (1.5:1) — without cropping it
  // renders 600×400, pushing the button off-screen on phones. Outlook
  // desktop ignores object-fit; other major clients honor it.
  const heroRow = `
        <tr>
          <td style="padding:0; line-height:0; font-size:0;">
            <img src="${heroUrl}" alt="" width="600" height="220" style="display:block; width:100%; max-width:600px; height:220px; object-fit:cover; object-position:center 55%; border-radius:16px 16px 0 0;" />
          </td>
        </tr>`

  const logoRow = `
        <tr>
          <td align="center" style="padding:36px 0 24px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle; padding-right:10px; line-height:0;">
                  <img src="${logoUrl}" alt="" width="32" height="32" style="display:block; width:32px; height:32px;" />
                </td>
                <td style="vertical-align:middle; font-family:${fontStack}; font-size:18px; font-weight:700; color:#0A1B2E; letter-spacing:-0.01em;">
                  LingxiLoop
                </td>
              </tr>
            </table>
          </td>
        </tr>`

  // Match the app's .btn-primary: solid var(--skype) (#00A8F0), white
  // text, 8px radius, ~14px font, weight 600. Bumped padding (14×28 vs
  // the app's tight 7×14) because email CTA needs a fatter touch target
  // than an in-app button.
  const ctaBlock = `
                  <tr>
                    <td style="padding:8px 0 0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                          <td bgcolor="#00A8F0" style="border-radius:8px; background:#00A8F0; mso-padding-alt:14px 28px;">
                            <a href="${args.signInUrl}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:${fontStack}; font-size:14px; font-weight:600; line-height:1; color:#FFFFFF; text-decoration:none; letter-spacing:0.01em;">
                              Open LingxiLoop &nbsp;→
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>Welcome to LingxiLoop</title>
</head>
<body style="margin:0; padding:0; background:#FAFCFE; color:#0A1B2E; font-family:${fontStack};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAFCFE;">
    <tr>
      <td align="center" style="padding:24px 16px 48px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">${logoRow}${heroRow}
          <tr>
            <td style="background:#FFFFFF; border-radius:0 0 16px 16px; padding:44px 44px 40px; box-shadow:0 1px 0 #E5ECF2;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${fontStack}; font-size:36px; font-weight:800; line-height:1.1; color:#0A1B2E; letter-spacing:-0.02em; padding:0 0 8px;">
                    You&rsquo;re in.
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:18px; font-weight:500; line-height:1.45; color:#233A53; padding:0 0 24px;">
                    Welcome to LingxiLoop, ${name}.
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:15px; font-weight:400; line-height:1.65; color:#233A53; padding:0 0 28px;">
                    Your workspace is set up and your learning team &mdash; Nova, Sage, Milo, Trace, Scout, and Forge &mdash; is already gathered there, ready to study with you. Sign in with the same Google or GitHub account you used to join the waitlist, and you&rsquo;ll land right in.
                  </td>
                </tr>${ctaBlock}
                <tr>
                  <td style="font-family:${fontStack}; font-size:12.5px; font-weight:400; line-height:1.55; color:#94A8BC; padding:14px 0 0;">
                    LingxiLoop works directly in your browser; no desktop installation is required.
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px 0 0;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr><td style="border-top:1px solid #E5ECF2; line-height:0; font-size:0;">&nbsp;</td></tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="font-family:${fontStack}; font-size:13px; font-weight:400; line-height:1.55; color:#5B7186; padding:20px 0 0;">
                    LingxiLoop is where small teams gather with AI agents as first-class teammates. We&rsquo;re early; expect rough edges and steady polish. Reply to this email if anything trips you up &mdash; a real person reads it.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="font-family:${fontStack}; font-size:12px; font-weight:400; line-height:1.5; color:#94A8BC; padding:24px 0 0;">
              &copy; LingxiLoop &middot; Where teams gather
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/** Notify a freshly approved waitlist user that they're in. Delivery is part
 *  of the approval contract; configuration and provider failures reject.
 *
 *  We emit both an HTML and a plain-text body — HTML clients render the
 *  branded layout (hero + Manrope-styled card + gradient CTA); text-only
 *  clients receive the plain version with the same information. */
async function sendWaitlistApprovedEmail(args: {
  email: string
  displayName: string
}): Promise<void> {
  if (!env.EMAIL_DOMAIN) throw new Error('EMAIL_DOMAIN is required')
  const fromAddr = `welcome@${env.EMAIL_DOMAIN}`
  const signInUrl = env.INVITE_BASE_URL
  const httpUrl = approvedEntryUrl(signInUrl)
  const firstName = (args.displayName.split(/\s+/)[0] || args.displayName).trim() || 'there'
  const ctaLine = `Sign in here: ${httpUrl}`
  const text = [
    `Hi ${firstName},`,
    ``,
    `You're in — welcome to LingxiLoop.`,
    ``,
    `Your workspace is set up and your learning team (Nova, Sage, Milo, Trace, Scout, Forge) is already gathered there, ready to study with you.`,
    ``,
    ctaLine,
    `Use the same LingxiIdentity account you used to join the waitlist.`,
    ``,
    `LingxiLoop works directly in your browser; no desktop installation is required.`,
    ``,
    `Reply to this email if anything trips you up — a real person reads it.`,
    ``,
    `— LingxiLoop`,
  ].join('\n')
  const html = buildWelcomeEmailHtml({ firstName, signInUrl: httpUrl })
  const res = await sendViaProvider({
    from: formatAddress(fromAddr, 'LingxiLoop'),
    to: [args.email],
    subject: `You're in — welcome to LingxiLoop`,
    text,
    html,
    messageId: mintMessageId(),
    autoSubmitted: 'auto-generated',
  })
  if (!res.ok) throw new Error(`waitlist-approved email failed: ${res.error}`)
}

/** Approve a waitlist row → create the real user + identity + personal
 *  company. Same shape as oauth.ts Path C; we have to
 *  duplicate the inserts here because oauth.ts assumes the
 *  exchange-code+fetch-profile preamble has just run. The waitlist row
 *  already carries everything we need including the OAuth provider's
 *  avatar URL, which we mirror to our CDN and stamp onto users.avatar_url
 *  so every workspace this user later joins reuses one face. */
export async function approveWaitlist(waitlistId: string, decidedBy: string): Promise<{ userId: string; companyId: string | null }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const r = await client.query<WaitlistRowDb>(
      `SELECT * FROM waitlist WHERE id = $1 FOR UPDATE`, [waitlistId],
    )
    const row = r.rows[0]
    if (!row) throw new HttpError(404, 'waitlist entry not found')
    if (row.status !== 'pending') throw new HttpError(409, `already ${row.status}`)

    // Reject if a user with this email already exists (somehow another
    // provider sign-in materialized them while they were waiting). We
    // could auto-link, but that opens a race we'd rather surface to the
    // admin: just delete the waitlist row and let them re-sign-in via
    // the existing path.
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1`,
      [row.email.toLowerCase()],
    )
    if (existing.rows[0]) {
      throw new HttpError(409, `a user with email ${row.email} already exists; reject this entry`)
    }

    // If the user has a pending invitation waiting (e.g. they clicked an
    // invite link FIRST and hit the waitlist gate before any account was
    // minted), skip the personal-workspace creation — they're here to join
    // someone else's workspace, not to own their own. Mirrors oauth.ts
    // Path C's `if (!inviteToken)` gate; the difference is that here the
    // invite signal isn't threaded through approval, so we sniff it out
    // by looking for an active invitation matching this email.
    const { rows: pendingInv } = await client.query<{ token_hash: string }>(
      `SELECT token_hash FROM company_invitations
        WHERE LOWER(email) = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
          AND use_count < max_uses
        LIMIT 1`,
      [row.email.toLowerCase()],
    )
    const skipPersonalWorkspace = pendingInv.length > 0

    const userId = `u-${randomUUID().slice(0, 12)}`
    await client.query(
      `INSERT INTO users (id, email, display_name, password_hash, email_verified_at, is_admin)
         VALUES ($1, $2, $3, NULL, NOW(), $4)`,
      [userId, row.email, row.display_name, isAllowlistedAdmin(row.email)],
    )
    await client.query(
      `INSERT INTO user_identities (provider, provider_id, user_id, email_lower)
         VALUES ($1, $2, $3, $4)`,
      [row.provider, row.provider_id, userId, row.email.toLowerCase()],
    )
    let companyId: string | null = null
    if (!skipPersonalWorkspace) {
      companyId = `co-${randomUUID().slice(0, 10)}`
      const slugSeed = (row.email.split('@')[0] || 'workspace').replace(/[^a-z0-9]+/g, '-').slice(0, 30) || 'workspace'
      let finalSlug = slugSeed
      for (let attempt = 0; attempt < 5; attempt++) {
        // SAVEPOINT per attempt: a duplicate-key error aborts the whole
        // transaction until rolled back, so without this the *retry* INSERT
        // fails with "current transaction is aborted". Slug collisions are
        // common in bulk approval (short local-parts like "info"/"me" recur),
        // so this path is hot, not theoretical.
        await client.query('SAVEPOINT company_ins')
        try {
          await client.query(
            `INSERT INTO companies (id, name, slug, owner_user_id) VALUES ($1, $2, $3, $4)`,
            [companyId, `${row.display_name}'s workspace`, finalSlug, userId],
          )
          await client.query('RELEASE SAVEPOINT company_ins')
          break
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (!/duplicate key/.test(msg)) throw e
          await client.query('ROLLBACK TO SAVEPOINT company_ins')
          finalSlug = `${slugSeed}-${randomUUID().slice(0, 4)}`
        }
      }
      await client.query(
        `INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [companyId, userId],
      )
    }

    // Mirror the provider avatar to our CDN and stamp users.avatar_url so
    // any later invite-accept into a second workspace reuses the same
    // face.
    const mirroredAvatar = await mirrorAvatar(userId, row.avatar_url)
    const avatar = mirroredAvatar
    await client.query(`UPDATE users SET avatar_url = $1 WHERE id = $2`, [avatar, userId])

    if (companyId) {
      await client.query(
        `INSERT INTO participants (id, kind, name, role, initial, avatar_bg, avatar_url, status, company_id)
           VALUES ($1, 'human', $2, NULL, $3, '#FF8870', $4, 'avail', $5)
           ON CONFLICT (id, company_id) DO NOTHING`,
        [userId, row.display_name, row.display_name.charAt(0).toUpperCase(), avatar, companyId],
      )
    }
    await client.query(
      `UPDATE waitlist SET status = 'approved', decided_at = NOW(), decided_by = $2 WHERE id = $1`,
      [waitlistId, decidedBy],
    )
    await client.query('COMMIT')

    if (companyId) {
      await onboardStarterAgents(companyId)
    }
    await sendWaitlistApprovedEmail({ email: row.email, displayName: row.display_name })
    return { userId, companyId }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}

export async function rejectWaitlist(waitlistId: string, decidedBy: string, note: string | null): Promise<void> {
  const r = await pool.query(
    `UPDATE waitlist
        SET status = 'rejected', decided_at = NOW(), decided_by = $2, note = $3
      WHERE id = $1 AND status = 'pending'`,
    [waitlistId, decidedBy, note],
  )
  if ((r.rowCount ?? 0) === 0) throw new HttpError(404, 'no pending waitlist entry')
}

/* ============== Suspension (admin-driven) ==============
 *
 * `users.suspended_at IS NOT NULL` is the canonical "this account is
 * disabled" predicate. Two consumers rely on it:
 *   1. `resolveSession` (auth.ts) — every authenticated request fails to
 *      resolve, so the user gets 401 even with a valid token. WS / runtime
 *      / inbound-email paths all share this gate transitively.
 *   2. OAuth `finalize` (oauth.ts) — returning users who pass through Path
 *      A/B can't mint a fresh session either; they're 302'd to a
 *      "suspended" screen with the admin's reason.
 *
 * Suspending also DELETEs every session row for that user, so anyone
 * with a live cookie/token loses access immediately rather than next time
 * resolveSession runs. We do this atomically with the status flip so
 * there's no window where the user is "marked suspended" but still has
 * a usable session.
 */

/** Stamp the suspension status, write an audit row, and revoke every live
 *  session for the user. Idempotent on already-suspended (no-op + 409 to
 *  surface the conflict in the admin UI). */
export async function suspendUser(args: {
  userId: string
  adminId: string
  reason: string | null
}): Promise<void> {
  // Defensive — admins shouldn't be able to suspend themselves (panel
  // would lock them out). Mirror the demote-self refusal in the patch
  // handler.
  if (args.userId === args.adminId) {
    throw new HttpError(409, 'cannot suspend yourself')
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const upd = await client.query<{ already: boolean }>(
      `UPDATE users
          SET suspended_at      = NOW(),
              suspension_reason = $2,
              suspended_by      = $3
        WHERE id = $1
          AND suspended_at IS NULL
        RETURNING FALSE AS already`,
      [args.userId, args.reason, args.adminId],
    )
    if ((upd.rowCount ?? 0) === 0) {
      // Either user doesn't exist, or already suspended. Distinguish with a
      // cheap follow-up read so the admin sees the right error message.
      const exists = await client.query(`SELECT 1 FROM users WHERE id = $1`, [args.userId])
      await client.query('ROLLBACK')
      if (exists.rowCount === 0) throw new HttpError(404, 'user not found')
      throw new HttpError(409, 'user is already suspended')
    }
    // Revoke every live session inside the same TX so there's no window
    // where suspended_at is set but a stale token still resolves. WS
    // connections drop on next message because their authenticated socket
    // doesn't re-check the DB, but the WS handshake itself requires a
    // fresh ws-ticket (which goes through resolveSession) so reconnects
    // are blocked too.
    await client.query(`DELETE FROM sessions WHERE user_id = $1`, [args.userId])
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
  // Audit row is outside the TX — audit is fire-and-forget by design and
  // we don't want a logging hiccup to roll back a real security action.
  await audit({
    kind: 'user_suspend',
    userId: args.adminId,
    detail: { targetUserId: args.userId, reason: args.reason ?? undefined },
  })
}

/** Reverse a suspension. Idempotent on already-active accounts (returns
 *  ok=true without touching audit). The user has to log in again — their
 *  sessions were cleared at suspend time. */
export async function unsuspendUser(args: {
  userId: string
  adminId: string
}): Promise<void> {
  const r = await pool.query(
    `UPDATE users
        SET suspended_at      = NULL,
            suspension_reason = NULL,
            suspended_by      = NULL
      WHERE id = $1
        AND suspended_at IS NOT NULL`,
    [args.userId],
  )
  if ((r.rowCount ?? 0) === 0) {
    // Distinguish "doesn't exist" from "wasn't suspended"; the panel
    // surfaces both differently.
    const exists = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [args.userId])
    if (exists.rowCount === 0) throw new HttpError(404, 'user not found')
    // Not-suspended is OK — calling unsuspend on an active user is a no-op.
    return
  }
  // Trail the reactivation: the users-row no longer remembers who lifted
  // the suspension (those columns are cleared on unsuspend), so this is
  // the only durable record of which admin re-opened the door.
  await audit({
    kind: 'user_unsuspend',
    userId: args.adminId,
    detail: { targetUserId: args.userId },
  })
}
