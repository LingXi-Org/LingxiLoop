import { Router, type Request, type Response, type NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import type { Pool } from 'pg'
import type { AuthedRequest } from '../auth.js'

type CompanyContext = { userId: string; companyId: string }
type CompanyRoleContext = CompanyContext & { role: string }

export interface ShippingRouterDeps {
  pool: Pool
  requireCompany(req: Request & AuthedRequest): Promise<CompanyContext>
  requireCompanyRole(req: Request & AuthedRequest): Promise<CompanyRoleContext>
}

class ShippingError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const FEATURE_STATUSES = new Set([
  'draft', 'contract', 'building', 'verifying', 'ready', 'releasing',
  'watching', 'learned', 'paused', 'archived',
])
const PRIORITIES = new Set(['critical', 'high', 'medium', 'low'])
const RISK_LEVELS = new Set(['critical', 'high', 'medium', 'low'])
const INVARIANT_KINDS = new Set(['behavior', 'architecture', 'data', 'security', 'performance', 'ux', 'operability'])
const VERIFICATION_METHODS = new Set([
  'user_path', 'property', 'trace', 'data_reconciliation', 'design_qa',
  'security', 'performance', 'release_note',
])
const VERIFICATION_STATUSES = new Set(['pending', 'running', 'passed', 'failed', 'waived'])
const RELEASE_ENVIRONMENTS = new Set(['development', 'staging', 'canary', 'production'])
const FRICTION_SEVERITIES = new Set(['critical', 'high', 'medium', 'low'])
const FRICTION_FREQUENCIES = new Set(['once', 'occasional', 'frequent', 'constant'])
const FRICTION_STATUSES = new Set(['open', 'triaged', 'planned', 'resolved', 'dismissed'])
const REGRESSION_KINDS = new Set(['automated', 'benchmark', 'manual_replay', 'monitor'])
const REGRESSION_STATUSES = new Set(['active', 'passing', 'failing', 'disabled'])

const FEATURE_TRANSITIONS: Record<string, ReadonlySet<string>> = {
  draft: new Set(['contract', 'paused', 'archived']),
  contract: new Set(['building', 'draft', 'paused', 'archived']),
  building: new Set(['verifying', 'paused', 'archived']),
  verifying: new Set(['building', 'ready', 'paused', 'archived']),
  ready: new Set(['releasing', 'building', 'paused', 'archived']),
  releasing: new Set(['watching', 'ready', 'paused', 'archived']),
  watching: new Set(['learned', 'releasing', 'paused', 'archived']),
  learned: new Set(['building', 'archived']),
  paused: new Set(['draft', 'contract', 'building', 'verifying', 'ready', 'archived']),
  archived: new Set([]),
}

function text(value: unknown, max = 20_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function optionalText(value: unknown, max = 2_000): string | null {
  const result = text(value, max)
  return result || null
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function stringArray(value: unknown, max = 100): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean))].slice(0, max)
}

function jsonArray(value: unknown, max = 100): unknown[] {
  return Array.isArray(value) ? value.slice(0, max) : []
}

function enumValue(value: unknown, allowed: ReadonlySet<string>, fallback: string): string {
  return typeof value === 'string' && allowed.has(value) ? value : fallback
}

function isoOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = new Date(String(value))
  if (Number.isNaN(parsed.getTime())) throw new ShippingError(400, 'invalid timestamp')
  return parsed
}

async function recordEvent(
  pool: Pick<Pool, 'query'>,
  args: { companyId: string; featureId?: string | null; actorId?: string | null; kind: string; data?: unknown },
): Promise<void> {
  await pool.query(
    `INSERT INTO shipping_events (id, company_id, feature_id, actor_id, kind, data)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [`se-${randomUUID()}`, args.companyId, args.featureId ?? null, args.actorId ?? null, args.kind, JSON.stringify(args.data ?? {})],
  )
}

async function requireFeature(pool: Pool, companyId: string, featureId: string) {
  const { rows } = await pool.query<{
    id: string; status: string; builder_ids: string[]; title: string;
    priority: string; risk_level: string;
  }>(
    `SELECT id, status, builder_ids, title, priority, risk_level
       FROM shipping_features WHERE id = $1 AND company_id = $2`,
    [featureId, companyId],
  )
  if (!rows[0]) throw new ShippingError(404, 'shipping feature not found')
  return rows[0]
}

async function assertParticipants(pool: Pool, companyId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM participants WHERE company_id = $1 AND id = ANY($2::text[]) AND departed_at IS NULL`,
    [companyId, ids],
  )
  const found = new Set(rows.map((r) => r.id))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length > 0) throw new ShippingError(400, `unknown active participant(s): ${missing.join(', ')}`)
}

type FeatureLinks = {
  projectId?: string | null
  conversationId?: string | null
  documentId?: string | null
  boardCardId?: string | null
}

async function assertFeatureLinks(pool: Pool, companyId: string, links: FeatureLinks): Promise<void> {
  const checks: Array<Promise<{ rows: Array<{ ok: number }> }> | null> = [
    links.projectId ? pool.query(`SELECT 1 AS ok FROM projects WHERE id = $1 AND company_id = $2`, [links.projectId, companyId]) : null,
    links.conversationId ? pool.query(`SELECT 1 AS ok FROM conversations WHERE id = $1 AND company_id = $2`, [links.conversationId, companyId]) : null,
    links.documentId ? pool.query(`SELECT 1 AS ok FROM documents WHERE id = $1 AND company_id = $2`, [links.documentId, companyId]) : null,
    links.boardCardId ? pool.query(
      `SELECT 1 AS ok FROM board_cards c JOIN boards b ON b.id = c.board_id
        WHERE c.id = $1 AND b.company_id = $2`,
      [links.boardCardId, companyId],
    ) : null,
  ]
  const names = ['project', 'conversation', 'document', 'board card']
  const results = await Promise.all(checks.map((check) => check ?? Promise.resolve({ rows: [{ ok: 1 }] })))
  const invalid = results.findIndex((result) => result.rows.length === 0)
  if (invalid >= 0) throw new ShippingError(400, `${names[invalid]} does not belong to this company`)
}

async function assertConversationMessageLinks(
  pool: Pool,
  companyId: string,
  conversationId: string | null,
  messageId: string | null,
): Promise<void> {
  if (!conversationId && !messageId) return
  const { rows } = await pool.query(
    `SELECT 1
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id AND ($2::text IS NULL OR m.id = $2)
      WHERE c.company_id = $1 AND ($3::text IS NULL OR c.id = $3)
        AND ($2::text IS NULL OR m.id IS NOT NULL)
      LIMIT 1`,
    [companyId, messageId, conversationId],
  )
  if (!rows[0]) throw new ShippingError(400, 'conversation/message evidence does not belong to this company')
}

async function featureDetail(pool: Pool, companyId: string, featureId: string) {
  const { rows: features } = await pool.query(
    `SELECT f.id, f.title, f.problem, f.desired_outcome AS "desiredOutcome",
            f.contract_summary AS "contractSummary", f.status, f.priority,
            f.risk_level AS "riskLevel", f.release_target AS "releaseTarget",
            f.builder_ids AS "builderIds", f.project_id AS "projectId",
            f.conversation_id AS "conversationId", f.document_id AS "documentId",
            f.board_card_id AS "boardCardId", f.created_by AS "createdBy",
            f.updated_by AS "updatedBy", f.created_at AS "createdAt",
            f.updated_at AS "updatedAt", f.archived_at AS "archivedAt"
       FROM shipping_features f
      WHERE f.id = $1 AND f.company_id = $2`,
    [featureId, companyId],
  )
  if (!features[0]) throw new ShippingError(404, 'shipping feature not found')
  const [invariants, verifications, releases, frictions, regressions, events] = await Promise.all([
    pool.query(
      `SELECT id, title, description, kind, required, position,
              created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM shipping_invariants WHERE feature_id = $1 ORDER BY position ASC, created_at ASC`,
      [featureId],
    ),
    pool.query(
      `SELECT id, invariant_id AS "invariantId", title, description, method, required,
              status, owner_id AS "ownerId", verified_by_id AS "verifiedById",
              builder_ids AS "builderIds", evidence, notes, position,
              due_at AS "dueAt", completed_at AS "completedAt",
              created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM shipping_verifications WHERE feature_id = $1 ORDER BY position ASC, created_at ASC`,
      [featureId],
    ),
    pool.query(
      `SELECT id, environment, status, version, commit_sha AS "commitSha",
              started_by AS "startedBy", approved_by AS "approvedBy",
              release_notes AS "releaseNotes", rollback_plan AS "rollbackPlan",
              known_gaps AS "knownGaps", baseline, smoke_evidence AS "smokeEvidence",
              readback_due_at AS "readbackDueAt", readback_status AS "readbackStatus",
              readback_evidence AS "readbackEvidence", started_at AS "startedAt",
              completed_at AS "completedAt", rolled_back_at AS "rolledBackAt",
              rollback_reason AS "rollbackReason", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM shipping_releases WHERE feature_id = $1 ORDER BY created_at DESC`,
      [featureId],
    ),
    pool.query(
      `SELECT id, title, description, source, severity, frequency, status,
              reporter_id AS "reporterId", conversation_id AS "conversationId",
              message_id AS "messageId", evidence, occurrence_count AS "occurrenceCount",
              first_seen_at AS "firstSeenAt", last_seen_at AS "lastSeenAt"
         FROM shipping_friction_reports WHERE feature_id = $1 ORDER BY last_seen_at DESC`,
      [featureId],
    ),
    pool.query(
      `SELECT id, invariant_id AS "invariantId", source_verification_id AS "sourceVerificationId",
              title, kind, command, expected, status, last_result AS "lastResult",
              last_evidence AS "lastEvidence", last_run_at AS "lastRunAt",
              created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM shipping_regressions WHERE feature_id = $1 ORDER BY updated_at DESC`,
      [featureId],
    ),
    pool.query(
      `SELECT id, actor_id AS "actorId", kind, data, created_at AS "createdAt"
         FROM shipping_events WHERE feature_id = $1 ORDER BY created_at ASC`,
      [featureId],
    ),
  ])
  return {
    ...features[0],
    invariants: invariants.rows,
    verifications: verifications.rows,
    releases: releases.rows,
    frictions: frictions.rows,
    regressions: regressions.rows,
    events: events.rows,
  }
}

async function assertTransitionReady(pool: Pool, featureId: string, from: string, to: string): Promise<void> {
  if (to === 'contract') {
    const { rows } = await pool.query<{ problem: string; desired_outcome: string; contract_summary: string }>(
      `SELECT problem, desired_outcome, contract_summary FROM shipping_features WHERE id = $1`, [featureId],
    )
    const f = rows[0]
    if (!f?.problem.trim() || !f.desired_outcome.trim() || !f.contract_summary.trim()) {
      throw new ShippingError(409, 'problem, desired outcome, and contract summary are required before contract')
    }
  }
  if (to === 'building') {
    const { rows } = await pool.query<{ builders: number; invariants: number }>(
      `SELECT jsonb_array_length(builder_ids)::int AS builders,
              (SELECT count(*)::int FROM shipping_invariants WHERE feature_id = $1) AS invariants
         FROM shipping_features WHERE id = $1`, [featureId],
    )
    if ((rows[0]?.builders ?? 0) === 0) throw new ShippingError(409, 'at least one builder is required before building')
    if ((rows[0]?.invariants ?? 0) === 0) throw new ShippingError(409, 'at least one invariant is required before building')
  }
  if (to === 'verifying') {
    const { rows } = await pool.query<{ missing_owner: number; uncovered: number }>(
      `SELECT
         count(*) FILTER (WHERE required AND owner_id IS NULL)::int AS missing_owner,
         (SELECT count(*)::int
            FROM shipping_invariants i
           WHERE i.feature_id = $1 AND i.required
             AND NOT EXISTS (SELECT 1 FROM shipping_verifications v WHERE v.invariant_id = i.id AND v.required)) AS uncovered
       FROM shipping_verifications WHERE feature_id = $1`,
      [featureId],
    )
    if ((rows[0]?.uncovered ?? 0) > 0) throw new ShippingError(409, 'every required invariant needs a required verification square')
    if ((rows[0]?.missing_owner ?? 0) > 0) throw new ShippingError(409, 'every required verification square needs an owner')
  }
  if (to === 'ready') {
    const { rows } = await pool.query<{ remaining: number; user_path: number; trace: number; release_note: number }>(
      `SELECT
         count(*) FILTER (WHERE required AND status <> 'passed')::int AS remaining,
         count(*) FILTER (WHERE required AND method = 'user_path' AND status = 'passed')::int AS user_path,
         count(*) FILTER (WHERE required AND method = 'trace' AND status = 'passed')::int AS trace,
         count(*) FILTER (WHERE required AND method = 'release_note' AND status = 'passed')::int AS release_note
       FROM shipping_verifications WHERE feature_id = $1`,
      [featureId],
    )
    const r = rows[0]
    if ((r?.remaining ?? 0) > 0) throw new ShippingError(409, `${r?.remaining} required verification square(s) are not passed`)
    if (!r?.user_path || !r.trace || !r.release_note) {
      throw new ShippingError(409, 'ready requires passed user-path, trace-coverage, and release-note squares')
    }
  }
  if (to === 'watching') {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM shipping_releases
        WHERE feature_id = $1 AND environment = 'production' AND status = 'succeeded'`, [featureId],
    )
    if (!rows[0]?.count) throw new ShippingError(409, 'watching requires a successful production release')
  }
  if (to === 'learned') {
    const { rows } = await pool.query<{ passed: number; failing: number }>(
      `SELECT
         (SELECT count(*)::int FROM shipping_releases WHERE feature_id = $1 AND environment = 'production' AND readback_status = 'passed') AS passed,
         (SELECT count(*)::int FROM shipping_regressions WHERE feature_id = $1 AND status = 'failing') AS failing`,
      [featureId],
    )
    if (!rows[0]?.passed) throw new ShippingError(409, 'learned requires a passed production readback')
    if ((rows[0]?.failing ?? 0) > 0) throw new ShippingError(409, 'learned is blocked by failing regressions')
  }
  if (!FEATURE_TRANSITIONS[from]?.has(to)) throw new ShippingError(409, `invalid feature transition: ${from} → ${to}`)
}

export function createShippingRouter(deps: ShippingRouterDeps): Router {
  const { pool } = deps
  const router = Router()

  router.get('/overview', async (req, res) => {
    const { companyId } = await deps.requireCompany(req)
    const [features, friction, dueReadbacks] = await Promise.all([
      pool.query(
        `SELECT f.id, f.title, f.status, f.priority, f.risk_level AS "riskLevel",
                f.release_target AS "releaseTarget", f.builder_ids AS "builderIds",
                f.project_id AS "projectId", f.updated_at AS "updatedAt",
                count(v.id) FILTER (WHERE v.required)::int AS "requiredSquares",
                count(v.id) FILTER (WHERE v.required AND v.status = 'passed')::int AS "passedSquares",
                count(v.id) FILTER (WHERE v.status = 'failed')::int AS "failedSquares"
           FROM shipping_features f
           LEFT JOIN shipping_verifications v ON v.feature_id = f.id
          WHERE f.company_id = $1 AND f.status <> 'archived'
          GROUP BY f.id ORDER BY
            CASE f.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            f.updated_at DESC`,
        [companyId],
      ),
      pool.query(
        `SELECT id, feature_id AS "featureId", title, description, source, severity,
                frequency, status, occurrence_count AS "occurrenceCount",
                last_seen_at AS "lastSeenAt"
           FROM shipping_friction_reports
          WHERE company_id = $1 AND status IN ('open','triaged','planned')
          ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                   last_seen_at DESC`,
        [companyId],
      ),
      pool.query(
        `SELECT r.id, r.feature_id AS "featureId", f.title AS "featureTitle",
                r.readback_due_at AS "readbackDueAt", r.readback_status AS "readbackStatus"
           FROM shipping_releases r JOIN shipping_features f ON f.id = r.feature_id
          WHERE f.company_id = $1 AND r.environment = 'production' AND r.status = 'succeeded'
            AND r.readback_status IN ('pending','overdue')
            AND (r.readback_status = 'overdue' OR r.readback_due_at <= NOW())
          ORDER BY r.readback_due_at ASC`,
        [companyId],
      ),
    ])
    res.json({ features: features.rows, friction: friction.rows, dueReadbacks: dueReadbacks.rows })
  })

  router.get('/features/:id', async (req, res) => {
    const { companyId } = await deps.requireCompany(req)
    res.json(await featureDetail(pool, companyId, req.params.id))
  })

  router.post('/features', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const body = req.body ?? {}
    const title = text(body.title, 300)
    if (!title) throw new ShippingError(400, 'title required')
    const builderIds = stringArray(body.builderIds)
    await assertParticipants(pool, companyId, builderIds)
    const links = {
      projectId: optionalText(body.projectId),
      conversationId: optionalText(body.conversationId),
      documentId: optionalText(body.documentId),
      boardCardId: optionalText(body.boardCardId),
    }
    await assertFeatureLinks(pool, companyId, links)
    const id = `ship-${randomUUID()}`
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO shipping_features
          (id, company_id, project_id, conversation_id, document_id, board_card_id,
           title, problem, desired_outcome, contract_summary, priority, risk_level,
           release_target, builder_ids, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$15)`,
        [id, companyId, links.projectId, links.conversationId, links.documentId,
          links.boardCardId, title, text(body.problem), text(body.desiredOutcome), text(body.contractSummary),
          enumValue(body.priority, PRIORITIES, 'medium'), enumValue(body.riskLevel, RISK_LEVELS, 'medium'),
          optionalText(body.releaseTarget), JSON.stringify(builderIds), userId],
      )
      const defaults = [
        { title: 'Walk the critical user path', method: 'user_path', position: 10 },
        { title: 'Prove trace coverage and diagnostic evidence', method: 'trace', position: 20 },
        { title: 'Verify release notes and known gaps', method: 'release_note', position: 30 },
      ]
      for (const square of defaults) {
        await client.query(
          `INSERT INTO shipping_verifications
            (id, feature_id, title, description, method, required, builder_ids, position, created_by)
           VALUES ($1,$2,$3,$4,$5,TRUE,$6::jsonb,$7,$8)`,
          [`sv-${randomUUID()}`, id, square.title, '', square.method, JSON.stringify(builderIds), square.position, userId],
        )
      }
      await client.query(
        `INSERT INTO shipping_events (id, company_id, feature_id, actor_id, kind, data)
         VALUES ($1,$2,$3,$4,'feature.created',$5::jsonb)`,
        [`se-${randomUUID()}`, companyId, id, userId, JSON.stringify({ title })],
      )
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      throw err
    } finally { client.release() }
    res.status(201).json(await featureDetail(pool, companyId, id))
  })

  router.patch('/features/:id', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const feature = await requireFeature(pool, companyId, req.params.id)
    if (feature.status === 'archived') throw new ShippingError(409, 'archived features are immutable')
    const body = req.body ?? {}
    const sets: string[] = []
    const values: unknown[] = []
    let nextBuilderIds: string[] | null = null
    const add = (sql: string, value: unknown) => { values.push(value); sets.push(`${sql} = $${values.length}`) }
    if (body.title !== undefined) {
      const title = text(body.title, 300); if (!title) throw new ShippingError(400, 'title cannot be empty'); add('title', title)
    }
    if (body.problem !== undefined) add('problem', text(body.problem))
    if (body.desiredOutcome !== undefined) add('desired_outcome', text(body.desiredOutcome))
    if (body.contractSummary !== undefined) add('contract_summary', text(body.contractSummary))
    if (body.priority !== undefined) {
      if (typeof body.priority !== 'string' || !PRIORITIES.has(body.priority)) throw new ShippingError(400, 'invalid priority')
      add('priority', body.priority)
    }
    if (body.riskLevel !== undefined) {
      if (typeof body.riskLevel !== 'string' || !RISK_LEVELS.has(body.riskLevel)) throw new ShippingError(400, 'invalid risk level')
      add('risk_level', body.riskLevel)
    }
    await assertFeatureLinks(pool, companyId, {
      projectId: body.projectId === undefined ? null : optionalText(body.projectId),
      conversationId: body.conversationId === undefined ? null : optionalText(body.conversationId),
      documentId: body.documentId === undefined ? null : optionalText(body.documentId),
      boardCardId: body.boardCardId === undefined ? null : optionalText(body.boardCardId),
    })
    if (body.releaseTarget !== undefined) add('release_target', optionalText(body.releaseTarget))
    if (body.projectId !== undefined) add('project_id', optionalText(body.projectId))
    if (body.conversationId !== undefined) add('conversation_id', optionalText(body.conversationId))
    if (body.documentId !== undefined) add('document_id', optionalText(body.documentId))
    if (body.boardCardId !== undefined) add('board_card_id', optionalText(body.boardCardId))
    if (body.builderIds !== undefined) {
      const ids = stringArray(body.builderIds); await assertParticipants(pool, companyId, ids); add('builder_ids', JSON.stringify(ids))
      nextBuilderIds = ids
    }
    if (sets.length === 0) { res.json(await featureDetail(pool, companyId, req.params.id)); return }
    values.push(userId, req.params.id, companyId)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `UPDATE shipping_features SET ${sets.join(', ')}, updated_by = $${values.length - 2}, updated_at = NOW()
          WHERE id = $${values.length - 1} AND company_id = $${values.length}`,
        values,
      )
      if (nextBuilderIds) {
        await client.query(
          `UPDATE shipping_verifications SET builder_ids = $1::jsonb, updated_at = NOW() WHERE feature_id = $2`,
          [JSON.stringify(nextBuilderIds), req.params.id],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally { client.release() }
    await recordEvent(pool, { companyId, featureId: req.params.id, actorId: userId, kind: 'feature.updated', data: body })
    res.json(await featureDetail(pool, companyId, req.params.id))
  })

  router.post('/features/:id/transition', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const feature = await requireFeature(pool, companyId, req.params.id)
    const to = enumValue(req.body?.status, FEATURE_STATUSES, '')
    if (!to) throw new ShippingError(400, 'valid status required')
    await assertTransitionReady(pool, feature.id, feature.status, to)
    await pool.query(
      `UPDATE shipping_features SET status = $1, updated_by = $2, updated_at = NOW(),
              archived_at = CASE WHEN $1 = 'archived' THEN NOW() ELSE archived_at END
        WHERE id = $3 AND company_id = $4`,
      [to, userId, feature.id, companyId],
    )
    await recordEvent(pool, { companyId, featureId: feature.id, actorId: userId, kind: 'feature.transitioned', data: { from: feature.status, to } })
    res.json(await featureDetail(pool, companyId, feature.id))
  })

  router.post('/features/:id/invariants', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    await requireFeature(pool, companyId, req.params.id)
    const title = text(req.body?.title, 300)
    if (!title) throw new ShippingError(400, 'title required')
    const id = `si-${randomUUID()}`
    const { rows: positionRows } = await pool.query<{ position: number }>(
      `SELECT COALESCE(max(position), 0) + 10 AS position FROM shipping_invariants WHERE feature_id = $1`, [req.params.id],
    )
    await pool.query(
      `INSERT INTO shipping_invariants
        (id, feature_id, title, description, kind, required, position, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, req.params.id, title, text(req.body?.description), enumValue(req.body?.kind, INVARIANT_KINDS, 'behavior'),
        bool(req.body?.required, true), positionRows[0]?.position ?? 10, userId],
    )
    await recordEvent(pool, { companyId, featureId: req.params.id, actorId: userId, kind: 'invariant.created', data: { id, title } })
    res.status(201).json(await featureDetail(pool, companyId, req.params.id))
  })

  router.patch('/features/:id/invariants/:invariantId', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    await requireFeature(pool, companyId, req.params.id)
    const body = req.body ?? {}
    const { rowCount } = await pool.query(
      `UPDATE shipping_invariants SET
         title = COALESCE($1, title), description = COALESCE($2, description),
         kind = COALESCE($3, kind), required = COALESCE($4, required),
         position = COALESCE($5, position), updated_at = NOW()
       WHERE id = $6 AND feature_id = $7`,
      [body.title === undefined ? null : text(body.title, 300), body.description === undefined ? null : text(body.description),
        body.kind === undefined ? null : enumValue(body.kind, INVARIANT_KINDS, 'behavior'),
        body.required === undefined ? null : bool(body.required, true),
        typeof body.position === 'number' ? body.position : null, req.params.invariantId, req.params.id],
    )
    if (!rowCount) throw new ShippingError(404, 'invariant not found')
    await recordEvent(pool, { companyId, featureId: req.params.id, actorId: userId, kind: 'invariant.updated', data: { id: req.params.invariantId } })
    res.json(await featureDetail(pool, companyId, req.params.id))
  })

  router.post('/features/:id/verifications', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const feature = await requireFeature(pool, companyId, req.params.id)
    const title = text(req.body?.title, 300)
    if (!title) throw new ShippingError(400, 'title required')
    const ownerId = optionalText(req.body?.ownerId)
    if (ownerId) await assertParticipants(pool, companyId, [ownerId])
    const builderIds = req.body?.builderIds === undefined ? feature.builder_ids : stringArray(req.body.builderIds)
    await assertParticipants(pool, companyId, builderIds)
    if (ownerId && builderIds.includes(ownerId)) throw new ShippingError(409, 'verification owner cannot be one of the builders')
    const invariantId = optionalText(req.body?.invariantId)
    if (invariantId) {
      const { rows } = await pool.query(`SELECT 1 FROM shipping_invariants WHERE id = $1 AND feature_id = $2`, [invariantId, feature.id])
      if (!rows[0]) throw new ShippingError(400, 'invariant does not belong to this feature')
    }
    const { rows: positions } = await pool.query<{ position: number }>(
      `SELECT COALESCE(max(position), 0) + 10 AS position FROM shipping_verifications WHERE feature_id = $1`, [feature.id],
    )
    const id = `sv-${randomUUID()}`
    await pool.query(
      `INSERT INTO shipping_verifications
        (id, feature_id, invariant_id, title, description, method, required, owner_id,
         builder_ids, position, due_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)`,
      [id, feature.id, invariantId, title, text(req.body?.description),
        enumValue(req.body?.method, VERIFICATION_METHODS, 'user_path'), bool(req.body?.required, true),
        ownerId, JSON.stringify(builderIds), positions[0]?.position ?? 10, isoOrNull(req.body?.dueAt), userId],
    )
    await recordEvent(pool, { companyId, featureId: feature.id, actorId: userId, kind: 'verification.created', data: { id, title, ownerId } })
    res.status(201).json(await featureDetail(pool, companyId, feature.id))
  })

  router.patch('/features/:id/verifications/:verificationId', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const feature = await requireFeature(pool, companyId, req.params.id)
    const { rows } = await pool.query<{ builder_ids: string[]; status: string; owner_id: string | null; title: string }>(
      `SELECT builder_ids, status, owner_id, title FROM shipping_verifications WHERE id = $1 AND feature_id = $2`,
      [req.params.verificationId, feature.id],
    )
    const current = rows[0]
    if (!current) throw new ShippingError(404, 'verification square not found')
    const body = req.body ?? {}
    const ownerId = body.ownerId === undefined ? current.owner_id : optionalText(body.ownerId)
    const builderIds = body.builderIds === undefined ? current.builder_ids : stringArray(body.builderIds)
    if (ownerId) await assertParticipants(pool, companyId, [ownerId])
    await assertParticipants(pool, companyId, builderIds)
    if (ownerId && builderIds.includes(ownerId)) throw new ShippingError(409, 'verification owner cannot be one of the builders')
    const nextStatus = body.status === undefined ? current.status : enumValue(body.status, VERIFICATION_STATUSES, '')
    if (!nextStatus) throw new ShippingError(400, 'invalid verification status')
    const completing = nextStatus === 'passed' || nextStatus === 'failed' || nextStatus === 'waived'
    if (completing && builderIds.includes(userId)) throw new ShippingError(409, 'the builder cannot verify their own work')
    const evidence = body.evidence === undefined ? null : jsonArray(body.evidence)
    if ((nextStatus === 'passed' || nextStatus === 'failed') && (!evidence || evidence.length === 0)) {
      throw new ShippingError(409, 'passed/failed verification requires evidence')
    }
    if (nextStatus === 'waived' && !text(body.notes)) throw new ShippingError(409, 'waiving a square requires a written reason')
    await pool.query(
      `UPDATE shipping_verifications SET
         title = COALESCE($1, title), description = COALESCE($2, description),
         method = COALESCE($3, method), required = COALESCE($4, required),
         owner_id = $5, builder_ids = $6::jsonb, status = $7,
         evidence = COALESCE($8::jsonb, evidence), notes = COALESCE($9, notes),
         due_at = COALESCE($10, due_at), verified_by_id = CASE WHEN $11 THEN $12 ELSE verified_by_id END,
         completed_at = CASE WHEN $11 THEN NOW() ELSE NULL END, updated_at = NOW()
       WHERE id = $13 AND feature_id = $14`,
      [body.title === undefined ? null : text(body.title, 300), body.description === undefined ? null : text(body.description),
        body.method === undefined ? null : enumValue(body.method, VERIFICATION_METHODS, 'user_path'),
        body.required === undefined ? null : bool(body.required, true), ownerId, JSON.stringify(builderIds), nextStatus,
        evidence === null ? null : JSON.stringify(evidence), body.notes === undefined ? null : text(body.notes),
        body.dueAt === undefined ? null : isoOrNull(body.dueAt), completing, completing ? userId : null,
        req.params.verificationId, feature.id],
    )
    if (nextStatus === 'failed') {
      await pool.query(
        `INSERT INTO shipping_regressions
          (id, feature_id, source_verification_id, title, kind, expected, status, created_by)
         VALUES ($1,$2,$3,$4,'manual_replay',$5,'failing',$6)
         ON CONFLICT (source_verification_id) WHERE source_verification_id IS NOT NULL
         DO UPDATE SET status='failing', updated_at=NOW()`,
        [`rg-${randomUUID()}`, feature.id, req.params.verificationId,
          `Replay failed square: ${text(body.title, 300) || current.title}`,
          'The behavior proven by this square remains true', userId],
      )
      await pool.query(
        `INSERT INTO shipping_friction_reports
          (id, company_id, feature_id, reporter_id, source, source_key, title,
           description, severity, frequency, status, evidence)
         VALUES ($1,$2,$3,$4,'verification',$5,$6,$7,'high','once','open',$8::jsonb)
         ON CONFLICT (company_id, source_key) WHERE source_key IS NOT NULL
         DO UPDATE SET occurrence_count=shipping_friction_reports.occurrence_count+1,
                       last_seen_at=NOW(), updated_at=NOW(), status='open', evidence=EXCLUDED.evidence`,
        [`fr-${randomUUID()}`, companyId, feature.id, userId,
          `verification:${req.params.verificationId}`, `Verification failed: ${text(body.title, 300) || current.title}`,
          `A required proof failed and has been promoted into the friction inbox plus a replayable regression asset.`,
          JSON.stringify(evidence ?? [])],
      )
    }
    await recordEvent(pool, { companyId, featureId: feature.id, actorId: userId, kind: 'verification.updated', data: { id: req.params.verificationId, status: nextStatus } })
    res.json(await featureDetail(pool, companyId, feature.id))
  })

  router.post('/features/:id/releases', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const feature = await requireFeature(pool, companyId, req.params.id)
    const environment = enumValue(req.body?.environment, RELEASE_ENVIRONMENTS, '')
    if (!environment) throw new ShippingError(400, 'valid environment required')
    if ((environment === 'staging' || environment === 'canary' || environment === 'production') && !['ready', 'releasing', 'watching'].includes(feature.status)) {
      throw new ShippingError(409, `${environment} release requires a ready feature`)
    }
    const id = `sr-${randomUUID()}`
    await pool.query(
      `INSERT INTO shipping_releases
        (id, feature_id, environment, version, commit_sha, release_notes, rollback_plan,
         known_gaps, baseline, readback_due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10)`,
      [id, feature.id, environment, optionalText(req.body?.version, 200), optionalText(req.body?.commitSha, 200),
        text(req.body?.releaseNotes), text(req.body?.rollbackPlan), JSON.stringify(jsonArray(req.body?.knownGaps)),
        JSON.stringify(jsonArray(req.body?.baseline)), isoOrNull(req.body?.readbackDueAt)],
    )
    await recordEvent(pool, { companyId, featureId: feature.id, actorId: userId, kind: 'release.planned', data: { id, environment } })
    res.status(201).json(await featureDetail(pool, companyId, feature.id))
  })

  router.post('/features/:id/releases/:releaseId/action', async (req, res) => {
    const base = await deps.requireCompany(req)
    const feature = await requireFeature(pool, base.companyId, req.params.id)
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query<any>(
        `SELECT * FROM shipping_releases WHERE id = $1 AND feature_id = $2 FOR UPDATE`, [req.params.releaseId, feature.id],
      )
    const release = rows[0]
    if (!release) throw new ShippingError(404, 'release not found')
    const action = text(req.body?.action, 40)
    if (!['approve', 'start', 'succeed', 'fail', 'readback_pass', 'readback_fail', 'rollback'].includes(action)) {
      throw new ShippingError(400, 'invalid release action')
    }
    let actor = base.userId
    if (action === 'approve' || action === 'rollback') {
      const privileged = await deps.requireCompanyRole(req)
      actor = privileged.userId
    }
    if (action === 'approve') {
      if (release.status !== 'planned') throw new ShippingError(409, 'only planned releases can be approved')
      if (release.environment === 'production') {
        if (!release.rollback_plan.trim()) throw new ShippingError(409, 'production approval requires a rollback plan')
        if (!release.release_notes.trim()) throw new ShippingError(409, 'production approval requires release notes')
        if (!Array.isArray(release.baseline) || release.baseline.length === 0) throw new ShippingError(409, 'production approval requires a measurable baseline')
        const { rows: staged } = await client.query<{ count: number }>(
          `SELECT count(*)::int AS count FROM shipping_releases
            WHERE feature_id = $1 AND environment IN ('staging','canary') AND status = 'succeeded'`, [feature.id],
        )
        if (!staged[0]?.count) throw new ShippingError(409, 'production approval requires a successful staging or canary release')
      }
      await client.query(`UPDATE shipping_releases SET status='approved', approved_by=$1, updated_at=NOW() WHERE id=$2`, [actor, release.id])
    } else if (action === 'start') {
      const allowed = release.environment === 'production' ? release.status === 'approved' : ['planned', 'approved'].includes(release.status)
      if (!allowed) throw new ShippingError(409, 'release is not approved to start')
      await client.query(`UPDATE shipping_releases SET status='running', started_by=$1, started_at=NOW(), updated_at=NOW() WHERE id=$2`, [actor, release.id])
      await client.query(`UPDATE shipping_features SET status='releasing', updated_by=$1, updated_at=NOW() WHERE id=$2`, [actor, feature.id])
    } else if (action === 'succeed') {
      const evidence = jsonArray(req.body?.evidence)
      if (release.status !== 'running') throw new ShippingError(409, 'only a running release can succeed')
      if (evidence.length === 0) throw new ShippingError(409, 'a successful release requires smoke evidence')
      const due = release.environment === 'production' ? new Date(Date.now() + 24 * 60 * 60_000) : null
      await client.query(
        `UPDATE shipping_releases SET status='succeeded', smoke_evidence=$1::jsonb,
                completed_at=NOW(), readback_due_at=COALESCE(readback_due_at,$2), updated_at=NOW() WHERE id=$3`,
        [JSON.stringify(evidence), due, release.id],
      )
      if (release.environment === 'production') {
        await client.query(`UPDATE shipping_features SET status='watching', updated_by=$1, updated_at=NOW() WHERE id=$2`, [actor, feature.id])
      }
    } else if (action === 'fail') {
      if (release.status !== 'running') throw new ShippingError(409, 'only a running release can fail')
      const evidence = jsonArray(req.body?.evidence)
      if (evidence.length === 0) throw new ShippingError(409, 'a failed release requires diagnostic evidence')
      await client.query(`UPDATE shipping_releases SET status='failed', smoke_evidence=$1::jsonb, completed_at=NOW(), updated_at=NOW() WHERE id=$2`, [JSON.stringify(evidence), release.id])
      await client.query(`UPDATE shipping_features SET status='ready', updated_by=$1, updated_at=NOW() WHERE id=$2`, [actor, feature.id])
    } else if (action === 'readback_pass' || action === 'readback_fail') {
      if (release.environment !== 'production' || release.status !== 'succeeded') throw new ShippingError(409, 'readback applies only to successful production releases')
      const evidence = jsonArray(req.body?.evidence)
      if (evidence.length === 0) throw new ShippingError(409, 'readback requires production evidence')
      const status = action === 'readback_pass' ? 'passed' : 'failed'
      await client.query(`UPDATE shipping_releases SET readback_status=$1, readback_evidence=$2::jsonb, updated_at=NOW() WHERE id=$3`, [status, JSON.stringify(evidence), release.id])
      if (action === 'readback_fail') {
        await client.query(
          `INSERT INTO shipping_friction_reports
            (id,company_id,feature_id,reporter_id,source,source_key,title,description,severity,frequency,status,evidence)
           VALUES ($1,$2,$3,$4,'production-readback',$5,$6,$7,'critical','frequent','open',$8::jsonb)
           ON CONFLICT (company_id, source_key) WHERE source_key IS NOT NULL
           DO UPDATE SET occurrence_count=shipping_friction_reports.occurrence_count+1,
                         last_seen_at=NOW(),updated_at=NOW(),status='open',evidence=EXCLUDED.evidence`,
          [`fr-${randomUUID()}`, base.companyId, feature.id, actor, `readback:${release.id}`,
            `Production readback failed: ${feature.title}`,
            'Observed production behavior diverged from the release baseline; investigate and add a replayable regression.',
            JSON.stringify(evidence)],
        )
        await client.query(`UPDATE shipping_features SET status='building', updated_by=$1, updated_at=NOW() WHERE id=$2`, [actor, feature.id])
      }
    } else if (action === 'rollback') {
      if (!['running', 'succeeded', 'failed'].includes(release.status)) throw new ShippingError(409, 'only an active or completed release can be rolled back')
      const reason = text(req.body?.reason, 4_000)
      if (!reason) throw new ShippingError(409, 'rollback requires a reason')
      await client.query(`UPDATE shipping_releases SET status='rolled_back', rolled_back_at=NOW(), rollback_reason=$1, updated_at=NOW() WHERE id=$2`, [reason, release.id])
      await client.query(`UPDATE shipping_features SET status='building', updated_by=$1, updated_at=NOW() WHERE id=$2`, [actor, feature.id])
    }
      await recordEvent(client, { companyId: base.companyId, featureId: feature.id, actorId: actor, kind: `release.${action}`, data: { releaseId: release.id, evidence: req.body?.evidence ?? [] } })
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
    res.json(await featureDetail(pool, base.companyId, feature.id))
  })

  router.get('/friction', async (req, res) => {
    const { companyId } = await deps.requireCompany(req)
    const { rows } = await pool.query(
      `SELECT id, feature_id AS "featureId", conversation_id AS "conversationId",
              message_id AS "messageId", reporter_id AS "reporterId", source, title,
              description, severity, frequency, status, evidence,
              occurrence_count AS "occurrenceCount", first_seen_at AS "firstSeenAt",
              last_seen_at AS "lastSeenAt", created_at AS "createdAt", updated_at AS "updatedAt"
         FROM shipping_friction_reports WHERE company_id = $1
        ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'triaged' THEN 1 WHEN 'planned' THEN 2 ELSE 3 END,
                 CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 last_seen_at DESC`,
      [companyId],
    )
    res.json(rows)
  })

  router.post('/friction', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const title = text(req.body?.title, 300)
    if (!title) throw new ShippingError(400, 'title required')
    const id = `fr-${randomUUID()}`
    const featureId = optionalText(req.body?.featureId)
    if (featureId) await requireFeature(pool, companyId, featureId)
    const conversationId = optionalText(req.body?.conversationId)
    const messageId = optionalText(req.body?.messageId)
    await assertConversationMessageLinks(pool, companyId, conversationId, messageId)
    await pool.query(
      `INSERT INTO shipping_friction_reports
        (id, company_id, feature_id, conversation_id, message_id, reporter_id, source,
         title, description, severity, frequency, status, evidence)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)`,
      [id, companyId, featureId, conversationId, messageId,
        userId, optionalText(req.body?.source, 100) ?? 'manual', title, text(req.body?.description),
        enumValue(req.body?.severity, FRICTION_SEVERITIES, 'medium'),
        enumValue(req.body?.frequency, FRICTION_FREQUENCIES, 'once'),
        enumValue(req.body?.status, FRICTION_STATUSES, 'open'), JSON.stringify(jsonArray(req.body?.evidence))],
    )
    await recordEvent(pool, { companyId, featureId, actorId: userId, kind: 'friction.created', data: { frictionId: id, title } })
    res.status(201).json({ id })
  })

  router.patch('/friction/:id', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    const featureId = req.body?.featureId === undefined ? undefined : optionalText(req.body.featureId)
    if (featureId) await requireFeature(pool, companyId, featureId)
    const { rowCount } = await pool.query(
      `UPDATE shipping_friction_reports SET
         feature_id = CASE WHEN $1 THEN $2 ELSE feature_id END,
         title = COALESCE($3, title), description = COALESCE($4, description),
         severity = COALESCE($5, severity), frequency = COALESCE($6, frequency),
         status = COALESCE($7, status), evidence = COALESCE($8::jsonb, evidence),
         occurrence_count = occurrence_count + COALESCE($9, 0),
         last_seen_at = CASE WHEN COALESCE($9,0) > 0 THEN NOW() ELSE last_seen_at END,
         updated_at = NOW()
       WHERE id = $10 AND company_id = $11`,
      [req.body?.featureId !== undefined, featureId ?? null,
        req.body?.title === undefined ? null : text(req.body.title, 300),
        req.body?.description === undefined ? null : text(req.body.description),
        req.body?.severity === undefined ? null : enumValue(req.body.severity, FRICTION_SEVERITIES, 'medium'),
        req.body?.frequency === undefined ? null : enumValue(req.body.frequency, FRICTION_FREQUENCIES, 'once'),
        req.body?.status === undefined ? null : enumValue(req.body.status, FRICTION_STATUSES, 'open'),
        req.body?.evidence === undefined ? null : JSON.stringify(jsonArray(req.body.evidence)),
        req.body?.incrementOccurrence === true ? 1 : 0, req.params.id, companyId],
    )
    if (!rowCount) throw new ShippingError(404, 'friction report not found')
    await recordEvent(pool, { companyId, featureId: featureId ?? null, actorId: userId, kind: 'friction.updated', data: { frictionId: req.params.id } })
    res.json({ ok: true })
  })

  router.post('/features/:id/regressions', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    await requireFeature(pool, companyId, req.params.id)
    const title = text(req.body?.title, 300)
    if (!title) throw new ShippingError(400, 'title required')
    const invariantId = optionalText(req.body?.invariantId)
    const sourceVerificationId = optionalText(req.body?.sourceVerificationId)
    if (invariantId) {
      const { rows } = await pool.query(`SELECT 1 FROM shipping_invariants WHERE id = $1 AND feature_id = $2`, [invariantId, req.params.id])
      if (!rows[0]) throw new ShippingError(400, 'invariant does not belong to this feature')
    }
    if (sourceVerificationId) {
      const { rows } = await pool.query(`SELECT 1 FROM shipping_verifications WHERE id = $1 AND feature_id = $2`, [sourceVerificationId, req.params.id])
      if (!rows[0]) throw new ShippingError(400, 'source verification does not belong to this feature')
    }
    const id = `rg-${randomUUID()}`
    await pool.query(
      `INSERT INTO shipping_regressions
        (id, feature_id, invariant_id, source_verification_id, title, kind, command,
         expected, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, req.params.id, invariantId, sourceVerificationId,
        title, enumValue(req.body?.kind, REGRESSION_KINDS, 'automated'), optionalText(req.body?.command, 8_000),
        text(req.body?.expected), enumValue(req.body?.status, REGRESSION_STATUSES, 'active'), userId],
    )
    await recordEvent(pool, { companyId, featureId: req.params.id, actorId: userId, kind: 'regression.created', data: { id, title } })
    res.status(201).json(await featureDetail(pool, companyId, req.params.id))
  })

  router.patch('/features/:id/regressions/:regressionId', async (req, res) => {
    const { userId, companyId } = await deps.requireCompany(req)
    await requireFeature(pool, companyId, req.params.id)
    const body = req.body ?? {}
    const { rowCount } = await pool.query(
      `UPDATE shipping_regressions SET
         title=COALESCE($1,title), kind=COALESCE($2,kind), command=COALESCE($3,command),
         expected=COALESCE($4,expected), status=COALESCE($5,status),
         last_result=COALESCE($6,last_result), last_evidence=COALESCE($7::jsonb,last_evidence),
         last_run_at=CASE WHEN $6 IS NOT NULL OR $7 IS NOT NULL THEN NOW() ELSE last_run_at END,
         updated_at=NOW() WHERE id=$8 AND feature_id=$9`,
      [body.title === undefined ? null : text(body.title, 300),
        body.kind === undefined ? null : enumValue(body.kind, REGRESSION_KINDS, 'automated'),
        body.command === undefined ? null : optionalText(body.command, 8_000),
        body.expected === undefined ? null : text(body.expected),
        body.status === undefined ? null : enumValue(body.status, REGRESSION_STATUSES, 'active'),
        body.lastResult === undefined ? null : text(body.lastResult),
        body.lastEvidence === undefined ? null : JSON.stringify(jsonArray(body.lastEvidence)),
        req.params.regressionId, req.params.id],
    )
    if (!rowCount) throw new ShippingError(404, 'regression not found')
    await recordEvent(pool, { companyId, featureId: req.params.id, actorId: userId, kind: 'regression.updated', data: { id: req.params.regressionId, status: body.status } })
    res.json(await featureDetail(pool, companyId, req.params.id))
  })

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ShippingError) { res.status(err.status).json({ error: err.message }); return }
    next(err)
  })
  return router
}
