import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { type NextFunction, type Request, type Response, Router } from 'express'
import type { PoolClient } from 'pg'
import { completeCanvasWork, getCanvasSnapshot, listCanvasAvailableAgents, setCanvasStatus } from '../canvas/service.js'
import { pool } from '../db/pool.js'
import { wukongClient } from '../im/wukong.js'
import { actionRequiresApproval, executeLearningAction } from './learning-actions.js'
import { applyMemorySynthesis, buildPromptContext, loadMemorySynthesisBatch, recordMemoryEvidence } from './memory-service.js'
import type { AgentRunEvent, AgentSessionRecord, AgentWorkItem, HostAction, HostActionResult, LingxiMessageV1 } from './types.js'
import { retrieveKnowledge } from '../knowledge/service.js'

export const agentOSControlRouter = Router()

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }

function serviceAuthorized(req: Request): boolean {
  const expected = process.env.AGENT_OS_SERVICE_TOKEN ?? 'dev-agent-os-service-token'
  const auth = req.headers.authorization
  const provided = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
}

agentOSControlRouter.use((req, res, next) => {
  if (!serviceAuthorized(req)) { res.status(401).json({ error: 'invalid Agent OS service identity' }); return }
  next()
})

function safe(handler: (req: Request, res: Response) => Promise<void>): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => { void handler(req, res).catch(next) }
}

interface WorkRow {
  id: string
  fence: string | number
  company_id: string
  agent_id: string
  channel_id: string
  thread_root_client_msg_no: string | null
  trigger_client_msg_no: string
  reason: AgentWorkItem['reason']
  lane: AgentWorkItem['lane']
  created_at?: string
  available_at?: string
  attempts?: number
  preemptions?: number
  canvas_id: string | null
  canvas_assignment_id: string | null
}

function workFromRow(row: WorkRow, leaseToken: string): AgentWorkItem {
  return {
    id: row.id,
    fence: Number(row.fence),
    companyId: row.company_id,
    agentId: row.agent_id,
    channelId: row.channel_id,
    ...(row.thread_root_client_msg_no ? { threadRootClientMsgNo: row.thread_root_client_msg_no } : {}),
    triggerClientMsgNo: row.trigger_client_msg_no,
    reason: row.reason,
    lane: row.lane,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.available_at ? { availableAt: row.available_at } : {}),
    ...(row.attempts === undefined ? {} : { attempts: Number(row.attempts) }),
    ...(row.preemptions === undefined ? {} : { preemptions: Number(row.preemptions) }),
    ...(row.canvas_id ? { canvasId: row.canvas_id } : {}),
    ...(row.canvas_assignment_id ? { canvasAssignmentId: row.canvas_assignment_id } : {}),
    leaseToken,
  }
}

function workSessionKey(row: WorkRow | AgentWorkItem): string {
  const companyId = 'company_id' in row ? row.company_id : row.companyId
  const agentId = 'agent_id' in row ? row.agent_id : row.agentId
  const channelId = 'channel_id' in row ? row.channel_id : row.channelId
  const thread = 'thread_root_client_msg_no' in row ? row.thread_root_client_msg_no : row.threadRootClientMsgNo
  return [companyId, agentId, channelId, thread ?? '-'].join(':')
}

async function requireLease(req: Request, actionable = false): Promise<{ work: AgentWorkItem; row: WorkRow }> {
  const id = req.params.id
  const fence = Number(req.body?.fence ?? req.query.fence)
  const leaseToken = String(req.body?.leaseToken ?? req.query.leaseToken ?? '')
  const { rows } = await pool.query<WorkRow>(
    `SELECT id, fence, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason,lane,canvas_id,canvas_assignment_id
       FROM agent_work_items
       WHERE id=$1 AND fence=$2 AND lease_token_hash=$3 AND status='leased' AND lease_expires_at > NOW()
         ${actionable ? 'AND cancel_requested_at IS NULL' : ''}`,
    [id, fence, hash(leaseToken)],
  )
  if (!rows[0]) throw Object.assign(new Error('work lease lost or expired'), { status: 409 })
  return { row: rows[0], work: workFromRow(rows[0], leaseToken) }
}

agentOSControlRouter.post('/work/claim', safe(async (req, res) => {
  const workerId = String(req.body?.workerId ?? '').trim()
  if (!workerId) { res.status(400).json({ error: 'workerId required' }); return }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM agent_os_session_leases WHERE expires_at <= NOW()`)
    const { rows } = await client.query<WorkRow>(
      `SELECT id, fence, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason,lane,
              canvas_id,canvas_assignment_id,created_at,available_at,attempts,preemptions
         FROM agent_work_items
         WHERE (status='queued' OR (status='leased' AND lease_expires_at <= NOW()))
           AND cancel_requested_at IS NULL
          AND available_at <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM agent_os_session_leases sl
             WHERE sl.session_key = agent_work_items.company_id || ':' || agent_work_items.agent_id || ':' ||
               agent_work_items.channel_id || ':' || COALESCE(agent_work_items.thread_root_client_msg_no, '-')
               AND sl.expires_at > NOW()
          )
        ORDER BY CASE lane WHEN 'learner' THEN 4 WHEN 'approval' THEN 3 WHEN 'collaboration' THEN 2 ELSE 1 END DESC,
                 priority DESC, created_at ASC
        FOR UPDATE SKIP LOCKED LIMIT 1`,
    )
    if (!rows[0]) { await client.query('COMMIT'); res.json(null); return }
    const token = randomBytes(32).toString('base64url')
    const proposedFence = Number(rows[0].fence) + 1
    const sessionLease = await client.query(
      `INSERT INTO agent_os_session_leases (session_key, work_id, fence, expires_at)
       VALUES ($1,$2,$3,NOW()+INTERVAL '45 seconds')
       ON CONFLICT (session_key) DO NOTHING RETURNING session_key`,
      [workSessionKey(rows[0]), rows[0].id, proposedFence],
    )
    if (!sessionLease.rows[0]) { await client.query('COMMIT'); res.json(null); return }
    const { rows: claimed } = await client.query<WorkRow>(
      `UPDATE agent_work_items
          SET status='leased', fence=fence+1, lease_token_hash=$2, leased_by=$3, lease_started_at=NOW(),
              lease_expires_at=NOW()+INTERVAL '45 seconds', attempts=attempts+1, updated_at=NOW()
        WHERE id=$1
      RETURNING id, fence, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason,lane,
                canvas_id,canvas_assignment_id,created_at,available_at,attempts,preemptions`,
      [rows[0].id, hash(token), workerId],
    )
    await client.query('COMMIT')
    res.json(workFromRow(claimed[0], token))
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}))

agentOSControlRouter.post('/work/:id/heartbeat', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const { rows } = await pool.query<{ cancel_requested_at: string | null; preempt_requested_at: string | null; steer_inputs: Array<{ id: string; text: string; createdAt: string }> }>(
    `WITH renewed AS (
       UPDATE agent_work_items SET lease_expires_at=NOW()+INTERVAL '45 seconds', updated_at=NOW()
        WHERE id=$1 AND fence=$2 AND lease_token_hash=$3 AND status='leased'
        RETURNING cancel_requested_at, preempt_requested_at, steer_inputs
     ), session_renewed AS (
       UPDATE agent_os_session_leases SET expires_at=NOW()+INTERVAL '45 seconds', updated_at=NOW()
        WHERE work_id=$1 AND fence=$2 AND EXISTS (SELECT 1 FROM renewed)
     ) SELECT cancel_requested_at, preempt_requested_at, steer_inputs FROM renewed`,
    [work.id, work.fence, hash(work.leaseToken)],
  )
  const row = rows[0]
  res.json({ ok: Boolean(row), cancelRequested: Boolean(row?.cancel_requested_at), preemptRequested: Boolean(row?.preempt_requested_at), steer: row?.steer_inputs ?? [] })
}))

agentOSControlRouter.post('/work/:id/yield', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `UPDATE agent_work_items
          SET status='queued', fence=fence+1, lease_token_hash=NULL, leased_by=NULL, lease_expires_at=NULL,
              preempt_requested_at=NULL, preempt_grace_expires_at=NULL, preemptions=preemptions+1,
              available_at=NOW()+INTERVAL '1 second', updated_at=NOW()
        WHERE id=$1 AND fence=$2 AND lease_token_hash=$3 AND status='leased' AND preempt_requested_at IS NOT NULL
        RETURNING id`,
      [work.id, work.fence, hash(work.leaseToken)],
    )
    if (!rows[0]) { await client.query('ROLLBACK'); res.status(409).json({ error: 'work is no longer yieldable' }); return }
    await client.query(`DELETE FROM agent_os_session_leases WHERE work_id=$1 AND fence=$2`, [work.id, work.fence])
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}))

agentOSControlRouter.get('/work/:id/context', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const [{ rows: personas }, { rows: bindings }] = await Promise.all([
    pool.query<{ name: string; role: string | null; system_prompt: string | null; capabilities: string[] | null; updated_at: string }>(
      `SELECT name, role, system_prompt, capabilities, updated_at FROM participants WHERE id=$1 AND company_id=$2 AND kind='agent' LIMIT 1`,
      [work.agentId, work.companyId],
    ),
    pool.query<{ profile: Record<string, unknown> }>(
      `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [work.channelId, work.companyId],
    ),
  ])
  if (!personas[0]) { res.status(404).json({ error: 'agent not found' }); return }
  const profile = bindings[0]?.profile ?? {}
  const channelType = Number(profile.channelType ?? 2)
  const history = await wukongClient().syncMessages(work.channelId, channelType, 80, work.agentId)
  const messages = history.map((message) => ({
    clientMsgNo: message.clientMsgNo,
    authorId: message.fromUid,
    authorName: String((message.payload.data as Record<string, unknown> | undefined)?.authorName ?? message.fromUid),
    authorKind: (message.payload.refs?.agentId ? 'agent' : 'human') as 'agent' | 'human',
    body: message.payload.body ?? JSON.stringify(message.payload.data ?? {}),
    createdAt: new Date(message.timestamp > 10_000_000_000 ? message.timestamp : message.timestamp * 1000).toISOString(),
    ...(message.payload.replyToClientMsgNo ? { replyToClientMsgNo: message.payload.replyToClientMsgNo } : {}),
  }))
  const triggerMessage = messages.find((message) => message.clientMsgNo === work.triggerClientMsgNo)
  const learnerMessage = triggerMessage?.authorKind === 'human' ? triggerMessage : [...messages].reverse().find((message) => message.authorKind === 'human')
  const { rows: workspaceRows } = await pool.query<{ kind: string; source_count: number; ingestion_failure: string | null }>(
    `SELECT c.kind,
            (SELECT COUNT(*)::int FROM knowledge_sources s WHERE s.project_id = c.project_id AND s.status = 'ready' AND s.deleted_at IS NULL) AS source_count,
            (SELECT COALESCE(j.wake_error, s.error) FROM knowledge_sources s
               LEFT JOIN knowledge_source_jobs j ON j.source_id=s.id
              WHERE s.company_id=c.company_id AND s.origin_client_msg_no=$3 AND s.deleted_at IS NULL
              ORDER BY s.created_at DESC LIMIT 1) AS ingestion_failure
       FROM conversations c WHERE c.id = $1 AND c.company_id = $2 LIMIT 1`,
    [work.channelId, work.companyId, work.triggerClientMsgNo],
  )
  const workspaceRow = workspaceRows[0]
  const knowledgeContext = workspaceRow?.kind === 'group' && learnerMessage
    ? await retrieveKnowledge({
        conversationId: work.channelId,
        query: triggerMessage?.body ?? learnerMessage.body,
      }).catch((error) => {
        console.warn('[knowledge] retrieval failed:', error instanceof Error ? error.message : String(error))
        return []
      })
    : []
  const persona = { name: personas[0].name, role: personas[0].role ?? 'Learning Agent', instructions: personas[0].system_prompt ?? '' }
  const promptContextCandidate = learnerMessage ? await buildPromptContext({
    epoch: 0, companyId: work.companyId, agentId: work.agentId, conversationId: work.channelId,
    learnerId: learnerMessage.authorId, query: triggerMessage?.body ?? learnerMessage.body,
    persona, capabilities: personas[0].capabilities ?? [],
    sourceVersions: { persona: personas[0].updated_at, capabilities: personas[0].updated_at },
  }) : undefined
  const approvalId = work.reason === 'resume' && work.triggerClientMsgNo.startsWith('approval:')
    ? work.triggerClientMsgNo.slice('approval:'.length)
    : null
  const { rows: approvals } = approvalId
    ? await pool.query<{ id: string; status: string; result: unknown; error: string | null }>(
      `SELECT id, status, result, error FROM agent_os_approvals
        WHERE id=$1 AND agent_id=$2 AND channel_id=$3 AND status IN ('approved','rejected')
        LIMIT 1`, [approvalId, work.agentId, work.channelId],
    )
    : { rows: [] }
  const canvas = work.canvasId ? await getCanvasSnapshot(work.companyId, work.agentId, work.canvasId) : null
  const canvasRoster = await listCanvasAvailableAgents(work.companyId)
  res.json({
    work,
    persona,
    messages,
    knowledgeContext,
    knowledgeSourceCount: workspaceRow?.source_count ?? 0,
    ...(workspaceRow?.ingestion_failure ? { knowledgeIngestionFailure: workspaceRow.ingestion_failure } : {}),
    ...(learnerMessage ? { learnerId: learnerMessage.authorId } : {}),
    ...(promptContextCandidate ? { promptContextCandidate } : {}),
    canvasRoster,
    ...(canvas ? { canvas: {
      id: canvas.id, title: canvas.title, goal: canvas.goal, status: canvas.status,
      initiatorAgentId: canvas.initiatorAgentId,
      assignment: canvas.assignments.find((item) => item.agentId === work.agentId),
      assignments: canvas.assignments, frames: canvas.frames,
      activity: canvas.activity.slice(0, 50),
    } } : {}),
    ...(approvals[0] ? { pendingApproval: {
      approvalId: approvals[0].id,
      approved: approvals[0].status === 'approved',
      result: approvals[0].result,
      error: approvals[0].error ?? undefined,
    } } : {}),
  })
}))

agentOSControlRouter.get('/work/:id/memory-synthesis', safe(async (req, res) => {
  const { work } = await requireLease(req)
  if (work.reason !== 'memory_synthesis') { res.status(409).json({ error: 'not a memory synthesis work item' }); return }
  res.json({ batch: await loadMemorySynthesisBatch(work) })
}))

agentOSControlRouter.post('/work/:id/memory-evidence', safe(async (req, res) => {
  const { work } = await requireLease(req)
  await recordMemoryEvidence({ work, learnerId: String(req.body?.learnerId ?? ''), userText: String(req.body?.userText ?? ''), assistantText: String(req.body?.assistantText ?? '') })
  res.json({ ok: true })
}))

agentOSControlRouter.post('/work/:id/memory-synthesis', safe(async (req, res) => {
  const { work } = await requireLease(req)
  if (work.reason !== 'memory_synthesis') { res.status(409).json({ error: 'not a memory synthesis work item' }); return }
  res.json(await applyMemorySynthesis({
    work, evidenceIds: Array.isArray(req.body?.evidenceIds) ? req.body.evidenceIds.map(String) : [],
    changes: req.body?.changes, approved: req.body?.approved === true, confidence: Number(req.body?.confidence ?? 0),
  }))
}))

agentOSControlRouter.get('/sessions/:key', safe(async (req, res) => {
  const { rows } = await pool.query<{
    session_key: string; company_id: string; agent_id: string; channel_id: string
    thread_root_client_msg_no: string | null; summary: string | null; history: AgentSessionRecord['history']; revision: string | number
    compaction_epoch: number; prompt_context: AgentSessionRecord['promptContext'] | null
    applied_work_ids: string[] | null
  }>(`SELECT * FROM agent_os_sessions WHERE session_key=$1`, [req.params.key])
  const row = rows[0]
  res.json({ session: row ? {
    key: row.session_key, companyId: row.company_id, agentId: row.agent_id, channelId: row.channel_id,
    ...(row.thread_root_client_msg_no ? { threadRootClientMsgNo: row.thread_root_client_msg_no } : {}),
    ...(row.summary ? { summary: row.summary } : {}), history: row.history, revision: Number(row.revision),
    compactionEpoch: Number(row.compaction_epoch ?? 0), appliedWorkIds: row.applied_work_ids ?? [],
    ...(row.prompt_context ? { promptContext: row.prompt_context } : {}),
  } : null })
}))

agentOSControlRouter.put('/sessions', safe(async (req, res) => {
  const session = req.body?.session as AgentSessionRecord
  const workId = String(req.body?.workId ?? '')
  const fence = Number(req.body?.fence)
  const leaseToken = String(req.body?.leaseToken ?? '')
  if (!session || !workId || !Number.isInteger(fence) || !leaseToken) {
    res.status(400).json({ error: 'work lease and session required' }); return
  }
  const expectedKey = [session.companyId, session.agentId, session.channelId, session.threadRootClientMsgNo ?? '-'].join(':')
  if (!session.key || session.key !== expectedKey || !Array.isArray(session.history) || !Number.isInteger(session.revision) || session.revision < 0) {
    res.status(400).json({ error: 'invalid Agent OS session identity' }); return
  }
  const { rows: scope } = await pool.query(
    `SELECT 1 FROM agent_work_items w
      JOIN agent_os_session_leases sl ON sl.work_id=w.id AND sl.fence=w.fence
     WHERE w.id=$1 AND w.fence=$2 AND w.lease_token_hash=$3 AND w.status='leased' AND w.lease_expires_at>NOW()
       AND w.company_id=$4 AND w.agent_id=$5 AND w.channel_id=$6
       AND COALESCE(w.thread_root_client_msg_no,'-')=COALESCE($7,'-')
       AND sl.session_key=$8 AND sl.expires_at>NOW() LIMIT 1`,
    [workId, fence, hash(leaseToken), session.companyId, session.agentId, session.channelId,
      session.threadRootClientMsgNo ?? null, session.key],
  )
  if (!scope[0]) { res.status(409).json({ error: 'work lease lost before session save' }); return }
  const { rows: saved } = await pool.query<{ revision: string | number }>(
    `INSERT INTO agent_os_sessions
       (session_key, company_id, agent_id, channel_id, thread_root_client_msg_no, summary, history, revision, compaction_epoch, prompt_context, applied_work_ids)
     SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,1,$9,$10::jsonb,$11::jsonb WHERE $8=0
     ON CONFLICT (session_key) DO UPDATE SET summary=EXCLUDED.summary, history=EXCLUDED.history,
       compaction_epoch=EXCLUDED.compaction_epoch,prompt_context=EXCLUDED.prompt_context,
       applied_work_ids=EXCLUDED.applied_work_ids,
       revision=agent_os_sessions.revision+1, updated_at=NOW()
     WHERE agent_os_sessions.revision=$8
     RETURNING revision`,
    [session.key, session.companyId, session.agentId, session.channelId, session.threadRootClientMsgNo ?? null,
      session.summary ?? null, JSON.stringify(session.history), session.revision, session.compactionEpoch,
      session.promptContext ? JSON.stringify(session.promptContext) : null, JSON.stringify(session.appliedWorkIds ?? [])],
  )
  if (!saved[0]) { res.status(409).json({ error: 'Agent OS session revision conflict' }); return }
  res.json({ ok: true, revision: Number(saved[0].revision) })
}))

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

async function actionFromLedger(client: PoolClient, key: string, action: HostAction): Promise<HostActionResult | null> {
  const { rows } = await client.query<{
    status: string; result: unknown; error: string | null; approval_id: string | null; action: string; args: unknown
  }>(
    `SELECT status, result, error, approval_id, action, args FROM agent_host_actions WHERE idempotency_key=$1`, [key],
  )
  const row = rows[0]
  if (!row) return null
  if (row.action !== action.action || canonicalJson(row.args) !== canonicalJson(action.args)) {
    throw new Error('Host Action idempotency key was reused for a different action')
  }
  if (row.status === 'succeeded') {
    const stored = row.result as { __hostActionResult?: boolean; value?: unknown; directive?: HostActionResult['directive'] } | null
    return stored?.__hostActionResult ? { ok: true, value: stored.value, ...(stored.directive ? { directive: stored.directive } : {}) } : { ok: true, value: row.result }
  }
  if (row.status === 'failed') return { ok: false, error: row.error ?? 'action failed' }
  if (row.status === 'awaiting_approval' && row.approval_id) return { ok: false, approval: { id: row.approval_id, status: 'pending' } }
  return null
}

const ACTION_CAPABILITIES: Record<string, string> = {
  files: 'files', documents: 'documents', boards: 'documents', calendar: 'calendar',
  research: 'web', canvas: 'canvas', email: 'email', knowledge: 'knowledge',
}

async function assertActionAllowed(work: AgentWorkItem, action: HostAction): Promise<void> {
  if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/.test(action.action)) throw new Error('invalid Host Action name')
  if (!Number.isInteger(action.callIndex) || action.callIndex < 0) throw new Error('invalid Host Action callIndex')
  if (action.idempotencyKey !== `${action.runId}:${action.cellId}:${action.callIndex}`) throw new Error('invalid Host Action idempotency key')
  if (action.runId !== work.id) throw new Error('Host Action run identity must equal its durable work id')
  if (JSON.stringify(action.args).length > 64 * 1024) throw new Error('Host Action arguments exceed 64 KiB')
  const { rows } = await pool.query<{ capabilities: string[] | null }>(
    `SELECT capabilities FROM participants
      WHERE id=$1 AND company_id=$2 AND kind='agent' AND departed_at IS NULL`,
    [work.agentId, work.companyId],
  )
  if (!rows[0]) throw new Error('Agent identity is not active in this tenant')
  const namespace = action.action.split('.')[0]
  const required = ACTION_CAPABILITIES[namespace]
  if (required && !(rows[0].capabilities ?? []).includes(required)) throw new Error(`Agent lacks ${required} capability`)
}

export async function executeActionWithLedger(work: AgentWorkItem, action: HostAction, approved = false): Promise<HostActionResult> {
  await assertActionAllowed(work, action)
  const client = await pool.connect()
  let transactionOpen = false
  try {
    // Keep the work fence for the whole side-effect execution. Stop takes the
    // same lock before committing cancellation, so once Stop returns an old
    // lease cannot begin another Host Action.
    if (work.canvasId) {
      // Canvas actions share this workspace fence; workspace Stop takes its
      // exclusive counterpart before changing durable state.
      await client.query(`SELECT pg_advisory_lock_shared(hashtextextended($1, 0))`, [`canvas-workspace:${work.canvasId}`])
    }
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [`agent-work:${work.id}`])
    // Serialize one stable action key across API replicas. If this process
    // crashes, Postgres releases the lock and the retry reuses the same sink
    // idempotency key derived from work/hop/call.
    await client.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [action.idempotencyKey])
    await client.query('BEGIN')
    transactionOpen = true
    // Revalidate every work item after the advisory locks have been acquired.
    // The HTTP entry check may have succeeded before a lease expiry/reclaim;
    // this fence prevents that stale request from executing a side effect.
    const { rows: actionable } = await client.query<{ id: string }>(
      `SELECT id FROM agent_work_items WHERE id=$1 AND fence=$2 AND lease_token_hash=$3
        AND status='leased' AND lease_expires_at > NOW() AND cancel_requested_at IS NULL`,
      [work.id, work.fence, hash(work.leaseToken)],
    )
    if (!actionable[0]) throw Object.assign(new Error('work was stopped or lease was replaced'), { status: 409 })
    const replay = await actionFromLedger(client, action.idempotencyKey, action)
    if (replay && !(approved && replay.approval)) { await client.query('COMMIT'); return replay }
    await client.query(
      `INSERT INTO agent_host_actions
         (idempotency_key, work_id, run_id, cell_id, call_index, action, args)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [action.idempotencyKey, work.id, action.runId, action.cellId, action.callIndex, action.action, JSON.stringify(action.args)],
    )
    if (!approved && actionRequiresApproval(action.action)) {
      const approvalId = randomUUID()
      await client.query(
        `INSERT INTO agent_os_approvals
           (id, company_id, agent_id, channel_id, work_id, idempotency_key, action, args, summary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [approvalId, work.companyId, work.agentId, work.channelId, work.id, action.idempotencyKey,
          action.action, JSON.stringify(action.args), `${work.agentId} requests ${action.action}`],
      )
      const { rows } = await client.query<{ id: string }>(`SELECT id FROM agent_os_approvals WHERE idempotency_key=$1`, [action.idempotencyKey])
      await client.query(`UPDATE agent_host_actions SET status='awaiting_approval', approval_id=$2, updated_at=NOW() WHERE idempotency_key=$1`, [action.idempotencyKey, rows[0].id])
      await client.query('COMMIT')
      transactionOpen = false
      return { ok: false, approval: { id: rows[0].id, status: 'pending' } }
    }
    await client.query(
      `UPDATE agent_host_actions SET status='pending', error=NULL, updated_at=NOW() WHERE idempotency_key=$1`,
      [action.idempotencyKey],
    )
    await client.query('COMMIT')
    transactionOpen = false

    let result: HostActionResult
    try { result = await executeLearningAction(work, action) }
    catch (error) { result = { ok: false, error: error instanceof Error ? error.message : String(error) } }
    await client.query(
      `UPDATE agent_host_actions SET status=$2, result=$3::jsonb, error=$4, updated_at=NOW() WHERE idempotency_key=$1`,
      [action.idempotencyKey, result.ok ? 'succeeded' : 'failed', result.ok
        ? JSON.stringify({ __hostActionResult: true, value: result.value ?? null, ...(result.directive ? { directive: result.directive } : {}) })
        : null, result.error ?? null],
    )
    return result
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [action.idempotencyKey]).catch(() => undefined)
    if (work.canvasId) await client.query(`SELECT pg_advisory_unlock_shared(hashtextextended($1, 0))`, [`canvas-workspace:${work.canvasId}`]).catch(() => undefined)
    await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [`agent-work:${work.id}`]).catch(() => undefined)
    client.release()
  }
}

agentOSControlRouter.post('/work/:id/actions', safe(async (req, res) => {
  const { work } = await requireLease(req, true)
  res.json(await executeActionWithLedger(work, req.body.action as HostAction))
}))

agentOSControlRouter.post('/work/:id/events', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const event = req.body.event as AgentRunEvent
  await pool.query(
    `INSERT INTO agent_runs (id, agent_id, company_id, trigger, status, stage, reasoning_runtime)
     VALUES ($1,$2,$3,$4::jsonb,'running',$5,'agent-os') ON CONFLICT (id) DO NOTHING`,
    [event.runId, work.agentId, work.companyId, JSON.stringify({ reason: work.reason, clientMsgNo: work.triggerClientMsgNo }), event.kind],
  )
  await pool.query(
    `INSERT INTO agent_events (id, run_id, agent_id, company_id, kind, level, title, data, sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT (run_id, sequence) WHERE sequence IS NOT NULL DO NOTHING`,
    [randomUUID(), event.runId, work.agentId, work.companyId, event.kind,
      event.stage === 'failed' ? 'error' : 'info', event.kind, JSON.stringify(event.data), event.seq],
  )
  await pool.query(`UPDATE agent_runs SET stage=$2, updated_at=NOW() WHERE id=$1`, [event.runId, event.kind])
  if (work.reason === 'canvas_worker' && work.canvasId) {
    if (event.kind === 'run.started') {
      const { rows: started } = await pool.query<{ id: string }>(
        `UPDATE canvas_agent_assignments SET status='working',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING id`, [work.canvasAssignmentId],
      )
      if (started[0]) await setCanvasStatus({ companyId: work.companyId, canvasId: work.canvasId, actorId: work.agentId, actorKind: 'agent', status: 'working' }).catch(() => undefined)
    }
    res.json({ ok: true }); return
  }
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(`SELECT profile FROM im_channel_bindings WHERE channel_id=$1`, [work.channelId])
  const channelType = Number(rows[0]?.profile?.channelType ?? 2)
  const previewClientMsgNo = `preview-${event.runId}`
  if (event.kind === 'run.started') {
    // A run-start notification is transport state, not conversation content.
    // Keep it ephemeral so it cannot leak into history as a tool bubble.
    await wukongClient().emitEvent({
      channelId: work.channelId, channelType, fromUid: work.agentId, clientMsgNo: previewClientMsgNo,
      eventId: `${event.runId}:${event.seq}`, eventType: 'stream.open',
      data: { kind: 'text', text: '', phase: 'thinking', streamSeq: event.seq },
    }).catch(() => undefined)
  } else if (event.kind === 'model.delta') {
    await wukongClient().emitEvent({
      channelId: work.channelId, channelType, fromUid: work.agentId, clientMsgNo: previewClientMsgNo,
      eventId: `${event.runId}:${event.seq}`, eventType: 'stream.delta',
      data: { kind: 'text', delta: String((event.data as { delta?: unknown } | null)?.delta ?? ''), streamSeq: event.seq },
    }).catch(() => undefined)
  } else if (event.kind === 'run.completed' || event.kind === 'run.failed' || event.kind === 'run.cancelled') {
    const eventType = event.kind === 'run.completed' ? 'stream.close' : event.kind === 'run.cancelled' ? 'stream.cancel' : 'stream.error'
    await wukongClient().emitEvent({
      channelId: work.channelId, channelType, fromUid: work.agentId, clientMsgNo: previewClientMsgNo,
      eventId: `${event.runId}:${event.seq}`, eventType, data: { kind: 'text', event, streamSeq: event.seq },
    }).catch(() => undefined)
  } else if (event.kind === 'approval.pending') {
    const approvalId = String((event.data as { approvalId?: unknown } | null)?.approvalId ?? '')
    const { rows: approvals } = await pool.query<{
      id: string; agent_id: string; action: string; args: Record<string, unknown>; summary: string
      status: string; requested_at: string; resolved_at: string | null; resolved_by: string | null
    }>(`SELECT id, agent_id, action, args, summary, status, requested_at, resolved_at, resolved_by
          FROM agent_os_approvals WHERE id=$1 AND company_id=$2`, [approvalId, work.companyId])
    const approval = approvals[0]
    if (approval) {
      await wukongClient().sendMessage(work.channelId, channelType, work.agentId, {
        version: 1, kind: 'approval', clientMsgNo: `approval-${approval.id}`,
        body: approval.summary, refs: { approvalId: approval.id, runId: event.runId, agentId: work.agentId },
        data: {
          id: approval.id, agentId: approval.agent_id,
          kind: approval.action.startsWith('email.') ? 'external_communication' : 'sensitive_or_destructive_action',
          summary: approval.summary, status: approval.status, payload: { action: approval.action, args: approval.args },
          requestedAt: approval.requested_at, resolvedAt: approval.resolved_at, resolvedBy: approval.resolved_by,
          suppressAgentWake: true,
        },
      }).catch(() => undefined)
    }
  } else if (event.visibility === 'user') {
    const activity: LingxiMessageV1 = {
      version: 1, kind: event.kind.startsWith('approval.') ? 'approval' : 'tool_activity',
      clientMsgNo: `activity-${event.runId}-${event.seq}`, body: event.kind,
      refs: { runId: event.runId, agentId: work.agentId }, data: { stage: event.stage, suppressAgentWake: true },
    }
    await wukongClient().sendMessage(work.channelId, channelType, work.agentId, activity).catch(() => undefined)
  }
  res.json({ ok: true })
}))

agentOSControlRouter.post('/work/:id/messages', safe(async (req, res) => {
  const { work } = await requireLease(req)
  if (work.reason === 'canvas_summary' && work.canvasId) {
    const { rows: canvases } = await pool.query<{ status: string }>(`SELECT status FROM canvases WHERE id=$1 AND company_id=$2`, [work.canvasId, work.companyId])
    if (canvases[0]?.status !== 'summarizing') { res.json({ ok: true, suppressed: true }); return }
  }
  const message = req.body.message as LingxiMessageV1
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(`SELECT profile FROM im_channel_bindings WHERE channel_id=$1`, [work.channelId])
  res.json(await wukongClient().sendMessage(work.channelId, Number(rows[0]?.profile?.channelType ?? 2), work.agentId, message))
}))

agentOSControlRouter.post('/work/:id/complete', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const status = String(req.body.status)
  if (!['completed', 'failed', 'cancelled'].includes(status)) { res.status(400).json({ error: 'invalid status' }); return }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `UPDATE agent_work_items SET status=$2, error=$3,result_text=$5, lease_token_hash=NULL, lease_expires_at=NULL,
         updated_at=NOW(), finished_at=NOW() WHERE id=$1 AND fence=$4`,
      [work.id, status, req.body.error ?? null, work.fence, req.body.resultText ?? null],
    )
    await client.query(`DELETE FROM agent_os_session_leases WHERE work_id=$1 AND fence=$2`, [work.id, work.fence])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
  if (work.canvasId) {
    await completeCanvasWork({ workId: work.id, companyId: work.companyId,
      status: status as 'completed' | 'failed' | 'cancelled', resultText: req.body.resultText, error: req.body.error })
  }
  res.json({ ok: true })
}))
