
import { Router } from 'express'
import { PUBLIC_ACTIVITY_KINDS, publicActivityTitle } from '../../agents/activity-visibility.js'
import { deleteAutonomyRule, listAutonomyRules, listHandoffs, upsertAutonomyRule } from '../../agents/coworker.js'
import { getTriageEconomics } from '../../agents/observability.js'
import { pool } from '../../db/pool.js'
import { safe } from '../../http/async-handler.js'
import { getDevtoolsState, requireConversationMember, requireDevtools } from '../../http/authorization.js'
import { HttpError } from '../../http/errors.js'
import { requireCompany } from '../../http/request-context.js'

export const observabilityServiceRoutes = Router()
const api = observabilityServiceRoutes

/* ============== Developer tools ============== */

api.get('/devtools/capabilities', safe(async (req, res) => {
  const state = await getDevtoolsState(req)
  res.json({
    enabled: state.enabled,
    canEnable: state.canEnable,
    localDev: state.localDev,
    productionDevMode: !state.localDev && state.requested && state.enabled,
    role: state.role,
  })
}))

api.get('/devtools/agent-workspace', safe(async (req, res) => {
  const { companyId: tenant } = await requireDevtools(req)
  const agentId = String(req.query.agentId ?? '').trim()
  if (!agentId) throw new HttpError(400, 'agentId required')
  const { rows: agent } = await pool.query(
    `SELECT 1 FROM participants WHERE id = $1 AND company_id = $2 AND kind = 'agent' LIMIT 1`,
    [agentId, tenant],
  )
  if (!agent[0]) throw new HttpError(404, 'agent not found')
  const { rows } = await pool.query(
    `SELECT
        path,
        LENGTH(body)::int AS size,
        (LENGTH(body) - LENGTH(REPLACE(body, E'\n', '')) + 1)::int AS "lineCount",
        updated_at AS "updatedAt"
       FROM agent_workspace
      WHERE agent_id = $1 AND company_id = $2
      ORDER BY path ASC`,
    [agentId, tenant],
  )
  res.json(rows)
}))

api.get('/devtools/agent-workspace/file', safe(async (req, res) => {
  const { companyId: tenant } = await requireDevtools(req)
  const agentId = String(req.query.agentId ?? '').trim()
  const path = String(req.query.path ?? '').trim()
  if (!agentId || !path) throw new HttpError(400, 'agentId and path required')
  const { rows } = await pool.query(
    `SELECT
        path,
        body,
        LENGTH(body)::int AS size,
        (LENGTH(body) - LENGTH(REPLACE(body, E'\n', '')) + 1)::int AS "lineCount",
        updated_at AS "updatedAt"
       FROM agent_workspace
      WHERE agent_id = $1 AND path = $2 AND company_id = $3
      LIMIT 1`,
    [agentId, path, tenant],
  )
  if (!rows[0]) throw new HttpError(404, 'file not found')
  res.json(rows[0])
}))

/* ============== Agent observability ============== */

/* ============== Coworker activity / handoff / approval / learning ====== */

api.get('/coworker/activity', safe(async (req, res) => {
  const conversationId = String(req.query.conversationId ?? '').trim()
  if (!conversationId) throw new HttpError(400, 'conversationId required')
  const { companyId } = await requireConversationMember(req, conversationId)
  const { rows } = await pool.query(
    `SELECT e.id, e.run_id AS "runId", e.agent_id AS "agentId",
       COALESCE(p.name, e.agent_id) AS "agentName", r.status AS "runStatus", e.kind, e.level, e.title,
       e.created_at AS "createdAt"
     FROM agent_events e
     JOIN agent_runs r ON r.id = e.run_id
     LEFT JOIN participants p ON p.id = e.agent_id AND p.company_id = e.company_id
     WHERE e.company_id = $1 AND e.level <> 'debug'
       AND (
         r.trigger->>'conversationId' = $2
         OR COALESCE(r.trigger->'conversationIds', '[]'::jsonb) ? $2
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements_text(r.input_message_ids) input(message_id)
           JOIN messages m ON m.id = input.message_id
           WHERE m.conversation_id = $2
         )
       )
       AND e.kind = ANY($3::text[])
       AND e.kind !~* '(prompt|reasoning|chain[._-]?of[._-]?thought|secret|credential)'
     ORDER BY e.created_at DESC LIMIT 12`, [companyId, conversationId, PUBLIC_ACTIVITY_KINDS],
  )
  res.json(rows.reverse().map((row) => ({
    ...row,
    title: publicActivityTitle(row.kind, row.level) ?? 'Agent activity updated',
  })))
}))

api.get('/coworker/handoffs', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const conversationId = typeof req.query.conversationId === 'string' ? req.query.conversationId.trim() : undefined
  if (conversationId) await requireConversationMember(req, conversationId)
  res.json(await listHandoffs(companyId, conversationId || undefined))
}))

api.get('/coworker/memories', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const { rows } = await pool.query(
    `SELECT w.agent_id AS "agentId", COALESCE(p.name, w.agent_id) AS "agentName",
       w.path, w.body, w.meta, w.updated_at AS "updatedAt"
     FROM agent_workspace w
     LEFT JOIN participants p ON p.id = w.agent_id AND p.company_id = w.company_id
     WHERE w.company_id = $1 AND w.path LIKE 'memory/%'
     ORDER BY w.updated_at DESC LIMIT 200`, [companyId],
  )
  res.json(rows)
}))

api.patch('/coworker/memories', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const agentId = String(req.body?.agentId ?? '').trim()
  const path = String(req.body?.path ?? '').trim()
  const body = String(req.body?.body ?? '').trim()
  if (!agentId || !/^memory\/(fact|preference|instruction|relationship|observation|decision|note)\/[A-Za-z0-9._-]+\.md$/.test(path) || !body) {
    throw new HttpError(400, 'valid agentId, memory path and body required')
  }
  const updated = await pool.query(
    `UPDATE agent_workspace SET body = $4, updated_at = NOW(), embedding = NULL
     WHERE agent_id = $1 AND path = $2 AND company_id = $3
     RETURNING agent_id AS "agentId", path, body, meta, updated_at AS "updatedAt"`,
    [agentId, path, companyId, body],
  )
  if (!updated.rows[0]) throw new HttpError(404, 'memory not found')
  res.json(updated.rows[0])
}))

api.delete('/coworker/memories', safe(async (req, res) => {
  const { companyId } = await requireCompany(req)
  const agentId = String(req.query.agentId ?? '').trim()
  const path = String(req.query.path ?? '').trim()
  if (!agentId || !path.startsWith('memory/')) throw new HttpError(400, 'agentId and memory path required')
  const result = await pool.query(`DELETE FROM agent_workspace WHERE agent_id = $1 AND path = $2 AND company_id = $3`, [agentId, path, companyId])
  if ((result.rowCount ?? 0) === 0) throw new HttpError(404, 'memory not found')
  res.json({ ok: true })
}))

api.get('/coworker/autonomy-rules', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  res.json(await listAutonomyRules(companyId, userId))
}))

api.put('/coworker/autonomy-rules', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  const agentId = String(req.body?.agentId ?? '').trim()
  const scope = String(req.body?.scope ?? '').trim()
  const operation = String(req.body?.operation ?? '').trim()
  const mode = String(req.body?.mode ?? '')
  if (!agentId || !scope || !operation || !['allow', 'ask', 'deny'].includes(mode)) throw new HttpError(400, 'agentId, scope, operation and valid mode required')
  res.json(await upsertAutonomyRule({ companyId, userId, agentId, scope, operation, mode: mode as 'allow' | 'ask' | 'deny' }))
}))

api.delete('/coworker/autonomy-rules/:id', safe(async (req, res) => {
  const { userId, companyId } = await requireCompany(req)
  if (!await deleteAutonomyRule(companyId, userId, String(req.params.id))) throw new HttpError(404, 'rule not found')
  res.json({ ok: true })
}))

const AGENT_RUN_STATUSES = new Set(['running', 'waiting_for_human', 'completed', 'failed', 'skipped', 'stalled'])

/** Window after which a `running` row is rendered as `stalled` in the UI.
 *  Postgres INTERVAL literal so we can inject it straight into the SQL.
 *
 *  Sizing rationale: `agent_runs.updated_at` only bumps when the agent
 *  emits an observability event (tool start / end, message send, etc.).
 *  A single tool call — `yt-dlp` downloading a long video, `ffmpeg`
 *  transcoding, `opencli browser` rendering a JS-heavy page, a slow
 *  LLM stream on a rate-limited account — can legitimately run for
 *  several minutes between events. The earlier 90-second window was
 *  flagging healthy long-running calls as stalled.
 *
 *  5 minutes gives the UI an honest "this is taking unusually long"
 *  signal while still firing well before the 10-minute stale-run
 *  reaper (`markStaleAgentRuns`, agents/observability.ts) flips the
 *  row to `failed`. */
const STALLED_INTERVAL = `5 minutes`

api.get('/agents/observability/runs', async (req, res) => {
  const { companyId: tenant } = await requireDevtools(req)
  const clauses = ['r.company_id = $1']
  const params: unknown[] = [tenant]

  const agentId = typeof req.query.agentId === 'string' ? req.query.agentId.trim() : ''
  if (agentId) {
    params.push(agentId)
    clauses.push(`r.agent_id = $${params.length}`)
  }

  const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
  if (status && AGENT_RUN_STATUSES.has(status)) {
    if (status === 'stalled') {
      clauses.push(`r.status = 'running' AND r.updated_at < NOW() - INTERVAL '${STALLED_INTERVAL}'`)
    } else if (status === 'running') {
      clauses.push(`r.status = 'running' AND r.updated_at >= NOW() - INTERVAL '${STALLED_INTERVAL}'`)
    } else {
      params.push(status)
      clauses.push(`r.status = $${params.length}`)
    }
  }

  const rawLimit = Number(req.query.limit ?? 50)
  const limit = Math.max(10, Math.min(100, Number.isFinite(rawLimit) ? rawLimit : 50))
  params.push(limit)

  const { rows } = await pool.query(
    `SELECT
        r.id,
        r.agent_id AS "agentId",
        COALESCE(p.name, r.agent_id) AS "agentName",
        p.role AS "agentRole",
        p.avatar_url AS "agentAvatarUrl",
        r.company_id AS "companyId",
        CASE
          WHEN r.status = 'running' AND r.updated_at < NOW() - INTERVAL '${STALLED_INTERVAL}' THEN 'stalled'
          ELSE r.status
        END AS status,
        r.stage,
        r.summary,
        r.error,
        r.trigger,
        r.input_message_ids AS "inputMessageIds",
        r.inbox_count AS "inboxCount",
        r.tool_call_count AS "toolCallCount",
        r.token_count AS "tokenCount",
        r.fingerprint,
        r.started_at AS "startedAt",
        r.updated_at AS "updatedAt",
        r.finished_at AS "finishedAt",
        ROUND(EXTRACT(EPOCH FROM (COALESCE(r.finished_at, NOW()) - r.started_at)) * 1000)::int AS "durationMs"
       FROM agent_runs r
       LEFT JOIN participants p ON p.id = r.agent_id AND p.company_id = r.company_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY r.started_at DESC
      LIMIT $${params.length}`,
    params,
  )
  res.json(rows)
})

api.get('/agents/observability/runs/:id/events', async (req, res) => {
  const { companyId: tenant } = await requireDevtools(req)
  const { rows: gate } = await pool.query(
    `SELECT 1 FROM agent_runs WHERE id = $1 AND company_id = $2 LIMIT 1`,
    [req.params.id, tenant],
  )
  if (!gate[0]) { res.status(404).json({ error: 'not found' }); return }

  const { rows } = await pool.query(
    `SELECT
        id,
        run_id AS "runId",
        agent_id AS "agentId",
        kind,
        level,
        title,
        data,
        created_at AS "createdAt"
       FROM agent_events
      WHERE run_id = $1 AND company_id = $2
      ORDER BY created_at ASC, id ASC`,
    [req.params.id, tenant],
  )
  res.json(rows)
})

// Triage cost-effectiveness ledger: is the small-brain gate actually saving money
// (vs the cache-warm big-brain turns it shields)? Cache-aware, $ + tokens.
api.get('/agents/observability/triage', async (req, res) => {
  const { companyId: tenant } = await requireDevtools(req)
  const agentId = typeof req.query.agentId === 'string' && req.query.agentId.trim() ? req.query.agentId.trim() : null
  const rawHours = Number(req.query.sinceHours ?? 24)
  const sinceHours = Math.max(1, Math.min(720, Number.isFinite(rawHours) ? rawHours : 24))
  res.json(await getTriageEconomics({ companyId: tenant, agentId, sinceHours }))
})

// Universal LLM-spend ledger rollup by purpose × model × source. Answers the
// question "which business logic burned the most sub2api tokens?" — bucketed
// per purpose so the operator can target optimization at the actual hot spot
// (e.g. inbox-triage vs compaction vs convene-decision) instead of guessing.
api.get('/agents/observability/llm-spend', async (req, res) => {
  const { companyId: tenant } = await requireDevtools(req)
  const rawDays = Number(req.query.sinceDays ?? 30)
  const sinceDays = Math.max(1, Math.min(365, Number.isFinite(rawDays) ? rawDays : 30))
  const modelFilter = typeof req.query.model === 'string' && req.query.model.trim() ? req.query.model.trim() : null
  // Use lazy import to avoid pulling the ledger into every router boot path.
  const { getLlmSpendRollup } = await import('../../agents/llm-ledger.js')
  res.json(await getLlmSpendRollup({ companyId: tenant, sinceDays, model: modelFilter }))
})
