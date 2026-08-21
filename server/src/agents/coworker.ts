import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { CH_MESSAGE_NEW, publish } from '../redis.js'

export type HandoffStatus = 'pending' | 'accepted' | 'working' | 'completed' | 'blocked'
export type ApprovalKind = 'external_communication' | 'sensitive_or_destructive_action' | 'financial_or_irreversible_action'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired'

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

async function publishMessage(message: {
  id: string; conversationId: string; companyId: string; authorId: string; kind: string; body: string; sequence: number;
  mentionedIds?: string[]; handoff?: HandoffSnapshot; approval?: ApprovalSnapshot; activation?: 'deliver' | 'trigger'
}): Promise<void> {
  await publish(CH_MESSAGE_NEW, {
    type: 'message.new',
    conversationId: message.conversationId,
    companyId: message.companyId,
    message: {
      id: message.id,
      conversationId: message.conversationId,
      authorId: message.authorId,
      kind: message.kind,
      body: message.body,
      sequence: message.sequence,
      at: new Date().toISOString(),
      mentionedIds: message.mentionedIds ?? [],
      mentionAll: false,
      handoff: message.handoff,
      approval: message.approval,
      activation: message.activation,
    },
  })
}

async function postStructuredMessage(args: {
  conversationId: string
  companyId: string
  authorId: string
  kind: 'handoff' | 'approval' | 'system'
  body: string
  mentionedIds?: string[]
  handoff?: HandoffSnapshot
  approval?: ApprovalSnapshot
  activation?: 'deliver' | 'trigger'
}): Promise<{ id: string; sequence: number }> {
  const client = await pool.connect()
  const id = `m-${randomUUID()}`
  let sequence = 1
  try {
    await client.query('BEGIN')
    const seq = await client.query<{ seq: number }>(
      `INSERT INTO conversation_counters (conversation_id, next_sequence)
       VALUES ($1, 2)
       ON CONFLICT (conversation_id) DO UPDATE SET next_sequence = conversation_counters.next_sequence + 1
       RETURNING next_sequence - 1 AS seq`, [args.conversationId],
    )
    sequence = seq.rows[0]?.seq ?? 1
    await client.query(
      `INSERT INTO messages (
         id, conversation_id, author_id, kind, body, sequence, company_id,
         mentioned_ids, mention_all, handoff, approval
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,FALSE,$9::jsonb,$10::jsonb)`,
      [
        id, args.conversationId, args.authorId, args.kind, args.body, sequence, args.companyId,
        JSON.stringify(args.mentionedIds ?? []), args.handoff ? JSON.stringify(args.handoff) : null,
        args.approval ? JSON.stringify(args.approval) : null,
      ],
    )
    await client.query(`UPDATE conversations SET updated_at = NOW() WHERE id = $1`, [args.conversationId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
  await publishMessage({ id, sequence, ...args })
  return { id, sequence }
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
  await pool.query(
    `INSERT INTO agent_handoffs (
       id, company_id, conversation_id, from_agent_id, to_agent_id, title,
       context_message_ids, shared_paths, browser_targets, note, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,'working')`,
    [id, args.companyId, args.conversationId, args.fromAgentId, args.toAgentId, snapshot.title,
      JSON.stringify(args.contextMessageIds ?? []), JSON.stringify(snapshot.sharedPaths),
      JSON.stringify(snapshot.browserTargets), snapshot.note],
  )
  try {
    const message = await postStructuredMessage({
      conversationId: args.conversationId,
      companyId: args.companyId,
      authorId: args.fromAgentId,
      kind: 'handoff',
      body: `Handoff to @${args.toAgentId}: ${snapshot.title}`,
      mentionedIds: [args.toAgentId],
      handoff: snapshot,
      activation: 'trigger',
    })
    await pool.query(`UPDATE agent_handoffs SET source_message_id = $2 WHERE id = $1`, [id, message.id])
    return { ...snapshot, sourceMessageId: message.id }
  } catch (error) {
    await pool.query(`DELETE FROM agent_handoffs WHERE id = $1`, [id]).catch(() => undefined)
    throw error
  }
}

export async function updateHandoff(args: {
  companyId: string
  handoffId: string
  actorAgentId: string
  status: Extract<HandoffStatus, 'accepted' | 'working' | 'completed' | 'blocked'>
  note?: string | null
}): Promise<HandoffSnapshot & { resultMessageId: string | null; conversationId: string }> {
  const { rows } = await pool.query<{
    conversation_id: string; from_agent_id: string; to_agent_id: string; title: string;
    shared_paths: string[]; browser_targets: string[]; note: string | null
  }>(
    `SELECT conversation_id, from_agent_id, to_agent_id, title, shared_paths, browser_targets, note
     FROM agent_handoffs WHERE id = $1 AND company_id = $2 LIMIT 1`, [args.handoffId, args.companyId],
  )
  const row = rows[0]
  if (!row) throw new Error('handoff not found')
  // The source agent may only create the handoff. From acceptance onward the
  // target agent owns progress and terminal state; this keeps the UI's
  // ownership claim truthful and prevents a source from declaring work done.
  if (args.actorAgentId !== row.to_agent_id) throw new Error('only the target agent owns this handoff after creation')
  const snapshot: HandoffSnapshot = {
    id: args.handoffId,
    fromAgentId: row.from_agent_id,
    toAgentId: row.to_agent_id,
    title: row.title,
    status: args.status,
    note: args.note?.trim() || row.note,
    sharedPaths: row.shared_paths ?? [],
    browserTargets: row.browser_targets ?? [],
  }
  await pool.query(
    `UPDATE agent_handoffs SET status = $3, note = $4, updated_at = NOW()
     WHERE id = $1 AND company_id = $2`, [args.handoffId, args.companyId, args.status, snapshot.note],
  )
  await pool.query(
    `UPDATE messages SET handoff = $2::jsonb WHERE id = (
       SELECT source_message_id FROM agent_handoffs WHERE id = $1
     )`, [args.handoffId, JSON.stringify(snapshot)],
  )
  let resultMessageId: string | null = null
  if (args.status === 'completed' || args.status === 'blocked') {
    const result = await postStructuredMessage({
      conversationId: row.conversation_id,
      companyId: args.companyId,
      authorId: args.actorAgentId,
      kind: 'handoff',
      body: `${args.status === 'completed' ? 'Completed' : 'Blocked'} handoff: ${row.title}${snapshot.note ? ` — ${snapshot.note}` : ''}`,
      mentionedIds: [row.from_agent_id],
      handoff: snapshot,
    })
    resultMessageId = result.id
    await pool.query(`UPDATE agent_handoffs SET result_message_id = $2 WHERE id = $1`, [args.handoffId, result.id])
  }
  return { ...snapshot, resultMessageId, conversationId: row.conversation_id }
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
    `UPDATE agent_approvals SET consumed_at = NOW()
     WHERE id = $1 AND company_id = $2 AND agent_id = $3
       AND conversation_id = $4 AND run_id = $5 AND action_key = $6
       AND payload_hash = $7 AND status = 'approved' AND consumed_at IS NULL
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
  kind: ApprovalKind
  summary: string
  payload: Record<string, unknown>
}): Promise<ApprovalSnapshot & { messageId: string }> {
  await conversationGate(args.conversationId, args.companyId, [args.agentId])
  const hash = payloadHash(args.payload)
  const existing = await pool.query<{
    id: string; message_id: string; requested_at: string; status: ApprovalStatus
  }>(
    `SELECT a.id, a.message_id, a.requested_at, a.status FROM agent_approvals a
     WHERE a.company_id = $1 AND a.agent_id = $2 AND a.conversation_id = $3
       AND a.run_id IS NOT DISTINCT FROM $4 AND a.action_key IS NOT DISTINCT FROM $5
       AND a.payload_hash = $6 AND (
         a.status = 'pending'
         OR (a.status = 'rejected' AND NOT EXISTS (
           SELECT 1 FROM messages m
           JOIN participants p ON p.id = m.author_id AND p.company_id = $1 AND p.kind = 'human'
           WHERE m.conversation_id = a.conversation_id AND m.created_at > a.resolved_at
         ))
       )
     ORDER BY requested_at DESC LIMIT 1`, [args.companyId, args.agentId, args.conversationId, args.runId ?? null, args.actionKey ?? null, hash],
  )
  if (existing.rows[0]) {
    return {
      id: existing.rows[0].id, agentId: args.agentId, kind: args.kind,
      summary: args.summary, status: existing.rows[0].status, payload: args.payload,
      requestedAt: String(existing.rows[0].requested_at), messageId: existing.rows[0].message_id,
    }
  }
  const id = `approval-${randomUUID()}`
  const requestedAt = new Date().toISOString()
  const snapshot: ApprovalSnapshot = {
    id, agentId: args.agentId, kind: args.kind, summary: args.summary,
    status: 'pending', payload: args.payload, requestedAt,
  }
  await pool.query(
    `INSERT INTO agent_approvals (
       id, company_id, agent_id, conversation_id, run_id, kind, summary, payload, payload_hash,
       action_key, action_index, blocked_action
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb)`,
    [id, args.companyId, args.agentId, args.conversationId, args.runId ?? null,
      args.kind, args.summary.trim(), JSON.stringify(args.payload), hash,
      args.actionKey ?? null, args.actionIndex ?? null, args.blockedAction ? JSON.stringify(args.blockedAction) : null],
  )
  try {
    const message = await postStructuredMessage({
      conversationId: args.conversationId,
      companyId: args.companyId,
      authorId: args.agentId,
      kind: 'approval',
      body: args.summary,
      approval: snapshot,
    })
    await pool.query(`UPDATE agent_approvals SET message_id = $2 WHERE id = $1`, [id, message.id])
    return { ...snapshot, messageId: message.id }
  } catch (error) {
    await pool.query(`DELETE FROM agent_approvals WHERE id = $1`, [id]).catch(() => undefined)
    throw error
  }
}

/** Atomically claim the one continuation paired with an approved card. */
export async function claimApprovedContinuation(approvalId: string): Promise<ApprovedContinuation | null> {
  const { rows } = await pool.query<{
    id: string; company_id: string; agent_id: string; conversation_id: string; run_id: string | null;
    action_key: string | null; payload: Record<string, unknown>; blocked_action: Record<string, unknown> | null
  }>(
    `UPDATE agent_approvals
        SET continuation_status = 'running', resumed_at = NOW()
      WHERE id = $1 AND status = 'approved' AND consumed_at IS NULL
        AND continuation_status = 'pending'
      RETURNING id, company_id, agent_id, conversation_id, run_id, action_key, payload, blocked_action`,
    [approvalId],
  )
  const row = rows[0]
  if (!row?.run_id || !row.action_key || !row.blocked_action) return null
  return {
    approvalId: row.id, companyId: row.company_id, agentId: row.agent_id,
    conversationId: row.conversation_id, runId: row.run_id, actionKey: row.action_key,
    payload: row.payload, blockedAction: row.blocked_action,
  }
}

export async function finishApprovedContinuation(approvalId: string, status: 'completed' | 'failed'): Promise<void> {
  await pool.query(`UPDATE agent_approvals SET continuation_status = $2 WHERE id = $1`, [approvalId, status])
}

export async function resolveApproval(args: {
  companyId: string; userId: string; approvalId: string; decision: 'approved' | 'rejected'
}): Promise<ApprovalSnapshot & { conversationId: string; messageId: string }> {
  const pending = await pool.query<{ conversation_id: string }>(
    `SELECT conversation_id FROM agent_approvals
     WHERE id = $1 AND company_id = $2 AND status = 'pending' LIMIT 1`,
    [args.approvalId, args.companyId],
  )
  if (!pending.rows[0]) throw new Error('pending approval not found')
  await conversationGate(pending.rows[0].conversation_id, args.companyId, [args.userId])
  const { rows } = await pool.query<{
    id: string; agent_id: string; conversation_id: string; message_id: string; kind: ApprovalKind;
    run_id: string | null; summary: string; payload: Record<string, unknown>; requested_at: string
  }>(
    `UPDATE agent_approvals SET status = $4, resolved_at = NOW(), resolved_by = $3
     WHERE id = $1 AND company_id = $2 AND status = 'pending'
     RETURNING id, agent_id, conversation_id, message_id, run_id, kind, summary, payload, requested_at`,
    [args.approvalId, args.companyId, args.userId, args.decision],
  )
  const row = rows[0]
  if (!row) throw new Error('pending approval not found')
  const resolvedAt = new Date().toISOString()
  const snapshot: ApprovalSnapshot = {
    id: row.id, agentId: row.agent_id, kind: row.kind, summary: row.summary,
    status: args.decision, payload: row.payload, requestedAt: String(row.requested_at),
    resolvedAt, resolvedBy: args.userId, runId: row.run_id, conversationId: row.conversation_id,
  }
  await pool.query(`UPDATE messages SET approval = $2::jsonb WHERE id = $1`, [row.message_id, JSON.stringify(snapshot)])
  const original = await pool.query<{ sequence: number }>(`SELECT sequence FROM messages WHERE id = $1`, [row.message_id])
  await publishMessage({
    id: row.message_id,
    conversationId: row.conversation_id,
    companyId: args.companyId,
    authorId: row.agent_id,
    kind: 'approval',
    body: row.summary,
    sequence: original.rows[0]?.sequence ?? 1,
    approval: snapshot,
  })
  // Do not create a fresh wake-up. An approved continuation resumes the
  // suspended run using this exact approval/action identity; rejection
  // terminally completes that same run without executing the blocked action.
  if (row.run_id && args.decision === 'rejected') {
    await pool.query(
      `UPDATE agent_runs
       SET status = 'completed', finished_at = COALESCE(finished_at, NOW()), updated_at = NOW(),
           summary = $2
       WHERE id = $1 AND status = 'waiting_for_human'`,
      [row.run_id, 'Human rejected approval; blocked action was not executed'],
    )
    await pool.query(`UPDATE agent_approvals SET continuation_status = 'rejected' WHERE id = $1`, [row.id])
  }
  return { ...snapshot, conversationId: row.conversation_id, messageId: row.message_id }
}

export async function listApprovals(companyId: string, status?: ApprovalStatus): Promise<unknown[]> {
  const params: unknown[] = [companyId]
  let filter = ''
  if (status) {
    params.push(status)
    filter = ` AND a.status = $2`
  }
  const { rows } = await pool.query(
    `SELECT a.id, a.agent_id AS "agentId", a.conversation_id AS "conversationId",
       a.run_id AS "runId", a.message_id AS "messageId", a.kind, a.summary, a.payload,
       a.status, a.requested_at AS "requestedAt", a.resolved_at AS "resolvedAt",
       a.resolved_by AS "resolvedBy", a.consumed_at AS "consumedAt"
     FROM agent_approvals a WHERE a.company_id = $1${filter}
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
