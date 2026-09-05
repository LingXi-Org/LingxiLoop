import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { AssistantStreamChunk } from 'assistant-stream'
import type {
  ActionExecutor, ActionLedgerStore, CapabilityResolver, ContextProvider, DeliveryPort,
  EnqueueWorkInput, EventStore, LeasedWork, SessionStore, StoredRunEvent, WorkStore,
} from '../../../third_party/lingxios/src/control-plane/stores.js'
import { ControlPlaneError } from '../../../third_party/lingxios/src/control-plane/service.js'
import { RUN_SEQUENCE_SPAN } from '../../../third_party/lingxios/src/protocol/constants.js'
import type {
  AssistantMessage, HostAction, HostActionResult, RunEvent, SessionRecord, WorkCompletion, WorkItem,
} from '../../../third_party/lingxios/src/protocol/types.js'
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
import { buildPromptContext, recordMemoryEvidence } from './memory-service.js'
import { agentOSNodeTimeoutSeconds } from './node-liveness.js'
import { toLingxiOSWork, toProductWork } from './protocol-adapter.js'
import { capabilityGrants } from './runtime.js'
import { KNOWLEDGE_CONTRACT_VERSION, type AgentWorkItem, type LingxiMessageV1, type PromptContextV1 } from './types.js'

function hash(value: string): string { return createHash('sha256').update(value).digest('hex') }

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
  cancel_requested_at?: string | null
}

const WORK_COLUMNS = 'id,fence,company_id,authorization_user_id,agent_id,channel_id,thread_root_client_msg_no,trigger_client_msg_no,reason,lane,canvas_id,canvas_assignment_id,created_at,available_at,attempts,preemptions,execution_role,progress_fingerprint,no_progress_count,cancel_requested_at'

function productWork(row: WorkRow, leaseToken = '', homeEpoch = 1): AgentWorkItem {
  return {
    id: row.id, fence: Number(row.fence), homeEpoch, companyId: row.company_id,
    ...(row.authorization_user_id ? { authorizationUserId: row.authorization_user_id } : {}),
    agentId: row.agent_id, channelId: row.channel_id,
    ...(row.thread_root_client_msg_no ? { threadRootClientMsgNo: row.thread_root_client_msg_no } : {}),
    triggerClientMsgNo: row.trigger_client_msg_no, reason: row.reason, executionRole: row.execution_role,
    lane: row.lane, leaseToken,
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.available_at ? { availableAt: row.available_at } : {}),
    ...(row.attempts === undefined ? {} : { attempts: Number(row.attempts) }),
    ...(row.preemptions === undefined ? {} : { preemptions: Number(row.preemptions) }),
    ...(row.canvas_id ? { canvasId: row.canvas_id } : {}),
    ...(row.canvas_assignment_id ? { canvasAssignmentId: row.canvas_assignment_id } : {}),
    ...(row.progress_fingerprint ? { progressFingerprint: row.progress_fingerprint } : {}),
    noProgressCount: Number(row.no_progress_count ?? 0),
  }
}

function sessionKey(row: WorkRow): string {
  return [row.company_id, row.agent_id, row.channel_id, row.thread_root_client_msg_no ?? '-'].join(':')
}

export class LingxiLoopWorkStore implements WorkStore {
  async enqueue(input: EnqueueWorkInput) {
    const meta = input.meta as Partial<{
      reason: AgentWorkItem['reason']; executionRole: AgentWorkItem['executionRole'];
      canvasId: string; canvasAssignmentId: string
    }> | undefined
    if (!meta?.reason || !input.principalId) throw new ControlPlaneError(400, 'LingxiLoop work requires reason and principalId')
    const id = input.id ?? randomUUID()
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO agent_work_items
         (id,company_id,authorization_user_id,agent_id,channel_id,thread_root_client_msg_no,
          trigger_client_msg_no,reason,priority,available_at,canvas_id,canvas_assignment_id,execution_role)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,NOW()),$11,$12,$13)
       ON CONFLICT(agent_id,trigger_client_msg_no,reason) DO NOTHING RETURNING id`,
      [id, input.tenantId, input.principalId, input.agentId, input.sessionId, input.threadId ?? null,
        input.triggerRef, meta.reason, input.priority ?? 100, input.availableAt ?? null,
        meta.canvasId ?? null, meta.canvasAssignmentId ?? null, meta.executionRole ?? 'coordinator'],
    )
    if (rows[0]) return { id: rows[0].id, deduplicated: false }
    const existing = await pool.query<{ id: string }>(
      `SELECT id FROM agent_work_items WHERE agent_id=$1 AND trigger_client_msg_no=$2 AND reason=$3`,
      [input.agentId, input.triggerRef, meta.reason],
    )
    if (!existing.rows[0]) throw new Error('work enqueue conflict could not be resolved')
    return { id: existing.rows[0].id, deduplicated: true }
  }

  async claim(workerId: string): Promise<WorkItem | null> {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO agent_os_workers(worker_id,last_seen_at,updated_at) VALUES($1,NOW(),NOW())
         ON CONFLICT(worker_id) DO UPDATE SET last_seen_at=NOW(),updated_at=NOW()`, [workerId],
      )
      await client.query(`DELETE FROM agent_os_session_leases WHERE expires_at<=NOW()`)
      const nodeTimeoutSeconds = agentOSNodeTimeoutSeconds()
      const { rows } = await client.query<WorkRow>(
        `SELECT work.${WORK_COLUMNS.replaceAll(',', ',work.')}
           FROM agent_work_items work
           LEFT JOIN agent_os_session_routes route
             ON route.session_key=work.company_id||':'||work.agent_id||':'||work.channel_id||':'||COALESCE(work.thread_root_client_msg_no,'-')
           LEFT JOIN agent_os_workers owner ON owner.worker_id=route.worker_id
          WHERE (work.status='queued' OR (work.status='leased' AND work.lease_expires_at<=NOW()))
            AND work.cancel_requested_at IS NULL AND work.available_at<=NOW()
            AND (route.session_key IS NULL OR route.worker_id=$1 OR owner.last_seen_at<=NOW()-make_interval(secs=>$2::int))
            AND NOT EXISTS(
              SELECT 1 FROM agent_os_session_leases lease
               WHERE lease.session_key=work.company_id||':'||work.agent_id||':'||work.channel_id||':'||COALESCE(work.thread_root_client_msg_no,'-')
                 AND lease.expires_at>NOW())
          ORDER BY CASE work.lane WHEN 'learner' THEN 4 WHEN 'approval' THEN 3 WHEN 'collaboration' THEN 2 ELSE 1 END DESC,
                   work.priority DESC,work.created_at ASC
          FOR UPDATE OF work SKIP LOCKED LIMIT 1`,
        [workerId, nodeTimeoutSeconds],
      )
      const row = rows[0]
      if (!row) { await client.query('COMMIT'); return null }
      const key = sessionKey(row)
      const routes = await client.query<{ home_epoch: string }>(
        `INSERT INTO agent_os_session_routes(session_key,worker_id,home_epoch,updated_at)
         VALUES($1,$2,1,NOW())
         ON CONFLICT(session_key) DO UPDATE SET
           worker_id=EXCLUDED.worker_id,
           home_epoch=CASE WHEN agent_os_session_routes.worker_id=EXCLUDED.worker_id
             THEN agent_os_session_routes.home_epoch ELSE agent_os_session_routes.home_epoch+1 END,
           updated_at=NOW()
         WHERE agent_os_session_routes.worker_id=EXCLUDED.worker_id OR NOT EXISTS(
           SELECT 1 FROM agent_os_workers owner WHERE owner.worker_id=agent_os_session_routes.worker_id
             AND owner.last_seen_at>NOW()-make_interval(secs=>$3::int))
         RETURNING home_epoch`, [key, workerId, nodeTimeoutSeconds],
      )
      if (!routes.rows[0]) { await client.query('COMMIT'); return null }
      const token = randomBytes(32).toString('base64url')
      const nextFence = Number(row.fence) + 1
      const lease = await client.query(
        `INSERT INTO agent_os_session_leases(session_key,work_id,fence,expires_at)
         VALUES($1,$2,$3,NOW()+INTERVAL '45 seconds') ON CONFLICT(session_key) DO NOTHING RETURNING session_key`,
        [key, row.id, nextFence],
      )
      if (!lease.rows[0]) { await client.query('COMMIT'); return null }
      const claimed = await client.query<WorkRow>(
        `UPDATE agent_work_items SET status='leased',fence=fence+1,lease_token_hash=$2,leased_by=$3,
           lease_started_at=NOW(),lease_expires_at=NOW()+INTERVAL '45 seconds',attempts=attempts+1,updated_at=NOW()
         WHERE id=$1 RETURNING ${WORK_COLUMNS}`,
        [row.id, hash(token), workerId],
      )
      await client.query('COMMIT')
      return toLingxiOSWork(productWork(claimed.rows[0]!, token, Number(routes.rows[0].home_epoch)))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally { client.release() }
  }

  async heartbeat(id: string, fence: number, leaseTokenHash: string) {
    const { rows } = await pool.query<{
      cancel_requested_at: string | null; preempt_requested_at: string | null
      steer_inputs: Array<{ id: string; text: string; createdAt: string }>
    }>(
      `WITH renewed AS(
         UPDATE agent_work_items SET lease_expires_at=NOW()+INTERVAL '45 seconds',updated_at=NOW()
          WHERE id=$1 AND fence=$2 AND lease_token_hash=$3 AND status='leased'
          RETURNING cancel_requested_at,preempt_requested_at,steer_inputs,leased_by
       ),session_renewed AS(
         UPDATE agent_os_session_leases SET expires_at=NOW()+INTERVAL '45 seconds',updated_at=NOW()
          WHERE work_id=$1 AND fence=$2 AND EXISTS(SELECT 1 FROM renewed)
       ),worker_seen AS(
         INSERT INTO agent_os_workers(worker_id,last_seen_at,updated_at)
         SELECT leased_by,NOW(),NOW() FROM renewed WHERE leased_by IS NOT NULL
         ON CONFLICT(worker_id) DO UPDATE SET last_seen_at=NOW(),updated_at=NOW()
       ) SELECT cancel_requested_at,preempt_requested_at,steer_inputs FROM renewed`,
      [id, fence, leaseTokenHash],
    )
    const row = rows[0]
    return row ? {
      cancelRequested: Boolean(row.cancel_requested_at), preemptRequested: Boolean(row.preempt_requested_at),
      steer: row.steer_inputs ?? [],
    } : null
  }

  async getLeased(id: string, fence: number, leaseTokenHash: string): Promise<LeasedWork | null> {
    const { rows } = await pool.query<WorkRow>(
      `SELECT ${WORK_COLUMNS} FROM agent_work_items
        WHERE id=$1 AND fence=$2 AND lease_token_hash=$3 AND status='leased' AND lease_expires_at>NOW()`,
      [id, fence, leaseTokenHash],
    )
    if (!rows[0]) return null
    const { leaseToken: _, ...work } = toLingxiOSWork(productWork(rows[0]))
    return { work, status: 'leased', cancelRequested: Boolean(rows[0].cancel_requested_at) }
  }

  async yieldWork(id: string, fence: number, leaseTokenHash: string): Promise<boolean> {
    return withTransaction(pool, async (db) => {
      const { rows } = await db.query(
        `UPDATE agent_work_items SET status='queued',fence=fence+1,lease_token_hash=NULL,leased_by=NULL,
           lease_started_at=NULL,lease_expires_at=NULL,preempt_requested_at=NULL,preempt_grace_expires_at=NULL,
           preemptions=preemptions+1,available_at=NOW()+INTERVAL '1 second',updated_at=NOW()
         WHERE id=$1 AND fence=$2 AND lease_token_hash=$3 AND status='leased' AND preempt_requested_at IS NOT NULL RETURNING id`,
        [id, fence, leaseTokenHash],
      )
      if (!rows[0]) return false
      await db.query(`DELETE FROM agent_os_session_leases WHERE work_id=$1 AND fence=$2`, [id, fence])
      return true
    })
  }

  async complete(id: string, fence: number, leaseTokenHash: string, completion: WorkCompletion): Promise<boolean> {
    const leased = await this.getLeased(id, fence, leaseTokenHash)
    if (!leased) return false
    const work = toProductWork(leased.work)
    if (completion.status === 'completed' && work.canvasId) await assertCanvasWorkReportReady(work.id, work.companyId)
    const completed = await withTransaction(pool, async (db) => {
      const result = await db.query(
        `UPDATE agent_work_items SET status=$2,error=$3,result_text=$5,lease_token_hash=NULL,leased_by=NULL,
           lease_started_at=NULL,lease_expires_at=NULL,updated_at=NOW(),finished_at=NOW()
         WHERE id=$1 AND fence=$4 AND lease_token_hash=$6 AND status='leased' RETURNING id`,
        [id, completion.status, completion.error ?? null, fence, completion.resultText ?? null, leaseTokenHash],
      )
      if (!result.rows[0]) return false
      await db.query(`DELETE FROM agent_os_session_leases WHERE work_id=$1 AND fence=$2`, [id, fence])
      return true
    })
    if (completed && work.canvasId) await completeCanvasWork({
      workId: id, companyId: work.companyId, status: completion.status,
      resultText: completion.resultText, error: completion.error,
    })
    return completed
  }

  async requestCancel(id: string): Promise<boolean> {
    return Boolean((await pool.query(
      `UPDATE agent_work_items SET cancel_requested_at=NOW(),
         status=CASE WHEN status='queued' THEN 'cancelled' ELSE status END,
         finished_at=CASE WHEN status='queued' THEN NOW() ELSE finished_at END,updated_at=NOW()
        WHERE id=$1 AND status IN('queued','leased') RETURNING id`, [id],
    )).rows[0])
  }

  async requestPreempt(id: string): Promise<boolean> {
    return Boolean((await pool.query(
      `UPDATE agent_work_items SET preempt_requested_at=NOW(),preempt_grace_expires_at=NOW()+INTERVAL '15 seconds',updated_at=NOW()
        WHERE id=$1 AND status='leased' RETURNING id`, [id],
    )).rows[0])
  }

  async addSteer(id: string, text: string): Promise<boolean> {
    const steer = { id: randomUUID(), text, createdAt: new Date().toISOString() }
    return Boolean((await pool.query(
      `UPDATE agent_work_items SET steer_inputs=steer_inputs||$2::jsonb,updated_at=NOW()
        WHERE id=$1 AND status='leased' RETURNING id`, [id, JSON.stringify([steer])],
    )).rows[0])
  }
}

export class LingxiLoopSessionStore implements SessionStore {
  async get(key: string): Promise<SessionRecord | null> {
    const { rows } = await pool.query<{
      session_key: string; company_id: string; agent_id: string; channel_id: string
      thread_root_client_msg_no: string | null; summary: string | null; history: SessionRecord['history']
      revision: string | number; compaction_epoch: number; prompt_context: PromptContextV1 | null
      applied_work_ids: string[] | null
    }>(`SELECT * FROM agent_os_sessions WHERE session_key=$1`, [key])
    const row = rows[0]
    return row ? {
      key: row.session_key, tenantId: row.company_id, agentId: row.agent_id, sessionId: row.channel_id,
      ...(row.thread_root_client_msg_no ? { threadId: row.thread_root_client_msg_no } : {}),
      ...(row.summary ? { summary: row.summary } : {}), history: row.history, revision: Number(row.revision),
      compactionEpoch: Number(row.compaction_epoch ?? 0), appliedWorkIds: row.applied_work_ids ?? [],
      ...(row.prompt_context ? { promptContext: row.prompt_context } : {}),
    } : null
  }

  async save(session: SessionRecord) {
    const { rows } = await pool.query<{ revision: string | number }>(
      `INSERT INTO agent_os_sessions
         (session_key,company_id,agent_id,channel_id,thread_root_client_msg_no,summary,history,revision,
          compaction_epoch,prompt_context,applied_work_ids)
       SELECT $1,$2,$3,$4,$5,$6,$7::jsonb,1,$9,$10::jsonb,$11::jsonb
        WHERE $8=0 OR EXISTS(SELECT 1 FROM agent_os_sessions current WHERE current.session_key=$1 AND current.revision=$8)
       ON CONFLICT(session_key) DO UPDATE SET summary=EXCLUDED.summary,history=EXCLUDED.history,
         compaction_epoch=EXCLUDED.compaction_epoch,prompt_context=EXCLUDED.prompt_context,
         applied_work_ids=EXCLUDED.applied_work_ids,revision=agent_os_sessions.revision+1,updated_at=NOW()
       WHERE agent_os_sessions.revision=$8 RETURNING revision`,
      [session.key, session.tenantId, session.agentId, session.sessionId, session.threadId ?? null,
        session.summary ?? null, JSON.stringify(session.history), session.revision, session.compactionEpoch,
        session.promptContext ? JSON.stringify(session.promptContext) : null, JSON.stringify(session.appliedWorkIds)],
    )
    return rows[0] ? { ok: true as const, revision: Number(rows[0].revision) } : { ok: false as const, conflict: true as const }
  }
}

export class LingxiLoopActionExecutor implements ActionExecutor {
  async execute(work: WorkItem, action: HostAction): Promise<HostActionResult> {
    return executeActionWithLedger(toProductWork(work), action)
  }
}

/** executeActionWithLedger is the single atomic action ledger; the generic core ledger is pass-through. */
export const productActionLedger: ActionLedgerStore = {
  find: async () => null,
  record: async (_key, result) => result,
}

export class LingxiLoopCapabilityResolver implements CapabilityResolver {
  async resolve(work: Omit<WorkItem, 'leaseToken'>) {
    const { rows } = await pool.query<{ capabilities: string[] | null }>(
      `SELECT capabilities FROM participants WHERE id=$1 AND company_id=$2 AND kind='agent' AND departed_at IS NULL`,
      [work.agentId, work.tenantId],
    )
    if (!rows[0]) return []
    return capabilityGrants(rows[0].capabilities ?? [], toProductWork(work).executionRole)
  }
}

function contextualKnowledgeQuery(
  messages: Array<{ ref: string; authorKind: 'agent' | 'human'; body: string; replyToRef?: string }>,
  current: { ref: string; body: string; replyToRef?: string },
): string {
  const reply = current.replyToRef ? messages.find((message) => message.ref === current.replyToRef) : undefined
  const priorUsers = messages.filter((message) => message.authorKind === 'human' && message.ref !== current.ref).slice(-2)
  return [
    `current user question: ${current.body}`,
    reply ? `replied-to ${reply.authorKind} message: ${reply.body}` : '',
    ...priorUsers.map((message) => `earlier user message: ${message.body}`),
  ].filter(Boolean).join('\n').slice(0, 2_000)
}

export class LingxiLoopContextProvider implements ContextProvider {
  async loadContext(coreWork: Omit<WorkItem, 'leaseToken'>) {
    const contextStartedAt = Date.now()
    const work = toProductWork(coreWork)
    const [{ rows: personas }, { rows: bindings }] = await Promise.all([
      pool.query<{ name: string; role: string | null; system_prompt: string | null; capabilities: string[] | null; updated_at: string }>(
        `SELECT name,role,system_prompt,capabilities,updated_at FROM participants
          WHERE id=$1 AND company_id=$2 AND kind='agent' AND departed_at IS NULL LIMIT 1`, [work.agentId, work.companyId],
      ),
      pool.query<{ profile: Record<string, unknown> }>(
        `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [work.channelId, work.companyId],
      ),
    ])
    if (!personas[0]) throw new ControlPlaneError(404, 'agent not found')
    if (!work.authorizationUserId?.trim()) throw new ControlPlaneError(403, 'Agent work has no persisted human authorization principal')
    const channelType = Number(bindings[0]?.profile?.channelType ?? 2)
    const history = await wukongClient().syncMessages(work.channelId, channelType, 80, work.agentId)
    const readThroughSeq = history.reduce((max, message) => Math.max(max, message.messageSeq), 0)
    if (readThroughSeq > 0) await advanceAgentReadReceipt({
      companyId: work.companyId, channelId: work.channelId, agentId: work.agentId, readThroughSeq,
    })
    const messages = history.map((message) => ({
      ref: message.clientMsgNo,
      authorId: message.fromUid,
      authorName: String((message.payload.data as Record<string, unknown> | undefined)?.authorName ?? message.fromUid),
      authorKind: (message.payload.refs?.agentId ? 'agent' : 'human') as 'agent' | 'human',
      body: message.payload.body ?? JSON.stringify(message.payload.data ?? {}),
      createdAt: new Date(message.timestamp > 10_000_000_000 ? message.timestamp : message.timestamp * 1_000).toISOString(),
      ...(message.payload.replyToClientMsgNo ? { replyToRef: message.payload.replyToClientMsgNo } : {}),
    }))
    const trigger = messages.find((message) => message.ref === work.triggerClientMsgNo)
    const learner = trigger?.authorKind === 'human' ? trigger : [...messages].reverse().find((message) => message.authorKind === 'human')
    const persona = {
      name: personas[0].name, role: personas[0].role ?? 'Learning Agent', instructions: personas[0].system_prompt ?? '',
    }
    const capabilities = personas[0].capabilities ?? []
    const teacherAgent = capabilities.includes('teacher_admin')
    const { rows: workspaces } = await pool.query<{ kind: string; project_id: string | null; is_learning: boolean }>(
      `SELECT conversation.kind,conversation.project_id,EXISTS(
         SELECT 1 FROM projects project WHERE project.id=conversation.project_id
           AND project.company_id=conversation.company_id AND project.status<>'DELETED') AS is_learning
       FROM conversations conversation WHERE conversation.id=$1 AND conversation.company_id=$2 LIMIT 1`,
      [work.channelId, work.companyId],
    )
    const workspace = workspaces[0]
    const knowledgeAccess = !teacherAgent && workspace?.project_id
      ? await createPermissionService(pool).can({
          actorUserId: work.authorizationUserId, action: 'knowledge:read',
          companyId: work.companyId, projectId: workspace.project_id,
        })
      : null
    const { rows: sourceSummaries } = knowledgeAccess?.allowed && workspace?.project_id
      ? await pool.query<{ source_count: number; ingestion_failure: string | null }>(
          `SELECT
             (SELECT COUNT(*)::int FROM knowledge_sources source
               WHERE source.company_id=$1 AND source.project_id=$2 AND source.status='ready'
                 AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))
                 AND source.deleted_at IS NULL) AS source_count,
             (SELECT COALESCE(job.wake_error,source.error) FROM knowledge_sources source
               LEFT JOIN knowledge_source_jobs job ON job.source_id=source.id
              WHERE source.company_id=$1 AND source.project_id=$2 AND source.origin_client_msg_no=$3
                AND (source.visibility_scope='PROJECT' OR (source.visibility_scope='PRIVATE' AND source.owner_user_id=$4))
                AND source.deleted_at IS NULL ORDER BY source.created_at DESC LIMIT 1) AS ingestion_failure`,
          [work.companyId, workspace.project_id, work.triggerClientMsgNo, work.authorizationUserId],
        )
      : { rows: [] }
    const teacherContext = teacherAgent ? await loadTeacherTurnContext(work) : undefined
    if (teacherAgent && !teacherContext) throw new ControlPlaneError(403, 'Pulse is not authorized for this teacher room')
    const knowledgeContext = knowledgeAccess?.allowed
      && (workspace?.kind === 'group' || workspace?.kind === 'direct') && learner
      ? await retrieveKnowledge({
          companyId: work.companyId, conversationId: work.channelId,
          authorizationUserId: work.authorizationUserId,
          query: trigger?.body ?? learner.body,
          contextQuery: contextualKnowledgeQuery(messages, trigger ?? learner),
        })
      : []
    const promptContextCandidate = learner || teacherContext ? await buildPromptContext({
      epoch: 0, companyId: work.companyId, agentId: work.agentId, conversationId: work.channelId,
      learnerId: learner?.authorId ?? teacherContext?.trigger.teacherId ?? 'teacher-room',
      query: trigger?.body ?? learner?.body ?? 'Generate the scheduled teacher aggregate digest.',
      persona, capabilities, executionRole: work.executionRole,
      sourceVersions: {
        persona: personas[0].updated_at, capabilities: personas[0].updated_at,
        knowledgeContract: KNOWLEDGE_CONTRACT_VERSION,
      },
      skipMemories: teacherAgent,
    }) : undefined
    const learningContext = !teacherAgent && workspace?.is_learning
      ? await loadLearningTurnContext(work, learner?.authorId)
      : undefined
    const approvalId = work.reason === 'resume' && work.triggerClientMsgNo.startsWith('approval:')
      ? work.triggerClientMsgNo.slice('approval:'.length)
      : null
    const approvals = approvalId ? await pool.query<{ id: string; status: string; result: unknown; error: string | null }>(
      `SELECT id,status,result,error FROM approvals WHERE id=$1 AND agent_id=$2 AND channel_id=$3
        AND source='AGENT_OS' AND status IN('EXECUTED','REJECTED') LIMIT 1`,
      [approvalId, work.agentId, work.channelId],
    ) : { rows: [] }
    const canvas = !teacherAgent && work.canvasId ? await getCanvasSnapshot(work.companyId, work.agentId, work.canvasId) : null
    const canvasRoster = teacherAgent ? [] : await listCanvasAvailableAgents(work.companyId)
    return {
      persona,
      capabilities,
      messages,
      ...(promptContextCandidate ? { promptContextCandidate } : {}),
      ...(approvals.rows[0] ? { pendingApproval: {
        approvalId: approvals.rows[0].id,
        approved: approvals.rows[0].status === 'EXECUTED',
        result: approvals.rows[0].result,
        ...(approvals.rows[0].error ? { error: approvals.rows[0].error } : {}),
      } } : {}),
      dynamic: { product: {
        knowledgeContext,
        knowledgeSourceCount: teacherAgent ? 0 : sourceSummaries[0]?.source_count ?? 0,
        ...(!teacherAgent && sourceSummaries[0]?.ingestion_failure ? { knowledgeIngestionFailure: sourceSummaries[0].ingestion_failure } : {}),
        ...(!teacherAgent && learner ? { learnerId: learner.authorId } : {}),
        ...(learningContext ? { learningContext } : {}),
        ...(teacherContext ? { teacherContext } : {}),
        canvasRoster,
        contextDurationMs: Math.max(0, Date.now() - contextStartedAt),
        ...(canvas ? { canvas: {
          id: canvas.id, title: canvas.title, goal: canvas.goal, status: canvas.status,
          initiatorAgentId: canvas.initiatorAgentId,
          assignment: canvas.assignments.find((item) => item.agentId === work.agentId),
          assignments: canvas.assignments, reports: canvas.reports, frames: canvas.frames, activity: canvas.activity.slice(0, 50),
        } } : {}),
      } },
    }
  }
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
      typeof claim.id !== 'string' || !claim.id.trim() || ids.has(claim.id)
      || typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > 4_000
      || claim.confidence !== 'grounded'
      || typeof claim.basis !== 'string' || !claim.basis.trim() || claim.basis.length > 1_000
      || !Array.isArray(claim.markers) || claim.markers.length === 0
      || claim.markers.some((marker) => typeof marker !== 'string' || !/^S\d+$/.test(marker))
      || new Set(claim.markers).size !== claim.markers.length
    ) return null
    ids.add(claim.id)
    claims.push({
      id: claim.id, text: claim.text, confidence: 'grounded', basis: claim.basis, markers: claim.markers as string[],
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
      typeof reference.marker !== 'string' || !/^S\d+$/.test(reference.marker) || markers.has(reference.marker)
      || typeof reference.sourceId !== 'string' || !reference.sourceId.trim() || sourceIds.has(reference.sourceId)
      || typeof reference.title !== 'string' || !reference.title.trim() || reference.title.length > 500
      || typeof reference.pages !== 'number' || !Number.isSafeInteger(reference.pages) || reference.pages < 1
      || !Array.isArray(reference.anchors) || reference.anchors.length === 0 || reference.anchors.length > 24
    ) return null
    const pages = reference.pages
    const anchors = reference.anchors.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const anchor = item as Record<string, unknown>
      return typeof anchor.page === 'number' && Number.isSafeInteger(anchor.page) && anchor.page >= 1 && anchor.page <= pages
        && typeof anchor.quote === 'string' && anchor.quote.trim() && anchor.quote.length <= 2_000
        ? [{ page: anchor.page, quote: anchor.quote }]
        : []
    })
    if (anchors.length !== reference.anchors.length) return null
    markers.add(reference.marker)
    sourceIds.add(reference.sourceId)
    references.push({ marker: reference.marker, sourceId: reference.sourceId, title: reference.title, pages, anchors })
  }
  return references
}

function validPartIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function eventStage(kind: string): RunEvent['stage'] {
  if (kind === 'model.delta') return 'delta'
  if (kind.endsWith('.started')) return 'started'
  if (kind.endsWith('.failed') || kind === 'response.withheld') return 'failed'
  if (kind.endsWith('.cancelled') || kind === 'run.preempted') return 'cancelled'
  return 'completed'
}

export class LingxiLoopEventStore implements EventStore {
  async append(event: StoredRunEvent): Promise<boolean> {
    const knowledgeClaims = event.kind === 'knowledge.rag.completed'
      ? parseKnowledgeConfidenceClaims(event.data.previewClaims)
      : undefined
    const knowledgeReferences = event.kind === 'knowledge.rag.completed'
      ? parseKnowledgeDocumentReferences(event.data.previewReferences)
      : undefined
    if (event.kind === 'knowledge.rag.completed' && (
      knowledgeClaims === null || knowledgeReferences === null || !validPartIndex(event.data.partIndexStart)
    )) throw new ControlPlaneError(400, 'invalid native RAG result')
    const ledgerData = { ...event.data }
    if (event.kind === 'knowledge.rag.completed') {
      delete ledgerData.previewClaims
      delete ledgerData.previewReferences
      ledgerData.ragHash = hash(JSON.stringify({ claims: knowledgeClaims, documentReferences: knowledgeReferences }))
    }
    const inserted = await withTransaction(pool, async (db) => {
      const { rows: workRows } = await db.query<{ reason: string; trigger_client_msg_no: string; channel_id: string }>(
        `SELECT reason,trigger_client_msg_no,channel_id FROM agent_work_items WHERE id=$1`, [event.runId],
      )
      const work = workRows[0]
      if (!work) throw new ControlPlaneError(409, 'event work item no longer exists')
      await db.query(
        `INSERT INTO agent_runs(id,agent_id,company_id,trigger,status,stage,reasoning_runtime)
         VALUES($1,$2,$3,$4::jsonb,'running',$5,'lingxios-v2') ON CONFLICT(id) DO NOTHING`,
        [event.runId, event.agentId, event.tenantId,
          JSON.stringify({ reason: work.reason, clientMsgNo: work.trigger_client_msg_no }), event.kind],
      )
      const saved = await db.query<{ id: string }>(
        `INSERT INTO agent_events(id,run_id,agent_id,company_id,kind,level,title,data,sequence)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)
         ON CONFLICT(run_id,sequence) WHERE sequence IS NOT NULL DO NOTHING RETURNING id`,
        [randomUUID(), event.runId, event.agentId, event.tenantId, event.kind,
          event.stage === 'failed' ? 'error' : 'info', event.kind, JSON.stringify(ledgerData), event.seq],
      )
      if (!saved.rows[0]) return false
      if (event.kind === 'model.completed' || event.kind === 'model.failed') {
        const usage = event.data.usage as { inputTokens?: unknown; outputTokens?: unknown; available?: unknown } | undefined
        const latencyMs = typeof event.data.latencyMs === 'number' && Number.isFinite(event.data.latencyMs)
          ? event.data.latencyMs
          : 0
        await recordLlmCall({
          context: {
            source: 'agent-os', companyId: event.tenantId, agentId: event.agentId,
            runId: event.runId, conversationId: work.channel_id,
            purpose: typeof event.data.purpose === 'string' ? event.data.purpose : 'agent-os-turn',
          },
          model: typeof event.data.model === 'string' ? event.data.model : 'unknown',
          usage: {
            prompt_tokens: typeof usage?.inputTokens === 'number' ? usage.inputTokens : 0,
            completion_tokens: typeof usage?.outputTokens === 'number' ? usage.outputTokens : 0,
          },
          measured: event.kind === 'model.completed' && usage?.available !== false,
          latencyMs,
          status: event.kind === 'model.completed' ? 'succeeded' : 'failed',
          error: event.kind === 'model.failed' ? event.data.error : undefined,
        }, db, `llm-event-${event.runId}-${event.seq}`)
      }
      return true
    })
    if (inserted) await pool.query(`UPDATE agent_runs SET stage=$2,updated_at=NOW() WHERE id=$1`, [event.runId, event.kind])
    return inserted
  }

  async listRange(runId: string, fromSeqExclusive: number, toSeqInclusive: number, kinds?: readonly string[]) {
    const { rows } = await pool.query<{
      run_id: string; sequence: number; kind: string; data: Record<string, unknown>
      company_id: string; agent_id: string; created_at: string
    }>(
      `SELECT run_id,sequence,kind,data,company_id,agent_id,created_at FROM agent_events
        WHERE run_id=$1 AND sequence>$2 AND sequence<=$3
          AND ($4::text[] IS NULL OR kind=ANY($4::text[])) ORDER BY sequence`,
      [runId, fromSeqExclusive, toSeqInclusive, kinds ? [...kinds] : null],
    )
    return rows.map((row) => ({
      runId: row.run_id, seq: Number(row.sequence), kind: row.kind, stage: eventStage(row.kind),
      visibility: (row.kind === 'model.delta' || row.kind.startsWith('tool.') ? 'user' : 'internal') as 'user' | 'internal',
      data: row.data, tenantId: row.company_id, agentId: row.agent_id, recordedAt: row.created_at,
    }))
  }
}

async function channelType(work: AgentWorkItem): Promise<number> {
  const { rows } = await pool.query<{ profile: Record<string, unknown> }>(
    `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [work.channelId, work.companyId],
  )
  return Number(rows[0]?.profile?.channelType ?? 2)
}

export class LingxiLoopDelivery implements DeliveryPort {
  async onEvent(coreWork: Omit<WorkItem, 'leaseToken'>, event: RunEvent): Promise<void> {
    const work = toProductWork(coreWork)
    if (work.reason === 'canvas_worker' && work.canvasId) {
      if (event.kind === 'run.started') {
        const { rows } = await pool.query<{ id: string }>(
          `UPDATE canvas_agent_assignments SET status='working',started_at=COALESCE(started_at,NOW()),updated_at=NOW()
            WHERE id=$1 AND status NOT IN('completed','failed','cancelled') RETURNING id`, [work.canvasAssignmentId],
        )
        if (rows[0]) await setCanvasStatus({
          companyId: work.companyId, canvasId: work.canvasId, actorId: work.agentId, actorKind: 'agent', status: 'working',
        })
      }
      return
    }
    if (work.reason === 'memory_synthesis') return
    const type = await channelType(work)
    const previewClientMsgNo = `preview-${event.runId}`
    const publishPreview = (chunks: AssistantStreamChunk[], sequence = event.seq * 2) => publish(CH_ASSISTANT_STREAM, {
      type: 'assistant.stream' as const, companyId: work.companyId, conversationId: work.channelId,
      messageId: previewClientMsgNo, authorId: work.agentId, sequence, chunks,
    })
    const sendActivity = (body: string, data: Record<string, unknown>) => wukongClient().sendMessage(
      work.channelId, type, work.agentId,
      {
        version: 1, kind: 'tool_activity', clientMsgNo: `activity-${event.runId}-${event.seq}`, body,
        refs: { runId: event.runId, agentId: work.agentId }, data: { ...data, suppressAgentWake: true },
      },
    )
    if (event.kind === 'knowledge.rag.completed') {
      const claims = parseKnowledgeConfidenceClaims(event.data.previewClaims)
      const references = parseKnowledgeDocumentReferences(event.data.previewReferences)
      const partIndexStart = event.data.partIndexStart
      if (!claims || !references || !validPartIndex(partIndexStart)) throw new Error('invalid native RAG result')
      const chunks: AssistantStreamChunk[] = [{
        type: 'part-start', path: [partIndexStart],
        part: { type: 'tool-call', toolCallId: `cite-claims:${work.id}`, toolName: 'cite_claims' },
      }, { type: 'text-delta', path: [partIndexStart], textDelta: '{}' },
      { type: 'tool-call-args-text-finish', path: [partIndexStart] },
      { type: 'result', path: [partIndexStart], result: { claims }, isError: false },
      { type: 'part-finish', path: [partIndexStart] }]
      for (const [index, reference] of references.entries()) {
        const path = [partIndexStart + index + 1]
        chunks.push(
          { type: 'part-start', path, part: { type: 'tool-call', toolCallId: `read-document:${work.id}:${reference.marker}`, toolName: 'read_document' } },
          { type: 'text-delta', path, textDelta: JSON.stringify({ sourceId: reference.sourceId, marker: reference.marker }) },
          { type: 'tool-call-args-text-finish', path },
          { type: 'result', path, result: { title: reference.title, pages: reference.pages, anchors: reference.anchors }, isError: false },
          { type: 'part-finish', path },
        )
      }
      await publishPreview(chunks)
    } else if (event.kind === 'run.started' || event.kind === 'model.started') {
      await publishPreview([{ type: 'step-start', path: [], messageId: previewClientMsgNo }])
    } else if (event.kind === 'model.delta') {
      const delta = typeof event.data.delta === 'string' ? event.data.delta : ''
      const partIndex = event.data.partIndex
      const partType = event.data.partType
      if (!delta || !validPartIndex(partIndex) || (partType !== 'reasoning' && partType !== 'text')) {
        throw new Error('model.delta must identify a non-empty assistant-ui part')
      }
      const chunks: AssistantStreamChunk[] = []
      if (event.data.partStart === true) chunks.push({ type: 'part-start', path: [partIndex], part: { type: partType } })
      chunks.push({ type: 'text-delta', path: [partIndex], textDelta: delta })
      await publishPreview(chunks)
    } else if (event.kind === 'model.completed') {
      const finishPartIndex = event.data.finishPartIndex
      if (finishPartIndex !== undefined && !validPartIndex(finishPartIndex)) throw new Error('invalid assistant-ui finish part index')
      if (validPartIndex(finishPartIndex)) await publishPreview([{ type: 'part-finish', path: [finishPartIndex] }])
    } else if (event.kind === 'tool.started') {
      const { toolCallId, partIndex, name, args } = event.data
      if (typeof toolCallId !== 'string' || !toolCallId.startsWith('host:') || !validPartIndex(partIndex)
        || typeof name !== 'string' || !name || !args || typeof args !== 'object' || Array.isArray(args)) {
        throw new Error('tool.started must identify a bounded Host Action part')
      }
      const argsText = JSON.stringify(args)
      if (argsText.length > 8_000) throw new Error('tool.started arguments exceed the user-visible limit')
      await publishPreview([
        { type: 'part-start', path: [partIndex], part: { type: 'tool-call', toolCallId, toolName: name } },
        { type: 'text-delta', path: [partIndex], textDelta: argsText },
        { type: 'tool-call-args-text-finish', path: [partIndex] },
      ])
    } else if (event.kind === 'tool.completed') {
      const { toolCallId, partIndex, result, isError } = event.data
      const resultText = JSON.stringify(result)
      if (typeof toolCallId !== 'string' || !toolCallId.startsWith('host:') || !validPartIndex(partIndex)
        || typeof isError !== 'boolean' || result === undefined || !resultText || resultText.length > 8_000) {
        throw new Error('tool.completed must resolve a bounded Host Action part')
      }
      await publishPreview([
        { type: 'result', path: [partIndex], result: JSON.parse(resultText), isError },
        { type: 'part-finish', path: [partIndex] },
      ])
    } else if (event.kind === 'run.failed' || event.kind === 'run.cancelled') {
      await publishPreview([{
        type: 'error', path: [], error: String(event.data.error ?? event.kind), code: event.kind,
      }])
    } else if (event.kind === 'run.completed' && event.data.deferred === true) {
      await publishPreview([{ type: 'message-finish', path: [], finishReason: 'stop', usage: { inputTokens: 0, outputTokens: 0 } }])
    } else if (event.kind === 'approval.pending') {
      const approvalId = String(event.data.approvalId ?? '')
      if (!approvalId) throw new Error('approval.pending must identify its approval')
      const { rows } = await pool.query<{
        id: string; agent_id: string; action: string; args: Record<string, unknown>; summary: string
        status: string; requested_at: string; resolved_at: string | null; resolved_by: string | null
        requested_by: string | null; scope: Record<string, unknown>; preview: Record<string, unknown>
      }>(`SELECT id,agent_id,action,args,summary,status,requested_at,resolved_at,resolved_by,requested_by,scope,preview
            FROM approvals WHERE id=$1 AND company_id=$2 AND source='AGENT_OS'`, [approvalId, work.companyId])
      const approval = rows[0]
      if (approval) await wukongClient().sendMessage(work.channelId, type, work.agentId, {
        version: 1, kind: 'approval', clientMsgNo: `approval-${approval.id}`, body: approval.summary,
        refs: { approvalId: approval.id, runId: event.runId, agentId: work.agentId },
        data: {
          id: approval.id, agentId: approval.agent_id,
          kind: approval.action.startsWith('email.') ? 'external_communication' : String(approval.scope?.risk ?? 'sensitive_or_destructive_action'),
          summary: approval.summary, status: approval.status, payload: { action: approval.action, args: approval.args },
          requestedAt: approval.requested_at, resolvedAt: approval.resolved_at, resolvedBy: approval.resolved_by,
          requestedBy: approval.requested_by, scope: approval.scope, preview: approval.preview, suppressAgentWake: true,
        },
      })
      await publishPreview([{ type: 'message-finish', path: [], finishReason: 'tool-calls', usage: { inputTokens: 0, outputTokens: 0 } }], event.seq * 2 + 1)
    } else if (event.visibility === 'user') {
      await sendActivity(event.kind, { stage: event.stage })
    }
  }

  async deliverMessage(coreWork: Omit<WorkItem, 'leaseToken'>, message: AssistantMessage): Promise<void> {
    const work = toProductWork(coreWork)
    if (work.reason === 'canvas_worker') return
    if (work.reason === 'canvas_summary' && work.canvasId) {
      const { rows } = await pool.query<{ status: string }>(
        `SELECT status FROM canvases WHERE id=$1 AND company_id=$2`, [work.canvasId, work.companyId],
      )
      if (rows[0]?.status !== 'summarizing') return
    }
    const rawRag = message.data?.rag
    if (rawRag !== undefined && (!rawRag || typeof rawRag !== 'object' || Array.isArray(rawRag))) {
      throw new ControlPlaneError(409, 'assistant message contains an invalid native RAG result')
    }
    const rag = rawRag as Record<string, unknown> | undefined
    const claims = rag === undefined ? [] : parseKnowledgeConfidenceClaims(rag.claims)
    const references = rag === undefined ? [] : parseKnowledgeDocumentReferences(rag.documentReferences)
    if (claims === null || references === null) throw new ControlPlaneError(409, 'assistant message contains an invalid native RAG result')
    const citationPattern = /\[([^\]\n]+)\]\(#cite-(S\d+(?:,S\d+)*)\)/g
    const links = [...message.body.matchAll(citationPattern)]
    const markers = new Set(links.flatMap((match) => match[2]!.split(',')))
    if (
      markers.size !== references.length || references.some((reference) => !markers.has(reference.marker))
      || claims.length !== links.length
      || claims.some((claim, index) => claim.text !== links[index]![1] || claim.markers.join(',') !== links[index]![2])
      || (claims.length > 0 && message.body.replace(citationPattern, '').split('\n').some((line) => !/^\s*(?:(?:[-+*]|\d+[.)])\s*)?$/.test(line)))
    ) throw new ControlPlaneError(409, 'assistant citations do not match the native RAG result')
    const rangeStart = Math.max(0, work.fence - 1) * RUN_SEQUENCE_SPAN
    const rangeEnd = work.fence * RUN_SEQUENCE_SPAN
    const events = await new LingxiLoopEventStore().listRange(
      work.id, rangeStart, rangeEnd, ['model.started', 'model.delta', 'model.completed', 'knowledge.rag.completed'],
    )
    const ragEvents = events.filter((event) => event.kind === 'knowledge.rag.completed')
    if (
      ragEvents.length !== (references.length > 0 ? 1 : 0)
      || (references.length > 0 && ragEvents[0]?.data.ragHash !== hash(JSON.stringify({ claims, documentReferences: references })))
    ) throw new ControlPlaneError(409, 'assistant final RAG result does not match its native stream')
    const completed = events.filter((event) => event.kind === 'model.completed')
    const usage = completed.reduce((total, event) => {
      const value = event.data.usage as { inputTokens?: unknown; outputTokens?: unknown } | undefined
      return {
        inputTokens: total.inputTokens + (typeof value?.inputTokens === 'number' ? value.inputTokens : 0),
        outputTokens: total.outputTokens + (typeof value?.outputTokens === 'number' ? value.outputTokens : 0),
      }
    }, { inputTokens: 0, outputTokens: 0 })
    const sequence = (events.at(-1)?.seq ?? 0) * 2 + 1
    await publish(CH_ASSISTANT_STREAM, {
      type: 'assistant.stream', companyId: work.companyId, conversationId: work.channelId,
      messageId: `preview-${work.id}`, authorId: work.agentId, sequence,
      chunks: [{ type: 'message-finish', path: [], finishReason: 'stop', usage }],
    })
    const payload: LingxiMessageV1 = {
      version: 1, kind: 'text', clientMsgNo: `agent-${work.id}`, body: message.body,
      ...(work.threadRootClientMsgNo ? { replyToClientMsgNo: work.threadRootClientMsgNo } : {}),
      refs: {
        runId: work.id, agentId: work.agentId,
        ...(references.length ? { sourceIds: references.map((reference) => reference.sourceId) } : {}),
      },
      ...(message.data ? { data: message.data } : {}),
    }
    const type = await channelType(work)
    await wukongClient().sendMessage(work.channelId, type, work.agentId, payload)
    if (work.reason === 'message' || work.reason === 'mention') {
      const history = await wukongClient().syncMessages(work.channelId, type, 80, work.agentId)
      const trigger = history.find((item) => item.clientMsgNo === work.triggerClientMsgNo)
      if (trigger && !trigger.payload.refs?.agentId) await recordMemoryEvidence({
        work, learnerId: trigger.fromUid,
        userText: trigger.payload.body ?? JSON.stringify(trigger.payload.data ?? {}), assistantText: message.body,
      }).catch((error: unknown) => console.error('[agent-os] post-commit memory capture failed', error))
    }
  }
}
