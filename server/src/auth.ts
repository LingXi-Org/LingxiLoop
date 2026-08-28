/**
 * Auth primitives — session tokens, gravatar, audit log, WS tickets,
 * Express middleware. Identity itself comes from OAuth (Google + GitHub)
 * — see oauth.ts. No native deps; everything is Node stdlib.
 *
 * Threat model:
 *  - DB compromise: session/ws-ticket tokens are stored as sha256(token);
 *    the raw token is only held in memory + on the wire, so a DB leak
 *    does NOT yield usable session tokens (assuming sha256 preimage is hard).
 *  - Token sniffing: tokens travel as Authorization headers; HTTPS-only in
 *    prod is the deploy-side responsibility.
 *  - CSRF: tokens are sent via Authorization header (not cookies), so no
 *    cross-origin form auto-submit can carry them.
 *  - Identity binding: OAuth provider attests to email ownership; we never
 *    accept self-asserted passwords.
 */
import { randomBytes, createHash } from 'node:crypto'
import { pool } from './db/pool.js'

/** Generate a fresh 256-bit URL-safe session token. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Hash a token for at-rest storage. The DB only ever sees this digest;
 *  the raw token is what we hand back to the client. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url')
}

/**
 * Derive a Gravatar avatar URL from an email. Uses Gravatar's standard
 * "lowercase-trim-md5" key. `d=identicon` makes Gravatar generate a
 * deterministic geometric avatar when the user hasn't claimed the email,
 * so every human gets SOMETHING visual without us paying for an upload.
 *
 * `s=256` requests a 256px PNG — enough resolution for the largest avatar
 * surface in the app (88px InfoPane header @ 2x DPR ≈ 176, with margin).
 */
export function gravatarUrlForEmail(email: string): string {
  const normalized = email.trim().toLowerCase()
  const md5 = createHash('md5').update(normalized).digest('hex')
  return `https://www.gravatar.com/avatar/${md5}?d=identicon&s=256`
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30  // 30 days hard cap
/** Idle expiry — sessions unused for this long are also rejected, even if
 *  their hard expires_at hasn't passed. Limits the blast radius of a
 *  stolen but stale token. */
const SESSION_IDLE_TTL_MS = 1000 * 60 * 60 * 24 * 14  // 14 days idle

/** Create a session row and return the raw token. */
export async function createSession(userId: string, opts: { ip?: string; ua?: string }): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await pool.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [hashToken(token), userId, expiresAt, opts.ip ?? null, opts.ua ?? null],
  )
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId])
  return { token, expiresAt }
}

/** Look up an active session by token, sliding-update last_used_at.
 *  Rejects on hard expiry OR idle expiry OR account suspension (whichever
 *  hits first). The JOIN onto `users` is the suspension gate — we don't
 *  trust just-the-session being valid; the user behind it has to be
 *  un-suspended too. This adds one row's worth of work per request and is
 *  the only correct place to put the check (per-route checks would leave
 *  WS / runtime / inbound-email paths open). */
export async function resolveSession(token: string): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(token)
  const { rows } = await pool.query<{
    user_id: string; expires_at: string; last_used_at: string
    suspended_at: string | null; deleted_at: string | null
  }>(
    `SELECT s.user_id, s.expires_at, s.last_used_at, u.suspended_at, u.deleted_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1`,
    [tokenHash],
  )
  if (!rows[0]) return null
  const now = Date.now()
  const expired = new Date(rows[0].expires_at).getTime() < now
  const idle = new Date(rows[0].last_used_at).getTime() < now - SESSION_IDLE_TTL_MS
  if (expired || idle) {
    await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [tokenHash])
    return null
  }
  if (rows[0].suspended_at || rows[0].deleted_at) {
    // Defense in depth. suspendUser / deleteAccount already DELETE
    // every session row for this user as part of the same
    // transaction, but the small window between "stamp the column"
    // and "delete sessions" — plus any session minted by an
    // in-flight OAuth callback racing the operation — could
    // otherwise sneak past. Reject here too.
    // We do NOT delete the session row in this code path: the
    // sessions table is a write-heavy hot path and we don't want
    // every read of a stale token to fan out into a write. The
    // cleanup already happened (or is happening) atomically.
    return null
  }
  void pool.query(`UPDATE sessions SET last_used_at = NOW() WHERE token_hash = $1`, [tokenHash])
  return { userId: rows[0].user_id }
}

export async function deleteSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)])
}

/* ============== Audit log ============== */

export async function audit(args: {
  kind: string
  userId?: string | null
  companyId?: string | null
  ip?: string | null
  userAgent?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events (user_id, company_id, ip, user_agent, kind, detail)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.userId ?? null, args.companyId ?? null, args.ip ?? null,
      args.userAgent ?? null, args.kind,
      args.detail ? JSON.stringify(args.detail) : null,
    ],
  )
}

/* ============== WebSocket short-lived tickets ============== */

const WS_TICKET_TTL_MS = 60_000  // 60 seconds — just enough for handshake

/** Mint a one-shot ticket for the WS handshake. Returns the RAW ticket
 *  (only stored hashed). Client puts this on the WS connect URL; server
 *  consumes it on connect. Never echo session tokens through the WS query. */
export async function createWsTicket(userId: string): Promise<{ ticket: string; expiresAt: Date }> {
  const ticket = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + WS_TICKET_TTL_MS)
  await pool.query(
    `INSERT INTO ws_tickets (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [hashToken(ticket), userId, expiresAt],
  )
  return { ticket, expiresAt }
}

/** Single-use consume — atomically marks the ticket used and returns userId.
 *  Refuses already-used, expired, or unknown tickets. */
export async function consumeWsTicket(ticket: string): Promise<{ userId: string } | null> {
  const hash = hashToken(ticket)
  const upd = await pool.query<{ user_id: string }>(
    `UPDATE ws_tickets SET used_at = NOW()
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING user_id`,
    [hash],
  )
  if ((upd.rowCount ?? 0) === 0) return null
  return { userId: upd.rows[0].user_id }
}

/* ============== Express middleware ============== */

export interface AuthedRequest {
  /** Set by `authMiddleware` when a valid session is present. */
  authUserId?: string
}

/**
 * Reads `Authorization: Bearer <token>` (or `x-session-token` header for
 * websocket-style clients), looks up the session, attaches userId.
 * Does NOT itself reject — handlers / `requireAuth` decide if auth is needed.
 */
export async function authMiddleware(
  req: { headers: Record<string, string | string[] | undefined> } & AuthedRequest,
  _res: unknown,
  next: () => void,
): Promise<void> {
  let token: string | undefined
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) token = auth.slice(7).trim()
  if (!token) {
    const h = req.headers['x-session-token']
    if (typeof h === 'string') token = h.trim()
  }
  if (token) {
    const session = await resolveSession(token)
    if (session) req.authUserId = session.userId
  }
  next()
}
