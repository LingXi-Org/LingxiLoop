/**
 * FCM (Firebase Cloud Messaging) sender — HTTP v1 API, for Android push.
 *
 * The Android counterpart to the APNs path in `push.ts`. No third-party
 * Firebase SDK: we mint a Google OAuth2 access token from the service
 * account (RS256-signed assertion → token endpoint), cache it for ~50 min
 * (Google issues 1-hour tokens), and POST each message to
 * `https://fcm.googleapis.com/v1/projects/{projectId}/messages:send`.
 *
 * Soft-disabled when the service account is absent: `fcmConfigured()`
 * returns false and `fcmSendOne` is never reached (push.ts checks first).
 * This lets a dev environment boot without Firebase creds dropped in.
 *
 * Dead-token housekeeping is signalled back to push.ts via `dead: true` on
 * the result — FCM reports an unregistered/invalid token as HTTP 404
 * (UNREGISTERED) or 400 (INVALID_ARGUMENT); push.ts then disables the row.
 */
import { readFileSync } from 'node:fs'
import { createSign } from 'node:crypto'
import { env } from './env.js'
import type { PushPayload } from './push.js'

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

export interface FcmResult {
  ok: boolean
  status: number
  /** True when FCM says this token is permanently gone — caller disables it. */
  dead?: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// Service-account loading. Accept the JSON inline (raw or base64) or via a
// file path. Parsed once and cached.
// ---------------------------------------------------------------------------

let cachedAccount: ServiceAccount | null = null
let accountLoadFailed = false
let credsLogged = false

function loadAccount(): ServiceAccount | null {
  if (cachedAccount) return cachedAccount
  if (accountLoadFailed) return null
  let raw = ''
  try {
    if (env.FCM_SERVICE_ACCOUNT_JSON) {
      const v = env.FCM_SERVICE_ACCOUNT_JSON.trim()
      // Heuristic: a JSON object starts with `{`; anything else we treat as base64.
      raw = v.startsWith('{') ? v : Buffer.from(v, 'base64').toString('utf8')
    } else if (env.FCM_SERVICE_ACCOUNT_PATH) {
      raw = readFileSync(env.FCM_SERVICE_ACCOUNT_PATH, 'utf8')
    } else {
      return null
    }
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      throw new Error('service account JSON missing project_id/client_email/private_key')
    }
    // Env-var transport often escapes newlines in the PEM — restore them.
    const private_key = parsed.private_key.includes('\\n')
      ? parsed.private_key.replace(/\\n/g, '\n')
      : parsed.private_key
    cachedAccount = { project_id: parsed.project_id, client_email: parsed.client_email, private_key }
    return cachedAccount
  } catch (e) {
    accountLoadFailed = true
    console.warn('[fcm] failed to load service account — Android push disabled', e)
    return null
  }
}

export function fcmConfigured(): boolean {
  const ok = Boolean(loadAccount())
  if (!ok && !credsLogged) {
    console.warn('[fcm] FCM service account not configured (FCM_SERVICE_ACCOUNT_JSON / FCM_SERVICE_ACCOUNT_PATH) — Android push send path is a no-op.')
    credsLogged = true
  }
  return ok
}

// ---------------------------------------------------------------------------
// OAuth2 access token — RS256 assertion exchanged at Google's token endpoint.
// Cached for 50 min (Google's tokens last ~1 h).
// ---------------------------------------------------------------------------

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const TOKEN_TTL_MS = 50 * 60 * 1000

let cachedToken: { value: string; mintedAt: number } | null = null

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function getAccessToken(account: ServiceAccount): Promise<string | null> {
  const now = Date.now()
  if (cachedToken && now - cachedToken.mintedAt < TOKEN_TTL_MS) return cachedToken.value

  const iat = Math.floor(now / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat,
    exp: iat + 3600,
  }))
  const signingInput = `${header}.${claims}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const assertion = `${signingInput}.${b64url(signer.sign(account.private_key))}`

  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    })
    if (!res.ok) {
      console.warn('[fcm] token endpoint returned', res.status, (await res.text()).slice(0, 200))
      return null
    }
    const json = await res.json() as { access_token?: string }
    if (!json.access_token) return null
    cachedToken = { value: json.access_token, mintedAt: now }
    return json.access_token
  } catch (e) {
    console.warn('[fcm] token request failed', e)
    return null
  }
}

// ---------------------------------------------------------------------------
// Send one message. Mirrors the APNs sendOne signature so push.ts can treat
// both senders uniformly.
// ---------------------------------------------------------------------------

/** FCM error statuses that mean the token is permanently invalid — the
 *  device app was uninstalled or the token was never valid for this sender. */
const DEAD_STATUSES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND', 'SENDER_ID_MISMATCH'])

export async function fcmSendOne(token: string, payload: PushPayload): Promise<FcmResult> {
  const account = loadAccount()
  if (!account) return { ok: false, status: 0, reason: 'not-configured' }
  const accessToken = await getAccessToken(account)
  if (!accessToken) return { ok: false, status: 0, reason: 'no-access-token' }

  // FCM data values must all be strings. Stringify the custom payload so the
  // Android client reads them back as strings (matching applyDeepLink, which
  // already treats data values as strings).
  const data: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload.data ?? {})) {
    if (v !== null && v !== undefined) data[k] = String(v)
  }

  const message: Record<string, unknown> = {
    token,
    notification: { title: payload.title, body: payload.body },
    data,
    android: {
      priority: 'high',
      notification: {
        // Collapse a noisy convo into one stack on the shade, mirroring the
        // APNs thread-id behaviour.
        ...(payload.threadId ? { tag: payload.threadId } : {}),
        sound: 'default',
      },
    },
  }

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message }),
      },
    )
    if (res.ok) return { ok: true, status: res.status }
    let reason: string | undefined
    try {
      const body = await res.json() as { error?: { status?: string; details?: Array<{ errorCode?: string }> } }
      reason = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status
    } catch { /* ignore */ }
    const dead = res.status === 404 || (reason ? DEAD_STATUSES.has(reason) : false)
    return { ok: false, status: res.status, dead, reason }
  } catch (e) {
    console.warn('[fcm] send threw', e)
    return { ok: false, status: 0, reason: 'fetch-error' }
  }
}
