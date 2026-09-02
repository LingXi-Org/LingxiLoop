import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { AssistantStreamChunk } from 'assistant-stream'
import { type NextFunction, type Request, type Response, Router } from 'express'
import { pool } from '../db/pool.js'
import { withTransaction } from '../db/transaction.js'
import { advanceAgentReadReceipt } from '../im/read-receipts.js'
import { wukongClient } from '../im/wukong.js'
import { recordLlmCall } from '../llm-ledger.js'
import { createPermissionService } from '../modules/access/public.js'
import { assertCanvasWorkReportReady, completeCanvasWork, getCanvasSnapshot, listCanvasAvailableAgents, setCanvasStatus } from '../modules/canvas/index.js'
import { retrieveKnowledge } from '../modules/knowledge/public.js'
import { loadLearningTurnContext, loadTeacherTurnContext } from '../modules/learning/public.js'
import { CH_ASSISTANT_STREAM, publish } from '../redis.js'
import { executeActionWithLedger } from './host-action-application.js'
import { applyMemorySynthesis, buildPromptContext, loadMemorySynthesisBatch, recordMemoryEvidence } from './memory-service.js'
import { agentOSNodeTimeoutSeconds } from './node-liveness.js'
import {
  type AgentRunEvent,
  type AgentSessionRecord,
  type AgentWorkItem,
  type HostAction,
  KNOWLEDGE_CONTRACT_VERSION,
  type LingxiMessageV1,
} from './types.js'

export { executeActionWithLedger } from './host-action-application.js'

export const agentOSControlRouter = Router()

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }

function validPartIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

type KnowledgeDocumentReference = {
  marker: string
  sourceId: string
  title: string
  pages: number
  anchors: Array<{ page: number; quote: string }>
}

type KnowledgeConfidenceClaim = {
  id: string
  text: string
  confidence: 'grounded'
  basis: string
  markers: string[]
}

function parseKnowledgeConfidenceClaims(value: unknown): KnowledgeConfidenceClaim[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 64) return null
  const ids = new Set<string>()
  const claims: KnowledgeConfidenceClaim[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const claim = item as Record<string, unknown>
    if (
      typeof claim.id !== 'string'
      || !claim.id.trim()
      || ids.has(claim.id)
      || typeof claim.text !== 'string'
      || !claim.text.trim()
      || claim.text.length > 4_000
      || claim.confidence !== 'grounded'
      || typeof claim.basis !== 'string'
      || !claim.basis.trim()
      || claim.basis.length > 1_000
      || !Array.isArray(claim.markers)
      || claim.markers.length === 0
      || claim.markers.some((marker) => typeof marker !== 'string' || !/^S\d+$/.test(marker))
      || new Set(claim.markers).size !== claim.markers.length
    ) return null
    ids.add(claim.id)
    claims.push({
      id: claim.id,
      text: claim.text,
      confidence: 'grounded',
      basis: claim.basis,
      markers: claim.markers as string[],
    })
  }
  return claims
}

function parseKnowledgeDocumentReferences(value: unknown): KnowledgeDocumentReference[] | null {
  if (!Array.isArray(value) || value.length > 8) return null
  const markers = new Set<string>()
  const sourceIds = new Set<string>()
  const references: KnowledgeDocumentReference[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const reference = item as Record<string, unknown>
    if (
      typeof reference.marker !== 'string'
      || !/^S\d+$/.test(reference.marker)
      || markers.has(reference.marker)
      || typeof reference.sourceId !== 'string'
      || !reference.sourceId.trim()
      || sourceIds.has(reference.sourceId)
      || typeof reference.title !== 'string'
      || !reference.title.trim()
      || reference.title.length > 500
      || typeof reference.pages !== 'number'
      || !Number.isSafeInteger(reference.pages)
      || reference.pages < 1
      || !Array.isArray(reference.anchors)
      || reference.anchors.length === 0
      || reference.anchors.length > 24
    ) return null
    const pages = reference.pages
    const anchors = reference.anchors.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const anchor = item as Record<string, unknown>
      return typeof anchor.page === 'number'
        && Number.isSafeInteger(anchor.page)
        && anchor.page >= 1
        && anchor.page <= pages
        && typeof anchor.quote === 'string'
        && anchor.quote.trim()
        && anchor.quote.length <= 2_000
        ? [{ page: anchor.page, quote: anchor.quote }]
        : []
    })
    if (anchors.length !== reference.anchors.length) return null
    markers.add(reference.marker)
    sourceIds.add(reference.sourceId)
    references.push({
      marker: reference.marker,
      sourceId: reference.sourceId,
      title: reference.title,
      pages,
      anchors,
    })
  }
  return references
}

function contextualKnowledgeQuery(
  messages: Array<{ clientMsgNo: string; authorKind: 'agent' | 'human'; body: string; replyToClientMsgNo?: string }>,
  current: { clientMsgNo: string; body: string; replyToClientMsgNo?: string },
): string {
  const reply = current.replyToClientMsgNo
    ? messages.find((message) => message.clientMsgNo === current.replyToClientMsgNo)
    : undefined
  const priorUsers = messages
    .filter((message) => message.authorKind === 'human' && message.clientMsgNo !== current.clientMsgNo)
    .slice(-2)
  return [
    `current user question: ${current.body}`,
    reply ? `replied-to ${reply.authorKind} message: ${reply.body}` : '',
    ...priorUsers.map((message) => `earlier user message: ${message.body}`),
  ].filter(Boolean).join('\n').slice(0, 2_000)
}

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
  authorization_user_id: string | null
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
  execution_role: AgentWorkItem['executionRole']
  progress_fingerprint: string | null
  no_progress_count: number
}

function workFromRow(row: WorkRow, leaseToken: string, homeEpoch?: number): AgentWorkItem {
  return {
    id: row.id,
    fence: Number(row.fence),
    ...(homeEpoch === undefined ? {} : { homeEpoch }),
    companyId: row.company_id,
    ...(row.authorization_user_id ? { authorizationUserId: row.authorization_user_id } : {}),
    agentId: row.agent_id,
    channelId: row.channel_id,
    ...(row.thread_root_client_msg_no ? { threadRootClientMsgNo: row.thread_root_client_msg_no } : {}),
    triggerClientMsgNo: row.trigger_client_msg_no,
    reason: row.reason,
    executionRole: row.execution_role,
    lane: row.lane,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.available_at ? { availableAt: row.available_at } : {}),
    ...(row.attempts === undefined ? {} : { attempts: Number(row.attempts) }),
    ...(row.preemptions === undefined ? {} : { preemptions: Number(row.preemptions) }),
    ...(row.canvas_id ? { canvasId: row.canvas_id } : {}),
    ...(row.canvas_assignment_id ? { canvasAssignmentId: row.canvas_assignment_id } : {}),
    ...(row.progress_fingerprint ? { progressFingerprint: row.progress_fingerprint } : {}),
    noProgressCount: Number(row.no_progress_count ?? 0),
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
    `SELECT id, fence, company_id, authorization_user_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason,lane,canvas_id,canvas_assignment_id,execution_role,progress_fingerprint,no_progress_count
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
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workerId)) {
    res.status(400).json({ error: 'workerId must be 1-128 safe identifier characters' }); return
  }
  const nodeTimeoutSeconds = agentOSNodeTimeoutSeconds()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `INSERT INTO agent_os_workers(worker_id,last_seen_at,updated_at) VALUES($1,NOW(),NOW())
       ON CONFLICT(worker_id) DO UPDATE SET last_seen_at=NOW(),updated_at=NOW()`,
      [workerId],
    )
    await client.query(`DELETE FROM agent_os_session_leases WHERE expires_at <= NOW()`)
    const { rows } = await client.query<WorkRow>(
      `SELECT work.id, work.fence, work.company_id, work.authorization_user_id, work.agent_id, work.channel_id,
              work.thread_root_client_msg_no, work.trigger_client_msg_no, work.reason, work.lane,
              work.canvas_id,work.canvas_assignment_id,work.created_at,work.available_at,work.attempts,work.preemptions,
              work.execution_role,work.progress_fingerprint,work.no_progress_count
         FROM agent_work_items work
         LEFT JOIN agent_os_session_routes session_route
           ON session_route.session_key=work.company_id || ':' || work.agent_id || ':' || work.channel_id || ':' || COALESCE(work.thread_root_client_msg_no, '-')
         LEFT JOIN agent_os_workers route_worker ON route_worker.worker_id=session_route.worker_id
         WHERE (work.status='queued' OR (work.status='leased' AND work.lease_expires_at <= NOW()))
           AND work.cancel_requested_at IS NULL
          AND work.available_at <= NOW()
          AND (session_route.session_key IS NULL OR session_route.worker_id=$1
               OR route_worker.last_seen_at <= NOW()-make_interval(secs => $2::int))
          AND NOT EXISTS (
            SELECT 1 FROM agent_os_session_leases sl
             WHERE sl.session_key = work.company_id || ':' || work.agent_id || ':' ||
               work.channel_id || ':' || COALESCE(work.thread_root_client_msg_no, '-')
               AND sl.expires_at > NOW()
          )
        ORDER BY CASE work.lane WHEN 'learner' THEN 4 WHEN 'approval' THEN 3 WHEN 'collaboration' THEN 2 ELSE 1 END DESC,
                 work.priority DESC, work.created_at ASC
        FOR UPDATE OF work SKIP LOCKED LIMIT 1`,
      [workerId, nodeTimeoutSeconds],
    )
    if (!rows[0]) { await client.query('COMMIT'); res.json(null); return }
    const sessionKey = workSessionKey(rows[0])
    const { rows: routes } = await client.query<{ home_epoch: string }>(
      `INSERT INTO agent_os_session_routes(session_key,worker_id,home_epoch,updated_at)
       VALUES($1,$2,1,NOW())
       ON CONFLICT(session_key) DO UPDATE
         SET worker_id=EXCLUDED.worker_id,
             home_epoch=CASE
               WHEN agent_os_session_routes.worker_id=EXCLUDED.worker_id THEN agent_os_session_routes.home_epoch
               ELSE agent_os_session_routes.home_epoch+1
             END,
             updated_at=NOW()
       WHERE agent_os_session_routes.worker_id=EXCLUDED.worker_id
          OR NOT EXISTS (
            SELECT 1 FROM agent_os_workers owner
             WHERE owner.worker_id=agent_os_session_routes.worker_id
               AND owner.last_seen_at > NOW()-make_interval(secs => $3::int)
          )
       RETURNING home_epoch`,
      [sessionKey, workerId, nodeTimeoutSeconds],
    )
    if (!routes[0]) { await client.query('COMMIT'); res.json(null); return }
    const token = randomBytes(32).toString('base64url')
    const proposedFence = Number(rows[0].fence) + 1
    const sessionLease = await client.query(
      `INSERT INTO agent_os_session_leases (session_key, work_id, fence, expires_at)
       VALUES ($1,$2,$3,NOW()+INTERVAL '45 seconds')
       ON CONFLICT (session_key) DO NOTHING RETURNING session_key`,
      [sessionKey, rows[0].id, proposedFence],
    )
    if (!sessionLease.rows[0]) { await client.query('COMMIT'); res.json(null); return }
    const { rows: claimed } = await client.query<WorkRow>(
      `UPDATE agent_work_items
          SET status='leased', fence=fence+1, lease_token_hash=$2, leased_by=$3, lease_started_at=NOW(),
              lease_expires_at=NOW()+INTERVAL '45 seconds', attempts=attempts+1, updated_at=NOW()
        WHERE id=$1
      RETURNING id, fence, company_id, authorization_user_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason,lane,
                canvas_id,canvas_assignment_id,created_at,available_at,attempts,preemptions,execution_role,progress_fingerprint,no_progress_count`,
      [rows[0].id, hash(token), workerId],
    )
    await client.query('COMMIT')
    res.json(workFromRow(claimed[0], token, Number(routes[0].home_epoch)))
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
        RETURNING cancel_requested_at, preempt_requested_at, steer_inputs, leased_by
     ), session_renewed AS (
       UPDATE agent_os_session_leases SET expires_at=NOW()+INTERVAL '45 seconds', updated_at=NOW()
        WHERE work_id=$1 AND fence=$2 AND EXISTS (SELECT 1 FROM renewed)
     ), worker_seen AS (
       INSERT INTO agent_os_workers(worker_id,last_seen_at,updated_at)
       SELECT leased_by,NOW(),NOW() FROM renewed WHERE leased_by IS NOT NULL
       ON CONFLICT(worker_id) DO UPDATE SET last_seen_at=NOW(),updated_at=NOW()
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
  const readThroughSeq = history.reduce((max, message) => Math.max(max, message.messageSeq), 0)
  if (readThroughSeq > 0) {
    await advanceAgentReadReceipt({
      companyId: work.companyId,
      channelId: work.channelId,
      agentId: work.agentId,
      readThroughSeq,
    })
  }
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
  const knowledgeAuthorizationUserId = work.authorizationUserId?.trim()
  if (!knowledgeAuthorizationUserId) {
    res.status(403).json({ error: 'Agent work has no persisted human authorization principal' })
    return
  }
  const persona = { name: personas[0].name, role: personas[0].role ?? 'Learning Agent', instructions: personas[0].system_prompt ?? '' }
  const capabilities = personas[0].capabilities ?? []
  const isTeacherAgent = capabilities.includes('teacher_admin')
  const { rows: workspaceRows } = await pool.query<{ kind: string; project_id: string | null; is_learning: boolean }>(
    `SELECT c.kind,c.project_id,
            EXISTS(
              SELECT 1 FROM projects project
              WHERE project.id=c.project_id AND project.company_id=c.company_id AND project.status <> 'DELETED'
            ) AS is_learning
       FROM conversations c WHERE c.id=$1 AND c.company_id=$2 LIMIT 1`,
    [work.channelId, work.companyId],
  )
  const workspace = workspaceRows[0]
  const knowledgeAccess = !isTeacherAgent && workspace?.project_id
    ? await createPermissionService(pool).can({
        actorUserId: knowledgeAuthorizationUserId,
        action: 'knowledge:read',
        companyId: work.companyId,
        projectId: workspace.project_id,
      })
    : null
  const { rows: sourceSummaries } = knowledgeAccess?.allowed && workspace?.project_id
    ? await pool.query<{ source_count: number; ingestion_failure: string | null }>(
        `SELECT
            (SELECT COUNT(*)::int FROM knowledge_sources source
              WHERE source.company_id=$1 AND source.project_id=$2 AND source.status='ready'
                AND (source.visibility_scope='PROJECT'
                  OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))
                AND source.deleted_at IS NULL) AS source_count,
            (SELECT COALESCE(job.wake_error, source.error) FROM knowledge_sources source
               LEFT JOIN knowledge_source_jobs job ON job.source_id=source.id
              WHERE source.company_id=$1 AND source.project_id=$2 AND source.origin_client_msg_no=$3
                AND (source.visibility_scope='PROJECT'
                  OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))
                AND source.deleted_at IS NULL
              ORDER BY source.created_at DESC LIMIT 1) AS ingestion_failure`,
        [work.companyId, workspace.project_id, work.triggerClientMsgNo, knowledgeAuthorizationUserId],
      )
    : { rows: [] }
  const workspaceRow = workspace
    ? { ...workspace, source_count: sourceSummaries[0]?.source_count ?? 0,
        ingestion_failure: sourceSummaries[0]?.ingestion_failure ?? null }
    : undefined
  const teacherContext = isTeacherAgent
    ? await loadTeacherTurnContext(work)
    : undefined
  if (isTeacherAgent && !teacherContext) { res.status(403).json({ error: 'Pulse is not authorized for this teacher room' }); return }
  const knowledgeContext = knowledgeAccess?.allowed
    && (workspaceRow?.kind === 'group' || workspaceRow?.kind === 'direct')
    && learnerMessage
    ? await retrieveKnowledge({
        companyId: work.companyId,
        conversationId: work.channelId,
        authorizationUserId: knowledgeAuthorizationUserId,
        query: triggerMessage?.body ?? learnerMessage.body,
        contextQuery: contextualKnowledgeQuery(messages, triggerMessage ?? learnerMessage),
      })
    : []
  const promptContextCandidate = learnerMessage || teacherContext ? await buildPromptContext({
    epoch: 0, companyId: work.companyId, agentId: work.agentId, conversationId: work.channelId,
    learnerId: learnerMessage?.authorId ?? teacherContext?.trigger.teacherId ?? 'teacher-room',
    query: triggerMessage?.body ?? learnerMessage?.body ?? 'Generate the scheduled teacher aggregate digest.',
    persona, capabilities,
    executionRole: work.executionRole,
    sourceVersions: {
      persona: personas[0].updated_at,
      capabilities: personas[0].updated_at,
      knowledgeContract: KNOWLEDGE_CONTRACT_VERSION,
    },
    skipMemories: isTeacherAgent,
  }) : undefined
  const learningContext = !isTeacherAgent && workspaceRow?.is_learning
    ? await loadLearningTurnContext(work, learnerMessage?.authorId)
    : undefined
  const approvalId = work.reason === 'resume' && work.triggerClientMsgNo.startsWith('approval:')
    ? work.triggerClientMsgNo.slice('approval:'.length)
    : null
  const { rows: approvals } = approvalId
    ? await pool.query<{ id: string; status: string; result: unknown; error: string | null }>(
      `SELECT id, status, result, error FROM approvals
        WHERE id=$1 AND agent_id=$2 AND channel_id=$3 AND source='AGENT_OS'
          AND status IN ('EXECUTED','REJECTED')
        LIMIT 1`, [approvalId, work.agentId, work.channelId],
    )
    : { rows: [] }
  const canvas = !isTeacherAgent && work.canvasId ? await getCanvasSnapshot(work.companyId, work.agentId, work.canvasId) : null
  const canvasRoster = isTeacherAgent ? [] : await listCanvasAvailableAgents(work.companyId)
  res.json({
    work,
    persona,
    capabilities,
    messages,
    knowledgeContext,
    ...(learningContext ? { learningContext } : {}),
    ...(teacherContext ? { teacherContext } : {}),
    knowledgeSourceCount: isTeacherAgent ? 0 : workspaceRow?.source_count ?? 0,
    ...(!isTeacherAgent && workspaceRow?.ingestion_failure ? { knowledgeIngestionFailure: workspaceRow.ingestion_failure } : {}),
    ...(!isTeacherAgent && learnerMessage ? { learnerId: learnerMessage.authorId } : {}),
    ...(promptContextCandidate ? { promptContextCandidate } : {}),
    canvasRoster,
    ...(canvas ? { canvas: {
      id: canvas.id, title: canvas.title, goal: canvas.goal, status: canvas.status,
      initiatorAgentId: canvas.initiatorAgentId,
      assignment: canvas.assignments.find((item) => item.agentId === work.agentId),
      assignments: canvas.assignments, reports: canvas.reports, frames: canvas.frames,
      activity: canvas.activity.slice(0, 50),
    } } : {}),
    ...(approvals[0] ? { pendingApproval: {
      approvalId: approvals[0].id,
      approved: approvals[0].status === 'EXECUTED',
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
     SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,1,$9,$10::jsonb,$11::jsonb
      WHERE $8=0 OR EXISTS (
        SELECT 1 FROM agent_os_sessions current
         WHERE current.session_key=$1 AND current.revision=$8
      )
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

agentOSControlRouter.post('/work/:id/actions', safe(async (req, res) => {
  const { work } = await requireLease(req, true)
  res.json(await executeActionWithLedger(work, req.body.action as HostAction))
}))

agentOSControlRouter.post('/work/:id/events', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const rawEvent: unknown = req.body.event
  if (!rawEvent || typeof rawEvent !== 'object') { res.status(400).json({ error: 'invalid Agent OS event' }); return }
  const event = rawEvent as AgentRunEvent
  if (
    event.runId !== work.id
    || !Number.isSafeInteger(event.seq)
    || event.seq <= 0
    || !['started', 'delta', 'completed', 'failed', 'cancelled'].includes(event.stage)
    || (event.visibility !== 'user' && event.visibility !== 'internal')
    || !event.data
    || typeof event.data !== 'object'
    || Array.isArray(event.data)
  ) { res.status(400).json({ error: 'invalid Agent OS event envelope' }); return }
  const knowledgeClaims = event.kind === 'knowledge.rag.completed'
    ? parseKnowledgeConfidenceClaims((event.data as Record<string, unknown>).previewClaims)
    : undefined
  const knowledgeReferences = event.kind === 'knowledge.rag.completed'
    ? parseKnowledgeDocumentReferences((event.data as Record<string, unknown>).previewReferences)
    : undefined
  const knowledgePartIndexStart = (event.data as Record<string, unknown>).partIndexStart
  if (event.kind === 'knowledge.rag.completed' && (
    knowledgeClaims === null || knowledgeReferences === null || !validPartIndex(knowledgePartIndexStart)
  )) {
    res.status(400).json({ error: 'invalid native RAG result' }); return
  }
  const ledgerData = { ...(event.data as Record<string, unknown>) }
  if (event.kind === 'knowledge.rag.completed') {
    delete ledgerData.previewClaims
    delete ledgerData.previewReferences
    ledgerData.ragHash = hash(JSON.stringify({ claims: knowledgeClaims, documentReferences: knowledgeReferences }))
  }
  await withTransaction(pool, async (db) => {
    await db.query(
    `INSERT INTO agent_runs (id, agent_id, company_id, trigger, status, stage, reasoning_runtime)
     VALUES ($1,$2,$3,$4::jsonb,'running',$5,'agent-os') ON CONFLICT (id) DO NOTHING`,
    [event.runId, work.agentId, work.companyId, JSON.stringify({ reason: work.reason, clientMsgNo: work.triggerClientMsgNo }), event.kind],
  )
    const { rows: insertedEvents } = await db.query<{ id: string }>(
    `INSERT INTO agent_events (id, run_id, agent_id, company_id, kind, level, title, data, sequence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
     ON CONFLICT (run_id, sequence) WHERE sequence IS NOT NULL DO NOTHING RETURNING id`,
    [randomUUID(), event.runId, work.agentId, work.companyId, event.kind,
      event.stage === 'failed' ? 'error' : 'info', event.kind, JSON.stringify(ledgerData), event.seq],
  )
  if (insertedEvents.length > 0 && (event.kind === 'model.completed' || event.kind === 'model.failed')) {
    const data = event.data as {
      model?: unknown
      purpose?: unknown
      usage?: { inputTokens?: unknown; outputTokens?: unknown; available?: unknown }
    }
      await recordLlmCall({
      context: {
        source: 'agent-os', companyId: work.companyId, agentId: work.agentId,
        runId: event.runId, conversationId: work.channelId,
        purpose: typeof data.purpose === 'string' ? data.purpose : 'agent-os-turn',
      },
      model: typeof data.model === 'string' ? data.model : 'unknown',
      usage: {
        prompt_tokens: typeof data.usage?.inputTokens === 'number' ? data.usage.inputTokens : 0,
        completion_tokens: typeof data.usage?.outputTokens === 'number' ? data.usage.outputTokens : 0,
      },
      measured: event.kind === 'model.completed' && data.usage?.available !== false,
      latencyMs: 0,
      status: event.kind === 'model.completed' ? 'succeeded' : 'failed',
      error: event.kind === 'model.failed' ? (data as { error?: unknown }).error : undefined,
      }, db, `llm-event-${event.runId}-${event.seq}`)
    }
  })
  await pool.query(`UPDATE agent_runs SET stage=$2, updated_at=NOW() WHERE id=$1`, [event.runId, event.kind])
  if (work.reason === 'canvas_worker' && work.canvasId) {
    if (event.kind === 'run.started') {
      const { rows: started } = await pool.query<{ id: string }>(
        `UPDATE canvas_agent_assignments SET status='working',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
          WHERE id=$1 AND status NOT IN ('completed','failed','cancelled') RETURNING id`, [work.canvasAssignmentId],
      )
      if (started[0]) await setCanvasStatus({ companyId: work.companyId, canvasId: work.canvasId, actorId: work.agentId, actorKind: 'agent', status: 'working' })
    }
    res.json({ ok: true }); return
  }
  if (work.reason === 'memory_synthesis') { res.json({ ok: true }); return }
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(`SELECT profile FROM im_channel_bindings WHERE channel_id=$1`, [work.channelId])
  const channelType = Number(rows[0]?.profile?.channelType ?? 2)
  const previewClientMsgNo = `preview-${event.runId}`
  const publishPreview = (chunks: AssistantStreamChunk[], sequence = event.seq * 2) => publish(CH_ASSISTANT_STREAM, {
    type: 'assistant.stream' as const,
    companyId: work.companyId,
    conversationId: work.channelId,
    messageId: previewClientMsgNo,
    authorId: work.agentId,
    sequence,
    chunks,
  })
  const sendActivity = (body: string, data: Record<string, unknown>) => wukongClient().sendMessage(
    work.channelId,
    channelType,
    work.agentId,
    {
      version: 1,
      kind: 'tool_activity',
      clientMsgNo: `activity-${event.runId}-${event.seq}`,
      body,
      refs: { runId: event.runId, agentId: work.agentId },
      data: { ...data, suppressAgentWake: true },
    },
  )
  if (event.kind === 'knowledge.rag.completed') {
    const claimPath = [knowledgePartIndexStart as number]
    const chunks: AssistantStreamChunk[] = [
      {
        type: 'part-start', path: claimPath,
        part: { type: 'tool-call', toolCallId: `cite-claims:${work.id}`, toolName: 'cite_claims' },
      },
      { type: 'text-delta', path: claimPath, textDelta: '{}' },
      { type: 'tool-call-args-text-finish', path: claimPath },
      { type: 'result', path: claimPath, result: { claims: knowledgeClaims! }, isError: false },
      { type: 'part-finish', path: claimPath },
    ]
    for (const [index, reference] of knowledgeReferences!.entries()) {
      const path = [knowledgePartIndexStart as number + index + 1]
      chunks.push(
        {
          type: 'part-start', path,
          part: {
            type: 'tool-call',
            toolCallId: `read-document:${work.id}:${reference.marker}`,
            toolName: 'read_document',
          },
        },
        { type: 'text-delta', path, textDelta: JSON.stringify({ sourceId: reference.sourceId, marker: reference.marker }) },
        { type: 'tool-call-args-text-finish', path },
        {
          type: 'result', path,
          result: { title: reference.title, pages: reference.pages, anchors: reference.anchors },
          isError: false,
        },
        { type: 'part-finish', path },
      )
    }
    if (chunks.length > 0) await publishPreview(chunks)
  } else if (event.kind === 'run.started' || event.kind === 'model.started') {
    await publishPreview([{ type: 'step-start', path: [], messageId: previewClientMsgNo }])
  } else if (event.kind === 'model.delta') {
    const data = event.data as {
      delta?: unknown
      finishPartIndex?: unknown
      partIndex?: unknown
      partStart?: unknown
      partType?: unknown
    } | null
    const delta = typeof data?.delta === 'string' ? data.delta : ''
    if (!delta) throw new Error('model.delta must contain a non-empty native stream delta')
    const partType = data?.partType
    const partIndexValue = data?.partIndex
    if ((partType !== 'reasoning' && partType !== 'text') || !validPartIndex(partIndexValue)) {
      throw new Error('model.delta must identify a native reasoning or text part')
    }
    const partIndex = partIndexValue as number
    const chunks: AssistantStreamChunk[] = []
    if (data?.finishPartIndex !== undefined && !validPartIndex(data.finishPartIndex)) {
      throw new Error('model.delta contains an invalid native finish part index')
    }
    if (validPartIndex(data?.finishPartIndex)) {
      chunks.push({ type: 'part-finish', path: [data?.finishPartIndex as number] })
    }
    if (data?.partStart === true) chunks.push({ type: 'part-start', path: [partIndex], part: { type: partType } })
    chunks.push({ type: 'text-delta', path: [partIndex], textDelta: delta })
    await publishPreview(chunks)
  } else if (event.kind === 'model.completed') {
    const finishPartIndex = (event.data as { finishPartIndex?: unknown } | null)?.finishPartIndex
    if (finishPartIndex !== undefined && !validPartIndex(finishPartIndex)) {
      throw new Error('model.completed contains an invalid native finish part index')
    }
    if (validPartIndex(finishPartIndex)) {
      await publishPreview([{ type: 'part-finish', path: [finishPartIndex as number] }])
    }
  } else if (event.kind === 'tool.started') {
    const data = event.data as { args?: unknown; name?: unknown; partIndex?: unknown; toolCallId?: unknown } | null
    if (
      typeof data?.toolCallId !== 'string' || !data.toolCallId.startsWith('host:')
      || typeof data.name !== 'string' || !data.name || data.name.length > 160
      || !validPartIndex(data.partIndex)
      || !data.args || typeof data.args !== 'object' || Array.isArray(data.args)
    ) throw new Error('tool.started must identify a bounded native assistant-ui Host Action part')
    const argsText = JSON.stringify(data.args)
    if (argsText.length > 8_000) throw new Error('tool.started arguments exceed the user-visible limit')
    await publishPreview([
      {
        type: 'part-start', path: [data.partIndex as number],
        part: { type: 'tool-call', toolCallId: data.toolCallId, toolName: data.name },
      },
      { type: 'text-delta', path: [data.partIndex as number], textDelta: argsText },
      { type: 'tool-call-args-text-finish', path: [data.partIndex as number] },
    ])
  } else if (event.kind === 'tool.completed') {
    const data = event.data as { isError?: unknown; partIndex?: unknown; result?: unknown; toolCallId?: unknown } | null
    const resultText = JSON.stringify(data?.result)
    if (
      typeof data?.toolCallId !== 'string' || !data.toolCallId.startsWith('host:')
      || !validPartIndex(data.partIndex) || typeof data.isError !== 'boolean' || data.result === undefined
      || !resultText || resultText.length > 8_000
    ) throw new Error('tool.completed must resolve a bounded native assistant-ui Host Action part')
    await publishPreview([
      { type: 'result', path: [data.partIndex as number], result: JSON.parse(resultText), isError: data.isError },
      { type: 'part-finish', path: [data.partIndex as number] },
    ])
  } else if (event.kind === 'run.failed' || event.kind === 'run.cancelled') {
    const error = String((event.data as { error?: unknown } | null)?.error ?? event.kind)
    await publishPreview([{ type: 'error', path: [], error, code: event.kind }])
  } else if (event.kind === 'run.completed' && (event.data as { deferredToCanvasId?: unknown } | null)?.deferredToCanvasId) {
    await publishPreview([{
      type: 'message-finish', path: [], finishReason: 'stop',
      usage: { inputTokens: 0, outputTokens: 0 },
    }])
  } else if (event.kind === 'approval.pending') {
    const approvalData = event.data as { approvalId?: unknown } | null
    const approvalId = String(approvalData?.approvalId ?? '')
    if (!approvalId) throw new Error('approval.pending must identify its approval')
    const { rows: approvals } = await pool.query<{
      id: string; agent_id: string; action: string; args: Record<string, unknown>; summary: string
      status: string; requested_at: string; resolved_at: string | null; resolved_by: string | null
      requested_by:string|null;scope:Record<string,unknown>;preview:Record<string,unknown>
    }>(`SELECT id, agent_id, action, args, summary, status, requested_at, resolved_at, resolved_by,requested_by,scope,preview
          FROM approvals WHERE id=$1 AND company_id=$2 AND source='AGENT_OS'`, [approvalId, work.companyId])
    const approval = approvals[0]
    if (approval) {
      await wukongClient().sendMessage(work.channelId, channelType, work.agentId, {
        version: 1, kind: 'approval', clientMsgNo: `approval-${approval.id}`,
        body: approval.summary, refs: { approvalId: approval.id, runId: event.runId, agentId: work.agentId },
        data: {
          id: approval.id, agentId: approval.agent_id,
          kind: approval.action.startsWith('email.') ? 'external_communication' : String(approval.scope?.risk??'sensitive_or_destructive_action'),
          summary: approval.summary, status: approval.status, payload: { action: approval.action, args: approval.args },
          requestedAt: approval.requested_at, resolvedAt: approval.resolved_at, resolvedBy: approval.resolved_by,
          requestedBy:approval.requested_by,scope:approval.scope,preview:approval.preview,
          suppressAgentWake: true,
        },
      })
    }
    await publishPreview([{
      type: 'message-finish', path: [], finishReason: 'tool-calls',
      usage: { inputTokens: 0, outputTokens: 0 },
    }], event.seq * 2 + 1)
  } else if (event.visibility === 'user') {
    await sendActivity(event.kind, { stage: event.stage })
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
  if (message.kind !== 'text' || message.refs?.runId !== work.id || !message.body?.trim()) {
    res.status(409).json({ error: 'assistant message is missing its native stream identity or body' }); return
  }
  const rawRag = message.data?.rag
  if (rawRag !== undefined && (!rawRag || typeof rawRag !== 'object' || Array.isArray(rawRag))) {
    res.status(409).json({ error: 'assistant message contains an invalid native RAG result' }); return
  }
  const rawRagRecord = rawRag as Record<string, unknown> | undefined
  const messageClaims = rawRagRecord === undefined ? [] : parseKnowledgeConfidenceClaims(rawRagRecord.claims)
  const messageReferences = rawRagRecord === undefined ? [] : parseKnowledgeDocumentReferences(rawRagRecord.documentReferences)
  if (messageClaims === null || messageReferences === null) {
    res.status(409).json({ error: 'assistant message contains an invalid native RAG result' }); return
  }
  const citationPattern = /\[([^\]\n]+)\]\(#cite-(S\d+(?:,S\d+)*)\)/g
  const citationLinks = [...message.body.matchAll(citationPattern)]
  const citedMarkers = new Set(citationLinks.flatMap((match) => match[2]!.split(',')))
  if (
    citedMarkers.size !== messageReferences.length
    || messageReferences.some((reference) => !citedMarkers.has(reference.marker))
    || messageClaims.length !== citationLinks.length
    || messageClaims.some((claim, index) => (
      claim.text !== citationLinks[index]![1]
      || claim.markers.join(',') !== citationLinks[index]![2]
    ))
    || (messageClaims.length > 0
      && message.body.replace(citationPattern, '').split('\n').some((line) => !/^\s*(?:(?:[-+*]|\d+[.)])\s*)?$/.test(line)))
  ) {
    res.status(409).json({ error: 'assistant citations do not match the native RAG result' }); return
  }
  const attemptSequenceStart = Math.max(0, work.fence - 1) * 100_000
  const attemptSequenceEnd = work.fence * 100_000
  const { rows: streamEvents } = await pool.query<{ kind: string; data: Record<string, unknown>; sequence: number }>(
    `SELECT kind,data,sequence FROM agent_events
      WHERE run_id=$1 AND kind IN ('model.started','model.delta','model.completed','knowledge.rag.completed')
        AND sequence>$2 AND sequence<$3
      ORDER BY sequence`,
    [work.id, attemptSequenceStart, attemptSequenceEnd],
  )
  const streamed = streamEvents
    .filter((row) => row.kind === 'model.delta' && row.data.partType === 'text' && typeof row.data.delta === 'string')
    .map((row) => String(row.data.delta))
    .join('')
    .trim()
  const completed = streamEvents.filter((row) => row.kind === 'model.completed')
  if (!streamed || completed.length === 0 || streamed !== message.body.trim()) {
    res.status(409).json({ error: 'assistant final message does not match its native streamed deltas' }); return
  }
  const ragEvents = streamEvents.filter((row) => row.kind === 'knowledge.rag.completed')
  if (
    ragEvents.length !== (messageReferences.length > 0 ? 1 : 0)
    || (messageReferences.length > 0
      && ragEvents[0]?.data.ragHash !== hash(JSON.stringify({ claims: messageClaims, documentReferences: messageReferences })))
  ) {
    res.status(409).json({ error: 'assistant final RAG result does not match its native stream' }); return
  }
  const usage = completed.reduce((total, row) => {
    const value = row.data.usage as { inputTokens?: unknown; outputTokens?: unknown } | undefined
    return {
      inputTokens: total.inputTokens + (typeof value?.inputTokens === 'number' ? value.inputTokens : 0),
      outputTokens: total.outputTokens + (typeof value?.outputTokens === 'number' ? value.outputTokens : 0),
    }
  }, { inputTokens: 0, outputTokens: 0 })
  const sequence = (streamEvents.at(-1)?.sequence ?? 0) * 2 + 1
  await publish(CH_ASSISTANT_STREAM, {
    type: 'assistant.stream', companyId: work.companyId, conversationId: work.channelId,
    messageId: `preview-${work.id}`, authorId: work.agentId, sequence,
    chunks: [
      { type: 'message-finish', path: [], finishReason: 'stop', usage },
    ],
  })
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(`SELECT profile FROM im_channel_bindings WHERE channel_id=$1`, [work.channelId])
  res.json(await wukongClient().sendMessage(work.channelId, Number(rows[0]?.profile?.channelType ?? 2), work.agentId, message))
}))

agentOSControlRouter.post('/work/:id/complete', safe(async (req, res) => {
  const { work } = await requireLease(req)
  const status = String(req.body.status)
  if (!['completed', 'failed', 'cancelled'].includes(status)) { res.status(400).json({ error: 'invalid status' }); return }
  if(status==='completed'&&work.canvasId) await assertCanvasWorkReportReady(work.id,work.companyId)
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
