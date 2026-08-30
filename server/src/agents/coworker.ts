import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { sendSystemChannelMessage } from '../im/public.js'

export type HandoffStatus = 'pending' | 'accepted' | 'working' | 'completed' | 'blocked'
export type ApprovalKind = 'external_communication' | 'sensitive_or_destructive_action' | 'financial_or_irreversible_action'
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXECUTED'

export interface HandoffSnapshot {
  id: string
  fromAgentId: string
  toAgentId: string
  title: string
  status: HandoffStatus
  note?: string | null
  sharedPaths: string[]
  browserTargets: string[]
}

export interface ApprovalSnapshot {
  id: string
  agentId: string
  kind: ApprovalKind
  summary: string
  status: ApprovalStatus
  payload: Record<string, unknown>
  requestedAt: string
  resolvedAt?: string | null
  resolvedBy?: string | null
  runId?: string | null
  conversationId?: string
  actionKey?: string | null
}

export interface AutonomyRuleSnapshot {
  id: string
  agentId: string
  scope: string
  operation: string
  mode: 'allow' | 'ask' | 'deny'
  source: 'explicit_user' | 'learned'
  createdAt: string
  updatedAt: string
}

export interface ApprovedContinuation {
  approvalId: string
  companyId: string
  agentId: string
  conversationId: string
  runId: string
  actionKey: string
  payload: Record<string, unknown>
  blockedAction: Record<string, unknown>
  remainingActions: Record<string, unknown>[]
  inputScopeKey: string
  actionIndex: number
}

function payloadHash(payload: Record<string, unknown>): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]))
    }
    return value
  }
  return createHash('sha256').update(JSON.stringify(stable(payload))).digest('hex')
}

async function conversationGate(conversationId: string, companyId: string, requiredMembers: string[]): Promise<void> {
  const { rows } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id = $1 AND company_id = $2 LIMIT 1`, [conversationId, companyId],
  )
  if (!rows[0]) throw new Error('conversation not found')
  for (const member of requiredMembers) {
    if (!rows[0].members.includes(member)) throw new Error(`${member} is not a member of this conversation`)
  }
}

async function postStructuredMessage(args: {
  clientNonce: string
  conversationId: string
  companyId: string
  authorId: string
  kind: 'handoff' | 'approval' | 'system'
  body: string
  mentionedIds?: string[]
  handoff?: HandoffSnapshot
  approval?: ApprovalSnapshot
  activation?: 'deliver' | 'trigger'
  handoffWakeTargetId?: string
  suppressAgentWake?: boolean
}): Promise<{ id: string; sequence: number }> {
  let refs: Record<string, string | string[]> | undefined
  if (args.handoff) refs = {
    handoffId: args.handoff.id,
    ...(args.handoffWakeTargetId ? { toAgentId: args.handoffWakeTargetId } : {}),
  }
  else if (args.approval) refs = { approvalId: args.approval.id }
  const data = {
    ...(args.handoff ?? args.approval ?? {}),
    mentionedIds: args.mentionedIds ?? [],
    mentionAll: false,
    ...(args.activation ? { activation: args.activation } : {}),
    ...(args.suppressAgentWake ? { suppressAgentWake: true } : {}),
  }
  const result = await sendSystemChannelMessage({
    companyId: args.companyId,
    actorId: args.authorId,
    channelId: args.conversationId,
    clientNonce: args.clientNonce,
    payload: {
      version: 1,
      kind: args.kind,
      clientMsgNo: args.clientNonce,
      body: args.body,
      refs,
      data,
    },
  })
  if (result.kind !== 'accepted') throw new Error(`structured IM publication failed: ${result.kind}`)
  return { id: result.messageId, sequence: result.sequence }
}

export async function createHandoff(args: {
  companyId: string
  conversationId: string
  fromAgentId: string
  toAgentId: string
  title: string
  contextMessageIds?: string[]
  sharedPaths?: string[]
  browserTargets?: string[]
  note?: string | null
  /** Trusted structured-action key. A retry returns and republishes the same
   * message id; scheduler/message-cursor dedup prevents a second execution. */
  idempotencyKey?: string | null
}): Promise<HandoffSnapshot & { sourceMessageId: string }> {
  await conversationGate(args.conversationId, args.companyId, [args.fromAgentId, args.toAgentId])
  const id = `handoff-${randomUUID()}`
  const snapshot: HandoffSnapshot = {
    id,
    fromAgentId: args.fromAgentId,
    toAgentId: args.toAgentId,
    title: args.title.trim(),
    status: 'working',
    note: args.note?.trim() || null,
    sharedPaths: args.sharedPaths ?? [],
    browserTargets: args.browserTargets ?? [],
  }
  if (!snapshot.title) throw new Error('handoff title is required')
  const client = await pool.connect()
  let resolvedSnapshot = snapshot
  let resolvedConversationId = args.conversationId
  try {
    await client.query('BEGIN')
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO agent_handoffs (
         id, company_id, conversation_id, from_agent_id, to_agent_id, title,
         context_message_ids, shared_paths, browser_targets, note, status, idempotency_key
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,'working',$11)
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id`,
      [id, args.companyId, args.conversationId, args.fromAgentId, args.toAgentId, snapshot.title,
        JSON.stringify(args.contextMessageIds ?? []), JSON.stringify(snapshot.sharedPaths),
        JSON.stringify(snapshot.browserTargets), snapshot.note, args.idempotencyKey?.trim() || null],
    )

    if (inserted.rows.length === 0) {
      const { rows } = await client.query<{
        id: string; conversation_id: string; from_agent_id: string; to_agent_id: string; title: string; status: HandoffStatus;
        note: string | null; shared_paths: string[]; browser_targets: string[]; source_message_id: string | null
      }>(
        `SELECT h.id, h.conversation_id, h.from_agent_id, h.to_agent_id, h.title, h.status, h.note,
                shared_paths, browser_targets, source_message_id
           FROM agent_handoffs h
          WHERE h.idempotency_key = $1 AND h.company_id = $2 AND h.from_agent_id = $3
          LIMIT 1`,
        [args.idempotencyKey?.trim() || null, args.companyId, args.fromAgentId],
      )
      const existing = rows[0]
      if (!existing) throw new Error('handoff idempotency conflict did not resolve')
      if (existing.conversation_id !== args.conversationId
        || existing.to_agent_id !== args.toAgentId
        || existing.title !== snapshot.title) {
        throw new Error('handoff idempotency key was reused with different input')
      }
      resolvedSnapshot = {
        id: existing.id,
        fromAgentId: existing.from_agent_id,
        toAgentId: existing.to_agent_id,
        title: existing.title,
        status: existing.status,
        note: existing.note,
        sharedPaths: existing.shared_paths ?? [],
        browserTargets: existing.browser_targets ?? [],
      }
      resolvedConversationId = existing.conversation_id
      await client.query('COMMIT')
    } else {
      await client.query('COMMIT')
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }

  const message = await postStructuredMessage({
    clientNonce: `handoff:${resolvedSnapshot.id}:created`,
    conversationId: resolvedConversationId,
    companyId: args.companyId,
    authorId: args.fromAgentId,
    kind: 'handoff',
    body: `Handoff to @${resolvedSnapshot.toAgentId}: ${resolvedSnapshot.title}`,
    mentionedIds: [resolvedSnapshot.toAgentId],
    handoff: resolvedSnapshot,
    handoffWakeTargetId: resolvedSnapshot.toAgentId,
    activation: 'trigger',
  })
  await pool.query(
    `UPDATE agent_handoffs SET source_message_id=$2 WHERE id=$1 AND company_id=$3`,
    [resolvedSnapshot.id, message.id, args.companyId],
  )
  return { ...resolvedSnapshot, sourceMessageId: message.id }
}

export async function updateHandoff(args: {
  companyId: string
  handoffId: string
  actorAgentId: string
  status: Extract<HandoffStatus, 'accepted' | 'working' | 'completed' | 'blocked'>
  note?: string | null
}): Promise<HandoffSnapshot & { resultMessageId: string | null; conversationId: string }> {
  const client = await pool.connect()
  let snapshot!: HandoffSnapshot
  let conversationId = ''
  try {
    await client.query('BEGIN')
    const { rows } = await client.query<{
      conversation_id: string; from_agent_id: string; to_agent_id: string; title: string;
      shared_paths: string[]; browser_targets: string[]; note: string | null; status: HandoffStatus;
      result_message_id: string | null
    }>(
      `SELECT h.conversation_id, h.from_agent_id, h.to_agent_id, h.title,
              h.shared_paths, h.browser_targets, h.note, h.status,
              h.result_message_id
         FROM agent_handoffs h
        WHERE h.id = $1 AND h.company_id = $2
        FOR UPDATE OF h`, [args.handoffId, args.companyId],
    )
    const row = rows[0]
    if (!row) throw new Error('handoff not found')
    if (args.actorAgentId !== row.to_agent_id) throw new Error('only the target agent owns this handoff after creation')
    conversationId = row.conversation_id
    if (row.result_message_id && row.status !== args.status) {
      throw new Error(`handoff is already terminal (${row.status})`)
    }
    snapshot = {
      id: args.handoffId, fromAgentId: row.from_agent_id, toAgentId: row.to_agent_id,
      title: row.title, status: row.result_message_id ? row.status : args.status,
      note: row.result_message_id ? row.note : args.note?.trim() || row.note,
      sharedPaths: row.shared_paths ?? [], browserTargets: row.browser_targets ?? [],
    }
    if (!row.result_message_id) {
      await client.query(
        `UPDATE agent_handoffs SET status = $3, note = $4, updated_at = NOW()
          WHERE id = $1 AND company_id = $2`,
        [args.handoffId, args.companyId, args.status, snapshot.note],
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  const body = `${snapshot.status === 'completed' ? 'Completed' : snapshot.status === 'blocked' ? 'Blocked' : 'Updated'} handoff: ${snapshot.title}${snapshot.note ? ` — ${snapshot.note}` : ''}`
  const terminal = snapshot.status === 'completed' || snapshot.status === 'blocked'
  const message = await postStructuredMessage({
    clientNonce: `handoff:${snapshot.id}:${snapshot.status}:${payloadHash(snapshot as unknown as Record<string, unknown>)}`,
    conversationId,
    companyId: args.companyId,
    authorId: args.actorAgentId,
    kind: 'handoff',
    body,
    mentionedIds: [snapshot.fromAgentId],
    handoff: snapshot,
    handoffWakeTargetId: terminal ? snapshot.fromAgentId : undefined,
    suppressAgentWake: !terminal,
    activation: terminal ? 'trigger' : 'deliver',
  })
  if (terminal) {
    await pool.query(
      `UPDATE agent_handoffs SET result_message_id=$2 WHERE id=$1 AND company_id=$3`,
      [snapshot.id, message.id, args.companyId],
    )
  }
  return { ...snapshot, resultMessageId: terminal ? message.id : null, conversationId }
}

export async function listHandoffs(companyId: string, conversationId?: string): Promise<unknown[]> {
  const params: unknown[] = [companyId]
  let filter = ''
  if (conversationId) {
    params.push(conversationId)
    filter = ` AND h.conversation_id = $2`
  }
  const { rows } = await pool.query(
    `SELECT h.id, h.conversation_id AS "conversationId", h.source_message_id AS "sourceMessageId",
       h.from_agent_id AS "fromAgentId", h.to_agent_id AS "toAgentId", h.title,
       h.context_message_ids AS "contextMessageIds", h.shared_paths AS "sharedPaths",
       h.browser_targets AS "browserTargets", h.note, h.status,
       h.result_message_id AS "resultMessageId", h.created_at AS "createdAt", h.updated_at AS "updatedAt"
     FROM agent_handoffs h WHERE h.company_id = $1${filter}
     ORDER BY h.created_at DESC LIMIT 100`, params,
  )
  return rows
}

export async function consumeApprovedAction(args: {
  approvalId: string; companyId: string; agentId: string; conversationId: string; runId: string; actionKey: string; payload: Record<string, unknown>
}): Promise<{ approved: boolean; approvalId?: string }> {
  const hash = payloadHash(args.payload)
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE approvals SET status='EXECUTED',consumed_at=NOW(),executed_at=NOW()
     WHERE id = $1 AND company_id = $2 AND agent_id = $3
       AND source='COWORKER' AND channel_id = $4 AND run_id = $5 AND action_key = $6
       AND payload_hash = $7 AND status = 'APPROVED' AND consumed_at IS NULL
     RETURNING id`, [args.approvalId, args.companyId, args.agentId, args.conversationId, args.runId, args.actionKey, hash],
  )
  return rows[0] ? { approved: true, approvalId: rows[0].id } : { approved: false }
}

export async function requestApproval(args: {
  companyId: string
  agentId: string
  conversationId: string
  runId?: string | null
  actionKey?: string | null
  actionIndex?: number | null
  blockedAction?: Record<string, unknown> | null
  remainingActions?: Record<string, unknown>[]
  inputScopeKey?: string | null
  kind: ApprovalKind
  summary: string
  payload: Record<string, unknown>
}): Promise<ApprovalSnapshot & { messageId: string }> {
  await conversationGate(args.conversationId, args.companyId, [args.agentId])
  const hash = payloadHash(args.payload)
  const existing = await pool.query<{
    id: string; message_id: string | null; requested_at: string; status: ApprovalStatus
  }>(
    `SELECT a.id, a.message_id, a.requested_at, a.status FROM approvals a
     WHERE a.company_id = $1 AND a.agent_id = $2 AND a.channel_id = $3 AND a.source='COWORKER'
       AND a.run_id IS NOT DISTINCT FROM $4 AND a.action_key IS NOT DISTINCT FROM $5
       AND a.payload_hash = $6 AND a.status = 'PENDING'
     ORDER BY requested_at DESC LIMIT 1`, [args.companyId, args.agentId, args.conversationId, args.runId ?? null, args.actionKey ?? null, hash],
  )
  if (existing.rows[0]) {
    const snapshot: ApprovalSnapshot = {
      id: existing.rows[0].id, agentId: args.agentId, kind: args.kind,
      summary: args.summary, status: existing.rows[0].status, payload: args.payload,
      requestedAt: String(existing.rows[0].requested_at),
    }
    const message = await postStructuredMessage({
      clientNonce: `approval:${snapshot.id}:pending`,
      conversationId: args.conversationId,
      companyId: args.companyId,
      authorId: args.agentId,
      kind: 'approval',
      body: args.summary,
      approval: snapshot,
      suppressAgentWake: true,
    })
    if (existing.rows[0].message_id !== message.id) {
      await pool.query(`UPDATE approvals SET message_id=$2 WHERE id=$1 AND company_id=$3`, [snapshot.id, message.id, args.companyId])
    }
    return { ...snapshot, messageId: message.id }
  }
  const id = `approval-${randomUUID()}`
  const requestedAt = new Date().toISOString()
  const snapshot: ApprovalSnapshot = {
    id, agentId: args.agentId, kind: args.kind, summary: args.summary,
    status: 'PENDING', payload: args.payload, requestedAt,
  }
  await pool.query(
    `INSERT INTO approvals (
       id, company_id, agent_id, channel_id, source, run_id, kind, summary, payload, payload_hash,
       action_key, action_index, blocked_action, remaining_actions, input_scope_key
     ) VALUES ($1,$2,$3,$4,'COWORKER',$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb,$13::jsonb,$14)`,
    [id, args.companyId, args.agentId, args.conversationId, args.runId ?? null,
      args.kind, args.summary.trim(), JSON.stringify(args.payload), hash,
      args.actionKey ?? null, args.actionIndex ?? null, args.blockedAction ? JSON.stringify(args.blockedAction) : null,
      JSON.stringify(args.remainingActions ?? []), args.inputScopeKey ?? null],
  )
  const message = await postStructuredMessage({
      clientNonce: `approval:${id}:pending`,
      conversationId: args.conversationId,
      companyId: args.companyId,
      authorId: args.agentId,
      kind: 'approval',
      body: args.summary,
      approval: snapshot,
      suppressAgentWake: true,
    })
  await pool.query(`UPDATE approvals SET message_id = $2 WHERE id = $1 AND company_id=$3`, [id, message.id, args.companyId])
  return { ...snapshot, messageId: message.id }
}

/** Atomically claim the one continuation paired with an approved card. */
export async function claimApprovedContinuation(approvalId: string): Promise<ApprovedContinuation | null> {
  const { rows } = await pool.query<{
    id: string; company_id: string; agent_id: string; conversation_id: string; run_id: string | null;
    action_key: string | null; action_index: number | null; payload: Record<string, unknown>; blocked_action: Record<string, unknown> | null;
    remaining_actions: Record<string, unknown>[] | null; input_scope_key: string | null
  }>(
    `UPDATE approvals
        SET continuation_status = 'RUNNING', resumed_at = NOW()
      WHERE id = $1 AND source='COWORKER' AND status = 'APPROVED' AND consumed_at IS NULL
        AND continuation_status = 'PENDING'
      RETURNING id, company_id, agent_id, channel_id AS conversation_id, run_id, action_key, action_index,
        payload, blocked_action, remaining_actions, input_scope_key`,
    [approvalId],
  )
  const row = rows[0]
  if (!row?.run_id || !row.action_key || !row.blocked_action || !row.input_scope_key || row.action_index == null) return null
  return {
    approvalId: row.id, companyId: row.company_id, agentId: row.agent_id,
    conversationId: row.conversation_id, runId: row.run_id, actionKey: row.action_key,
    payload: row.payload, blockedAction: row.blocked_action,
    remainingActions: row.remaining_actions ?? [], inputScopeKey: row.input_scope_key,
    actionIndex: row.action_index,
  }
}

export async function finishApprovedContinuation(approvalId: string, status: 'COMPLETED' | 'FAILED'): Promise<void> {
  await pool.query(`UPDATE approvals SET continuation_status = $2 WHERE id = $1 AND source='COWORKER'`, [approvalId, status])
}

export async function resolveApproval(args: {
  companyId: string; userId: string; approvalId: string; decision: 'APPROVED' | 'REJECTED'
}): Promise<ApprovalSnapshot & { conversationId: string; messageId: string }> {
  const current = await pool.query<{ conversation_id: string }>(
    `SELECT channel_id AS conversation_id FROM approvals
     WHERE id = $1 AND company_id = $2 AND source='COWORKER' LIMIT 1`,
    [args.approvalId, args.companyId],
  )
  if (!current.rows[0]) throw new Error('approval not found')
  await conversationGate(current.rows[0].conversation_id, args.companyId, [args.userId])
  const { rows } = await pool.query<{
    id: string; agent_id: string; conversation_id: string; message_id: string | null; kind: ApprovalKind;
    run_id: string | null; summary: string; payload: Record<string, unknown>; requested_at: string;
    resolved_at: string; resolved_by: string; status: ApprovalStatus
  }>(
    `UPDATE approvals SET status = $4, resolved_at = NOW(), resolved_by = $3
     WHERE id = $1 AND company_id = $2 AND source='COWORKER' AND status = 'PENDING'
     RETURNING id, agent_id, channel_id AS conversation_id, message_id, run_id, kind, summary, payload, requested_at,
               resolved_at, resolved_by, status`,
    [args.approvalId, args.companyId, args.userId, args.decision],
  )
  const row = rows[0] ?? (await pool.query<{
    id: string; agent_id: string; conversation_id: string; message_id: string | null; kind: ApprovalKind;
    run_id: string | null; summary: string; payload: Record<string, unknown>; requested_at: string;
    resolved_at: string; resolved_by: string; status: ApprovalStatus
  }>(
    `SELECT id,agent_id,channel_id AS conversation_id,message_id,run_id,kind,summary,payload,requested_at,
            resolved_at,resolved_by,status
       FROM approvals WHERE id=$1 AND company_id=$2 AND source='COWORKER'`,
    [args.approvalId, args.companyId],
  )).rows[0]
  if (!row || row.status !== args.decision || !row.resolved_at || !row.resolved_by) {
    throw new Error(`approval is already resolved as ${row?.status ?? 'unknown'}`)
  }
  const snapshot: ApprovalSnapshot = {
    id: row.id, agentId: row.agent_id, kind: row.kind, summary: row.summary,
    status: args.decision, payload: row.payload, requestedAt: String(row.requested_at),
    resolvedAt: String(row.resolved_at), resolvedBy: row.resolved_by,
    runId: row.run_id, conversationId: row.conversation_id,
  }
  const message = await postStructuredMessage({
    clientNonce: `approval:${row.id}:${args.decision}`,
    conversationId: row.conversation_id,
    companyId: args.companyId,
    authorId: row.agent_id,
    kind: 'approval',
    body: row.summary,
    approval: snapshot,
    suppressAgentWake: true,
  })
  await pool.query(
    `UPDATE approvals SET message_id=$2 WHERE id=$1 AND company_id=$3`,
    [row.id, message.id, args.companyId],
  )
  // Do not create a fresh wake-up. An approved continuation resumes the
  // suspended run using this exact approval/action identity; rejection
  // terminally completes that same run without executing the blocked action.
  if (row.run_id && args.decision === 'REJECTED') {
    await pool.query(
      `UPDATE agent_runs
       SET status = 'completed', finished_at = COALESCE(finished_at, NOW()), updated_at = NOW(),
           summary = $2
       WHERE id = $1 AND status = 'waiting_for_human'`,
      [row.run_id, 'Human rejected approval; blocked action was not executed'],
    )
    await pool.query(`UPDATE approvals SET continuation_status = 'REJECTED' WHERE id = $1`, [row.id])
  }
  return { ...snapshot, conversationId: row.conversation_id, messageId: message.id }
}

export async function listApprovals(companyId: string, status?: ApprovalStatus): Promise<unknown[]> {
  const params: unknown[] = [companyId]
  let filter = ''
  if (status) {
    params.push(status)
    filter = ` AND a.status = $2`
  }
  const { rows } = await pool.query(
    `SELECT a.id, a.agent_id AS "agentId", a.channel_id AS "conversationId",
       a.run_id AS "runId", a.message_id AS "messageId", a.kind, a.summary, a.payload,
       a.status, a.requested_at AS "requestedAt", a.resolved_at AS "resolvedAt",
       a.resolved_by AS "resolvedBy", a.consumed_at AS "consumedAt"
     FROM approvals a WHERE a.company_id = $1 AND a.source='COWORKER'${filter}
     ORDER BY a.requested_at DESC LIMIT 100`, params,
  )
  return rows
}

export async function upsertAutonomyRule(args: {
  companyId: string; userId: string; agentId: string; scope: string; operation: string;
  mode: 'allow' | 'ask' | 'deny'; source?: 'explicit_user' | 'learned'
}): Promise<AutonomyRuleSnapshot> {
  const id = `autonomy-${randomUUID()}`
  const { rows } = await pool.query(
    `INSERT INTO agent_autonomy_rules (id, company_id, user_id, agent_id, scope, operation, mode, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (user_id, agent_id, scope, operation) DO UPDATE SET
       mode = EXCLUDED.mode, source = EXCLUDED.source, updated_at = NOW()
     RETURNING id, agent_id AS "agentId", scope, operation, mode, source,
       created_at AS "createdAt", updated_at AS "updatedAt"`,
    [id, args.companyId, args.userId, args.agentId, args.scope, args.operation, args.mode, args.source ?? 'explicit_user'],
  )
  return rows[0]
}

export async function listAutonomyRules(companyId: string, userId: string): Promise<AutonomyRuleSnapshot[]> {
  const { rows } = await pool.query(
    `SELECT id, agent_id AS "agentId", scope, operation, mode, source,
       created_at AS "createdAt", updated_at AS "updatedAt"
     FROM agent_autonomy_rules WHERE company_id = $1 AND user_id = $2
     ORDER BY updated_at DESC`, [companyId, userId],
  )
  return rows
}

export async function deleteAutonomyRule(companyId: string, userId: string, id: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM agent_autonomy_rules WHERE id = $1 AND company_id = $2 AND user_id = $3`, [id, companyId, userId])
  return (result.rowCount ?? 0) > 0
}

export { payloadHash as hashApprovalPayload }
