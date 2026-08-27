import { randomUUID, } from 'node:crypto'
import { Router } from 'express'
import { pool } from '../../db/pool.js'
import { HttpError } from '../../http/errors.js'
import { requireAuth, } from '../../http/request-context.js'

export const pushServiceRoutes = Router()
const api = pushServiceRoutes

/* ============== Push notification device registry =====================
 * Mobile clients (iOS via APNs today; Android/web later) register their
 * platform-issued push token here after the user grants permission. The
 * server stores at most one row per (platform, token) globally; if the
 * same device signs into a different account we steal the token row and
 * rebind user_id rather than letting it dangle on the old account and
 * deliver messages to the wrong person.
 *
 * No tenant scoping: a single human can be in multiple companies and
 * expects pushes from all of them on the same device. We do the
 * convo/company gating at SEND time (server/src/push.ts) instead.
 */
const VALID_PUSH_PLATFORMS = new Set(['ios', 'android', 'web'])

api.post('/push/register', async (req, res) => {
  try {
    const userId = requireAuth(req)
    const body = (req.body ?? {}) as {
      platform?: unknown
      token?: unknown
      appVersion?: unknown
      deviceModel?: unknown
    }
    const platform = typeof body.platform === 'string' ? body.platform : ''
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!VALID_PUSH_PLATFORMS.has(platform)) {
      throw new HttpError(400, 'platform must be ios | android | web')
    }
    if (!token) throw new HttpError(400, 'token required')
    if (token.length > 1024) throw new HttpError(400, 'token too long')
    const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 64) : null
    const deviceModel = typeof body.deviceModel === 'string' ? body.deviceModel.slice(0, 128) : null
    const id = `pd-${randomUUID()}`
    // Upsert keyed on (platform, token). The DO UPDATE block:
    //   - rebinds user_id (handles device-handoff between accounts)
    //   - refreshes last_seen_at so we know the token is live
    //   - clears disabled_at because the client just sent it again — must
    //     not still be dead from the provider's standpoint
    //   - takes the freshest app/model strings (don't overwrite with null)
    await pool.query(
      `INSERT INTO push_devices (id, user_id, platform, token, app_version, device_model)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (platform, token) DO UPDATE SET
         user_id      = EXCLUDED.user_id,
         last_seen_at = NOW(),
         disabled_at  = NULL,
         app_version  = COALESCE(EXCLUDED.app_version, push_devices.app_version),
         device_model = COALESCE(EXCLUDED.device_model, push_devices.device_model)`,
      [id, userId, platform, token, appVersion, deviceModel],
    )
    res.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error('[push] /push/register failed', e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

api.post('/push/unregister', async (req, res) => {
  try {
    const userId = requireAuth(req)
    const body = (req.body ?? {}) as { token?: unknown; platform?: unknown }
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) throw new HttpError(400, 'token required')
    // Soft-disable rather than DELETE. Keeps the audit trail and avoids
    // churning the UNIQUE index when a sign-out is immediately followed
    // by a re-sign-in on the same device. Scope by user_id so a stolen
    // session can't unregister another user's devices.
    await pool.query(
      `UPDATE push_devices
          SET disabled_at = NOW()
        WHERE token = $1
          AND user_id = $2
          AND disabled_at IS NULL`,
      [token, userId],
    )
    res.json({ ok: true })
  } catch (e) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); return }
    console.error('[push] /push/unregister failed', e)
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})
