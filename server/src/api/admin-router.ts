/**
 * Admin REST surface — mounted at /api/admin/* by router.ts.
 *
 * Every route here first runs requireAdmin (which itself relies on the
 * shared authMiddleware having attached a userId on the outer router).
 * The non-admin paths used to live on the main router; they're isolated
 * here so the surface area is easy to audit and a stray route can't
 * accidentally land unprotected.
 *
 * Conventions:
 *   - JSON in, JSON out. Camel-case fields on the wire.
 *   - Mutations call the helpers in admin.ts (so they can be reused by
 *     a future CLI without duplicating the logic).
 *   - All handlers wrapped in safe() so HttpError → status code; the
 *     parent router's errorHandler catches everything else.
 */
import { type NextFunction, type Request, type Response, Router } from 'express'
import {
  type AppSettings, approveWaitlist,
  getSettings, HttpError,
  listWaitlist, rejectWaitlist,
  requireAdmin, setSetting,
  suspendUser, unsuspendUser,
} from '../admin.js'
import type { AuthedRequest } from '../auth.js'
import { pool } from '../db/pool.js'
import { EvalInputError, validateEvalRunInput } from '../eval/contracts.js'
import { createEvalRun, getEvalComparison, getEvalDashboard, getEvalRunDetail } from '../eval/service.js'

export const adminRouter = Router()

function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void> | void) {
  return async (req: Request & AuthedRequest, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (e) {
      if (e instanceof HttpError) {
        res.status(e.status).json({ error: e.message })
        return
      }
      console.error('[admin-api] unhandled', e)
      next(e)
    }
  }
}

/**
 * Tiny in-process TTL cache for expensive read-only admin aggregations.
 *
 * The Observability page refetches its whole 6-query fan-out on every filter
 * toggle (sinceDays / model / companyId), and the operator flips those back and
 * forth — so the SAME heavy aggregation gets recomputed seconds apart. A short
 * TTL collapses those repeats to one DB round-trip without making the numbers
 * meaningfully stale (a spend dashboard does not need second-level freshness).
 * Single-pod-local + unbounded-by-design: keys are low-cardinality (a handful
 * of sinceDays × model × tenant combos) and entries self-expire, so it never
 * grows without bound.
 */
/* ============== /me — admin gate probe ============== */

/** Cheap "am I an admin?" check the renderer hits before bothering to
 *  load anything else. Returns 403 from requireAdmin if not. */
adminRouter.get('/me', safe(async (req, res) => {
  const uid = await requireAdmin(req)
  res.json({ userId: uid, isAdmin: true })
}))
/* ============== Settings ============== */

adminRouter.get('/settings', safe(async (req, res) => {
  await requireAdmin(req)
  const s = await getSettings()
  res.json(s)
}))
adminRouter.put('/settings', safe(async (req, res) => {
  const uid = await requireAdmin(req)
  const body = (req.body ?? {}) as Partial<AppSettings>
  const updates: Array<[keyof AppSettings, boolean]> = []
  if (typeof body.waitlist_enabled === 'boolean') updates.push(['waitlist_enabled', body.waitlist_enabled])
  if (typeof body.signups_paused === 'boolean')   updates.push(['signups_paused',   body.signups_paused])
  if (updates.length === 0) throw new HttpError(400, 'no settings to update')
  for (const [k, v] of updates) await setSetting(k, v, uid)
  res.json(await getSettings())
}))

/* ============== Users ============== */

interface UserRowDb {
  id: string
  email: string
  display_name: string
  avatar_url: string | null
  is_admin: boolean
  created_at: string
  last_login_at: string | null
  company_count: string
  suspended_at: string | null
  suspension_reason: string | null
  suspended_by: string | null
}

function rowToUser(r: UserRowDb): Record<string, unknown> {
  return {
    id: r.id,
    email: r.email,
    name: r.display_name,
    avatarUrl: r.avatar_url,
    isAdmin: r.is_admin,
    createdAt: r.created_at,
    lastLoginAt: r.last_login_at,
    companyCount: Number(r.company_count),
    // Suspension snapshot. `suspended` is the derived boolean the UI
    // actually renders ("Suspended" badge / orange row); the timestamp +
    // reason + actor are surfaced in the detail drawer so an admin can
    // see when + why + who without grepping audit_events.
    suspended: r.suspended_at !== null,
    suspendedAt: r.suspended_at,
    suspensionReason: r.suspension_reason,
    suspendedBy: r.suspended_by,
  }
}

/** Paginated user list with optional search by email/name. */
adminRouter.get('/users', safe(async (req, res) => {
  await requireAdmin(req)
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim()
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
  const offset = Math.max(0, Number(req.query.offset) || 0)

  const where: string[] = []
  const params: unknown[] = []
  if (q) {
    params.push(`%${q.toLowerCase()}%`)
    where.push(`(LOWER(u.email) LIKE $${params.length} OR LOWER(u.display_name) LIKE $${params.length})`)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  params.push(limit)
  params.push(offset)
  const { rows } = await pool.query<UserRowDb>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, u.is_admin,
            u.created_at, u.last_login_at,
            u.suspended_at, u.suspension_reason, u.suspended_by,
            (SELECT COUNT(*)::int FROM company_members cm WHERE cm.user_id = u.id) AS company_count
       FROM users u
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
  const { rows: countRows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM users u ${whereSql}`,
    params.slice(0, params.length - 2),
  )
  res.json({
    items: rows.map(rowToUser),
    total: Number(countRows[0]?.n ?? 0),
    limit,
    offset,
  })
}))

/** User detail — same fields as the list plus the company list and per-company
 *  agent counts. */
adminRouter.get('/users/:id', safe(async (req, res) => {
  await requireAdmin(req)
  const id = String(req.params.id)
  const { rows } = await pool.query<UserRowDb>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, u.is_admin,
            u.created_at, u.last_login_at,
            u.suspended_at, u.suspension_reason, u.suspended_by,
            (SELECT COUNT(*)::int FROM company_members cm WHERE cm.user_id = u.id) AS company_count
       FROM users u WHERE u.id = $1`,
    [id],
  )
  if (!rows[0]) throw new HttpError(404, 'user not found')

  const { rows: companies } = await pool.query<{
    id: string; name: string; slug: string; role: string; created_at: string; agent_count: number
  }>(
    `SELECT c.id, c.name, c.slug, cm.role, c.created_at,
            (SELECT COUNT(*)::int FROM participants p
              WHERE p.company_id = c.id AND p.kind = 'agent' AND p.departed_at IS NULL) AS agent_count
       FROM company_members cm
       JOIN companies c ON c.id = cm.company_id
      WHERE cm.user_id = $1
      ORDER BY cm.joined_at ASC`,
    [id],
  )
  res.json({
    ...rowToUser(rows[0]),
    companies: companies.map((c) => ({
      id: c.id, name: c.name, slug: c.slug, role: c.role,
      createdAt: c.created_at, agentCount: Number(c.agent_count),
    })),
  })
}))

/** Patch admin bit and/or suspension state. Returns the refreshed
 *  user row. All three fields are independently optional — the patch is
 *  field-wise, mirroring how the admin UI sends each toggle separately. */
adminRouter.patch('/users/:id', safe(async (req, res) => {
  const adminId = await requireAdmin(req)
  const id = String(req.params.id)
  const body = (req.body ?? {}) as {
    isAdmin?: boolean
    suspended?: boolean
    suspensionReason?: string | null
  }

  if (typeof body.isAdmin === 'boolean') {
    // Refuse to demote yourself — easy way to lock the panel against
    // its only operator. Demoting another admin is fine.
    if (id === adminId && body.isAdmin === false) {
      throw new HttpError(409, 'cannot demote yourself')
    }
    const r = await pool.query(
      `UPDATE users SET is_admin = $2 WHERE id = $1`,
      [id, body.isAdmin],
    )
    if ((r.rowCount ?? 0) === 0) throw new HttpError(404, 'user not found')
  }

  if (typeof body.suspended === 'boolean') {
    if (body.suspended) {
      // suspendUser handles "cannot suspend self" + already-suspended cases
      // internally and throws HttpError, which safe() forwards.
      const rawReason = typeof body.suspensionReason === 'string'
        ? body.suspensionReason.trim().slice(0, 500) || null
        : null
      await suspendUser({ userId: id, adminId, reason: rawReason })
    } else {
      await unsuspendUser({ userId: id, adminId })
    }
  }

  const { rows } = await pool.query<UserRowDb>(
    `SELECT u.id, u.email, u.display_name, u.avatar_url, u.is_admin,
            u.created_at, u.last_login_at,
            u.suspended_at, u.suspension_reason, u.suspended_by,
            (SELECT COUNT(*)::int FROM company_members cm WHERE cm.user_id = u.id) AS company_count
       FROM users u WHERE u.id = $1`,
    [id],
  )
  if (!rows[0]) throw new HttpError(404, 'user not found')
  res.json(rowToUser(rows[0]))
}))

/* ============== Waitlist ============== */

adminRouter.get('/waitlist', safe(async (req, res) => {
  await requireAdmin(req)
  const statusParam = typeof req.query.status === 'string' ? req.query.status : ''
  const status: 'pending' | 'approved' | 'rejected' | undefined =
    statusParam === 'pending' || statusParam === 'approved' || statusParam === 'rejected'
      ? statusParam
      : undefined
  const q = (typeof req.query.q === 'string' ? req.query.q : '').trim()
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50))
  const offset = Math.max(0, Number(req.query.offset) || 0)
  const { items, total } = await listWaitlist({
    ...(status ? { status } : {}),
    ...(q ? { q } : {}),
    limit,
    offset,
  })
  res.json({ items, total, limit, offset })
}))

adminRouter.post('/waitlist/:id/approve', safe(async (req, res) => {
  const adminId = await requireAdmin(req)
  const result = await approveWaitlist(String(req.params.id), adminId)
  res.json(result)
}))

adminRouter.post('/waitlist/:id/reject', safe(async (req, res) => {
  const adminId = await requireAdmin(req)
  const body = (req.body ?? {}) as { note?: unknown }
  const note = typeof body.note === 'string' ? body.note : null
  await rejectWaitlist(String(req.params.id), adminId, note)
  res.json({ ok: true })
}))

/* ============== Quick stats — for the dashboard header ============== */

adminRouter.get('/stats', safe(async (req, res) => {
  await requireAdmin(req)
  const [users, waitlist, companies, agents] = await Promise.all([
    pool.query<{ total: string; admins: string }>(
      `SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE is_admin)::text AS admins FROM users`,
    ),
    pool.query<{ pending: string; approved: string; rejected: string }>(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending')::text  AS pending,
              COUNT(*) FILTER (WHERE status = 'approved')::text AS approved,
              COUNT(*) FILTER (WHERE status = 'rejected')::text AS rejected
         FROM waitlist`,
    ),
    pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM companies`),
    pool.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM participants WHERE kind = 'agent' AND departed_at IS NULL`),
  ])
  res.json({
    users: {
      total:  Number(users.rows[0]?.total ?? 0),
      admins: Number(users.rows[0]?.admins ?? 0),
    },
    waitlist: {
      pending:  Number(waitlist.rows[0]?.pending ?? 0),
      approved: Number(waitlist.rows[0]?.approved ?? 0),
      rejected: Number(waitlist.rows[0]?.rejected ?? 0),
    },
    companies: Number(companies.rows[0]?.n ?? 0),
    agents:    Number(agents.rows[0]?.n ?? 0),
  })
}))

/* ============== Agent Eval — deterministic pipeline + history ========= */

function rethrowEvalError(error: unknown): never {
  if (error instanceof EvalInputError) throw new HttpError(400, error.message)
  const status = Number((error as { status?: unknown } | null)?.status)
  if (status >= 400 && status <= 599) {
    throw new HttpError(status, error instanceof Error ? error.message : String(error))
  }
  throw error
}

/** Evaluate one immutable suite run. Cases may contain an inline observation,
 *  an Agent OS run id to hydrate, or both (inline fields override hydrated
 *  fields for controlled regression fixtures). Evaluation is synchronous and
 *  deterministic; a successful response means the full report was committed. */
adminRouter.post('/eval/runs', safe(async (req, res) => {
  const adminId = await requireAdmin(req)
  try {
    const input = validateEvalRunInput(req.body)
    const result = await createEvalRun(input, adminId)
    res.status(201).json(result)
  } catch (error) {
    rethrowEvalError(error)
  }
}))

/** Compact board payload: summary KPIs, stage averages, version deltas and the
 *  recent immutable run list. Detail/findings are loaded only on selection. */
adminRouter.get('/eval/runs', safe(async (req, res) => {
  await requireAdmin(req)
  const suiteKey = typeof req.query.suiteKey === 'string' && req.query.suiteKey.trim()
    ? req.query.suiteKey.trim()
    : undefined
  const rawLimit = Number(req.query.limit ?? 80)
  const rawDays = Number(req.query.sinceDays ?? 90)
  res.json(await getEvalDashboard({
    suiteKey,
    limit: Number.isFinite(rawLimit) ? rawLimit : 80,
    sinceDays: Number.isFinite(rawDays) ? rawDays : 90,
  }))
}))

adminRouter.get('/eval/compare', safe(async (req, res) => {
  await requireAdmin(req)
  const baseRunId = typeof req.query.baseRunId === 'string' ? req.query.baseRunId.trim() : ''
  const candidateRunId = typeof req.query.candidateRunId === 'string' ? req.query.candidateRunId.trim() : ''
  if (!baseRunId || !candidateRunId) throw new HttpError(400, 'baseRunId and candidateRunId are required')
  try {
    res.json(await getEvalComparison(baseRunId, candidateRunId))
  } catch (error) {
    rethrowEvalError(error)
  }
}))

adminRouter.get('/eval/runs/:id', safe(async (req, res) => {
  await requireAdmin(req)
  try {
    res.json(await getEvalRunDetail(String(req.params.id)))
  } catch (error) {
    rethrowEvalError(error)
  }
}))
