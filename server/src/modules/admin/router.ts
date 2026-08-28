/**
 * Admin REST surface — mounted at /api/admin/* by router.ts.
 *
 * Every route delegates authorization to AdminApplication using the trusted
 * auth context attached by the outer router.
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
  setSetting,
} from '../../admin.js'
import type { AuthedRequest } from '../../auth.js'
import { EvalInputError, validateEvalRunInput } from '../../eval/contracts.js'
import { createEvalRun, getEvalComparison, getEvalDashboard, getEvalRunDetail } from '../../eval/service.js'
import { AdminApplicationError } from './application.js'
import { adminUserListQuerySchema, adminUserPatchSchema } from './contracts.js'
import { adminApplication } from './facade.js'

export const adminRouter = Router()

function safe(handler: (req: Request & AuthedRequest, res: Response) => Promise<void> | void) {
  return async (req: Request & AuthedRequest, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (e) {
      if (e instanceof HttpError || e instanceof AdminApplicationError) {
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

/** Cheap "am I an admin?" check the renderer hits before loading anything else. */
adminRouter.get('/me', safe(async (req, res) => {
  const uid = await adminApplication.authorize(req.authUserId)
  res.json({ userId: uid, isAdmin: true })
}))
/* ============== Settings ============== */

adminRouter.get('/settings', safe(async (req, res) => {
  await adminApplication.authorize(req.authUserId)
  const s = await getSettings()
  res.json(s)
}))
adminRouter.put('/settings', safe(async (req, res) => {
  const uid = await adminApplication.authorize(req.authUserId)
  const body = (req.body ?? {}) as Partial<AppSettings>
  const updates: Array<[keyof AppSettings, boolean]> = []
  if (typeof body.waitlist_enabled === 'boolean') updates.push(['waitlist_enabled', body.waitlist_enabled])
  if (typeof body.signups_paused === 'boolean')   updates.push(['signups_paused',   body.signups_paused])
  if (updates.length === 0) throw new HttpError(400, 'no settings to update')
  for (const [k, v] of updates) await setSetting(k, v, uid)
  res.json(await getSettings())
}))

/* ============== Users ============== */

/** Paginated user list with optional search by email/name. */
adminRouter.get('/users', safe(async (req, res) => {
  const input = adminUserListQuerySchema.parse(req.query)
  res.json(await adminApplication.users(req.authUserId, input))
}))

/** User detail — same fields as the list plus the company list and per-company
 *  agent counts. */
adminRouter.get('/users/:id', safe(async (req, res) => {
  res.json(await adminApplication.user(req.authUserId, String(req.params.id)))
}))

/** Patch admin bit and/or suspension state. Returns the refreshed
 *  user row. All three fields are independently optional — the patch is
 *  field-wise, mirroring how the admin UI sends each toggle separately. */
adminRouter.patch('/users/:id', safe(async (req, res) => {
  const input = adminUserPatchSchema.parse(req.body ?? {})
  res.json(await adminApplication.patchUser(req.authUserId, String(req.params.id), input))
}))

/* ============== Waitlist ============== */

adminRouter.get('/waitlist', safe(async (req, res) => {
  await adminApplication.authorize(req.authUserId)
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
  const adminId = await adminApplication.authorize(req.authUserId)
  const result = await approveWaitlist(String(req.params.id), adminId)
  res.json(result)
}))

adminRouter.post('/waitlist/:id/reject', safe(async (req, res) => {
  const adminId = await adminApplication.authorize(req.authUserId)
  const body = (req.body ?? {}) as { note?: unknown }
  const note = typeof body.note === 'string' ? body.note : null
  await rejectWaitlist(String(req.params.id), adminId, note)
  res.json({ ok: true })
}))

/* ============== Quick stats — for the dashboard header ============== */

adminRouter.get('/stats', safe(async (req, res) => {
  res.json(await adminApplication.stats(req.authUserId))
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
  const adminId = await adminApplication.authorize(req.authUserId)
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
  await adminApplication.authorize(req.authUserId)
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
  await adminApplication.authorize(req.authUserId)
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
  await adminApplication.authorize(req.authUserId)
  try {
    res.json(await getEvalRunDetail(String(req.params.id)))
  } catch (error) {
    rethrowEvalError(error)
  }
}))
