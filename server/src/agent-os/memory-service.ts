import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { embedText, hasPgVector } from '../agents/embeddings.js'
import { pool } from '../db/pool.js'
import type { WorkerTaskHandle } from '../runtime/lifecycle.js'
import {
  KNOWLEDGE_CONTRACT_VERSION,
  PROMPT_CONTRACT_VERSION,
  type AgentWorkItem,
  type MemoryScopeType,
  type MemorySynthesisBatch,
  type MemorySynthesisChange,
  type PromptContextV1,
  type PromptMemoryV1,
} from './types.js'
import { assembleAgentSystemPrompt } from './prompt-assembly.js'

interface MemoryRow {
  agent_id: string
  path: string
  body: string
  meta: Record<string, unknown> | null
  updated_at: string
}

function scopeIdFor(type: MemoryScopeType, args: { learnerId: string; conversationId: string; agentId: string }): string {
  if (type === 'learner') return args.learnerId
  if (type === 'course') return args.conversationId
  return args.agentId
}

function toPromptMemory(row: MemoryRow): PromptMemoryV1 {
  const meta = row.meta
  if (!meta) throw new Error(`memory metadata missing: ${row.path}`)
  if (meta.scopeType !== 'learner' && meta.scopeType !== 'course' && meta.scopeType !== 'agent_role') {
    throw new Error(`invalid memory scopeType: ${row.path}`)
  }
  if (typeof meta.scopeId !== 'string' || !meta.scopeId) throw new Error(`memory scopeId missing: ${row.path}`)
  if (typeof meta.kind !== 'string' || !meta.kind) throw new Error(`memory kind missing: ${row.path}`)
  if (meta.origin !== 'explicit' && meta.origin !== 'synthesized') throw new Error(`invalid memory origin: ${row.path}`)
  if (!Array.isArray(meta.sourceEventIds)) throw new Error(`memory evidence missing: ${row.path}`)
  if (!Number.isFinite(Number(meta.version)) || !Number.isFinite(Number(meta.confidence))) {
    throw new Error(`invalid memory version/confidence: ${row.path}`)
  }
  const segments = row.path.split('/')
  return {
    id: String(segments.at(-1) ?? row.path).replace(/\.md$/, ''),
    scopeType: meta.scopeType,
    scopeId: meta.scopeId,
    body: row.body,
    kind: meta.kind,
    origin: meta.origin,
    pinned: meta.pinned === true,
    sourceEventIds: meta.sourceEventIds.map(String),
    version: Math.max(1, Number(meta.version)),
    confidence: Math.max(0, Math.min(1, Number(meta.confidence))),
    ...(typeof meta.validUntil === 'string' ? { validUntil: meta.validUntil } : {}),
    updatedAt: row.updated_at,
  }
}

async function recallScope(args: {
  companyId: string; agentId: string; scopeType: MemoryScopeType; scopeId: string; query: string; limit?: number; conversationId?: string
}): Promise<PromptMemoryV1[]> {
  const limit = Math.min(12, Math.max(1, args.limit ?? 12))
  const { rows: expired } = await pool.query<MemoryRow>(
    `UPDATE agent_workspace SET meta=COALESCE(meta,'{}'::jsonb)||jsonb_build_object('status','expired')
      WHERE company_id=$1 AND path LIKE 'memory/%' AND meta->>'scopeType'=$2 AND meta->>'scopeId'=$3
        AND meta->>'status' IS DISTINCT FROM 'expired'
        AND CASE WHEN meta->>'validUntil' ~ '^\\d{4}-\\d{2}-\\d{2}T' THEN (meta->>'validUntil')::timestamptz END <= NOW()
      RETURNING agent_id,path,body,meta,updated_at`,
    [args.companyId, args.scopeType, args.scopeId],
  )
  if (args.conversationId && expired.length > 0) {
    for (const memory of expired) {
      const version = Math.max(1, Number(memory.meta?.version ?? 1))
      const eventId = `temporal:${memory.path}:v${version}`
      await pool.query(
        `INSERT INTO agent_memory_evidence
           (id,company_id,agent_id,learner_id,conversation_id,user_event_id,assistant_event_id,user_text,assistant_text)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)
         ON CONFLICT (company_id,agent_id,user_event_id,assistant_event_id) DO NOTHING`,
        [`evidence-${randomUUID()}`, args.companyId, args.agentId,
          args.scopeType === 'learner' ? args.scopeId : '__temporal__', args.conversationId, eventId,
          `Re-verify expired ${args.scopeType} memory ${memory.path} version ${version}.`, memory.body],
      )
    }
    await enqueuePendingMemorySynthesis(args.companyId, args.agentId, args.conversationId)
  }
  const params: unknown[] = [args.companyId, args.scopeType, args.scopeId]
  const semanticQuery = args.query.trim()
  let distance = 'NULL::real AS distance'
  let order = `COALESCE((meta->>'pinned')::boolean,false) DESC, updated_at DESC`
  let semanticRecall = false
  params.push(limit)
  const limitParameter = `$${params.length}`
  if (semanticQuery) {
    if (!await hasPgVector()) throw new Error('pgvector extension is required')
    try {
      const vector = await embedText(semanticQuery, { companyId: args.companyId, agentId: args.agentId })
      if (!vector) throw new Error('memory recall embedding is required')
      params.push(vector)
      semanticRecall = true
      distance = `embedding <=> $${params.length}::vector AS distance`
      order = `COALESCE((meta->>'pinned')::boolean,false) DESC, distance ASC, updated_at DESC`
    } catch (error) {
      console.warn('[memory:recall] semantic recall unavailable; using recency:', error instanceof Error ? error.message : String(error))
    }
  }
  const { rows } = await pool.query<MemoryRow & { distance: number | null }>(
    `SELECT agent_id,path,body,meta,updated_at,${distance}
       FROM agent_workspace
      WHERE company_id=$1 AND path LIKE 'memory/%'
        AND COALESCE(meta->>'status','active')='active'
        AND meta->>'scopeType'=$2 AND meta->>'scopeId'=$3
        ${semanticRecall ? 'AND embedding IS NOT NULL' : ''}
      ORDER BY ${order} LIMIT ${limitParameter}`, params,
  )
  return rows.map(toPromptMemory)
}

export async function recallMemories(args: {
  companyId: string; agentId: string; scopeType: MemoryScopeType; scopeId: string; query?: string; limit?: number; conversationId?: string
}): Promise<PromptMemoryV1[]> {
  return recallScope({ ...args, query: args.query ?? '' })
}

export async function writeExplicitMemory(args: {
  companyId: string; agentId: string; scopeType: MemoryScopeType; scopeId: string; body: string; kind?: string; sourceEventId: string
}): Promise<PromptMemoryV1> {
  const id = `mem-${randomUUID().slice(0, 12)}`
  const kind = String(args.kind ?? 'observation').replace(/[^a-z_]/g, '').slice(0, 32) || 'observation'
  const meta = {
    type: 'memory', kind, scopeType: args.scopeType, scopeId: args.scopeId, origin: 'explicit',
    sourceEventIds: [args.sourceEventId], version: 1, confidence: 1, validUntil: null,
    lastVerifiedAt: new Date().toISOString(), status: 'active', pinned: false,
  }
  if (!await hasPgVector()) throw new Error('pgvector extension is required')
  const vector = await embedText(args.body, { companyId: args.companyId, agentId: args.agentId })
  if (!vector) throw new Error('memory embedding is required')
  const { rows } = await pool.query<MemoryRow>(
    `INSERT INTO agent_workspace(agent_id,path,body,meta,embedding,company_id,updated_at)
     VALUES($1,$2,$3,$4::jsonb,$5::vector,$6,NOW()) RETURNING agent_id,path,body,meta,updated_at`,
    [args.agentId, `memory/${kind}/${id}.md`, args.body.trim(), JSON.stringify(meta), vector, args.companyId],
  )
  return toPromptMemory(rows[0])
}

export async function verifyExplicitMemory(args: { companyId: string; id: string }): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE agent_workspace SET meta=COALESCE(meta,'{}'::jsonb)||jsonb_build_object(
      'lastVerifiedAt',NOW(),'status','active','version',COALESCE((meta->>'version')::int,1)+1),updated_at=NOW()
      WHERE company_id=$1 AND path LIKE $2 AND meta->>'origin'='explicit'`, [args.companyId, `memory/%/${args.id}.md`],
  )
  return (rowCount ?? 0) > 0
}

export async function buildPromptContext(args: {
  epoch: number
  companyId: string
  agentId: string
  conversationId: string
  learnerId: string
  query: string
  persona: { name: string; role: string; instructions: string }
  capabilities: string[]
  executionRole: import('./types.js').AgentExecutionRole
  sourceVersions?: Record<string, string>
  /** Product-managed agents use the same prompt assembly without learner memory. */
  skipMemories?: boolean
}): Promise<PromptContextV1> {
  const scopes = { learnerId: args.learnerId, conversationId: args.conversationId, agentId: args.agentId }
  const recalled = args.skipMemories
    ? [[], [], []] as [PromptMemoryV1[], PromptMemoryV1[], PromptMemoryV1[]]
    : await Promise.all((['learner', 'course', 'agent_role'] as const).map((scopeType) =>
      recallScope({
        companyId: args.companyId, agentId: args.agentId, scopeType,
        scopeId: scopeIdFor(scopeType, scopes), query: args.query, conversationId: args.conversationId,
      }),
    ))
  // Bound all three layers together, not just each query independently. This
  // keeps a large learner profile from silently crowding the live turn out of
  // the model context while preserving each layer's ranked order.
  let remaining = Math.max(2_000, Number(process.env.AGENT_OS_MEMORY_PROMPT_CHARS ?? 24_000))
  const bounded = recalled.map((items) => items.filter((item) => {
    const cost = item.body.length + item.kind.length + 8
    if (cost > remaining) return false
    remaining -= cost
    return true
  }))
  const [learner, course, agentRole] = bounded
  const assembledAt = new Date().toISOString()
  const memories = { learner, course, agentRole }
  return {
    version: 2,
    epoch: args.epoch,
    assembledAt,
    persona: args.persona,
    capabilities: [...args.capabilities],
    executionRole: args.executionRole,
    memories,
    systemInstructions: assembleAgentSystemPrompt({
      persona: args.persona,
      capabilities: args.capabilities,
      executionRole: args.executionRole,
    }),
    sourceVersions: {
      ...(args.sourceVersions ?? { persona: assembledAt, capabilities: assembledAt }),
      knowledgeContract: KNOWLEDGE_CONTRACT_VERSION,
      promptContract: PROMPT_CONTRACT_VERSION,
      learner: learner.map((item) => `${item.id}:${item.version}`).join(','),
      course: course.map((item) => `${item.id}:${item.version}`).join(','),
      agentRole: agentRole.map((item) => `${item.id}:${item.version}`).join(','),
    },
  }
}

export async function recordMemoryEvidence(args: {
  work: AgentWorkItem; learnerId: string; userText: string; assistantText: string
}): Promise<void> {
  if (!args.learnerId || !args.userText.trim() || !args.assistantText.trim()) return
  const evidenceId = `evidence-${randomUUID()}`
  await pool.query(
    `INSERT INTO agent_memory_evidence
       (id,company_id,agent_id,learner_id,conversation_id,user_event_id,assistant_event_id,user_text,assistant_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (company_id,agent_id,user_event_id,assistant_event_id) DO NOTHING`,
    [evidenceId, args.work.companyId, args.work.agentId, args.learnerId, args.work.channelId,
      args.work.triggerClientMsgNo, args.work.id, args.userText.slice(0, 8_000), args.assistantText.slice(0, 8_000)],
  )
  await enqueuePendingMemorySynthesis(args.work.companyId, args.work.agentId, args.work.channelId)
}

export async function enqueuePendingMemorySynthesis(companyId?: string, agentId?: string, channelId?: string): Promise<number> {
  const params: unknown[] = []
  const filters: string[] = [`e.status='pending'`, `e.available_at <= NOW()`]
  if (companyId) { params.push(companyId); filters.push(`e.company_id=$${params.length}`) }
  if (agentId) { params.push(agentId); filters.push(`e.agent_id=$${params.length}`) }
  if (channelId) { params.push(channelId); filters.push(`e.conversation_id=$${params.length}`) }
  const { rows } = await pool.query<{
    company_id: string; agent_id: string; conversation_id: string; id: string; authorization_user_id: string
  }>(
    `SELECT DISTINCT ON (e.company_id,e.agent_id,e.conversation_id)
            e.company_id,e.agent_id,e.conversation_id,e.id,e.learner_id AS authorization_user_id
       FROM agent_memory_evidence e
      WHERE ${filters.join(' AND ')}
        AND NOT EXISTS (SELECT 1 FROM agent_work_items w WHERE w.company_id=e.company_id AND w.agent_id=e.agent_id
          AND w.reason='memory_synthesis' AND w.status IN ('queued','leased'))
      ORDER BY e.company_id,e.agent_id,e.conversation_id,e.created_at LIMIT 50`, params,
  )
  const bucket = Math.floor(Date.now() / 15_000)
  for (const row of rows) {
    await pool.query(
      `INSERT INTO agent_work_items (id,company_id,authorization_user_id,agent_id,channel_id,trigger_client_msg_no,reason,priority)
       VALUES ($1,$2,$3,$4,$5,$6,'memory_synthesis',10) ON CONFLICT (agent_id,trigger_client_msg_no,reason) DO NOTHING`,
      [`memory-synthesis-${randomUUID()}`, row.company_id, row.authorization_user_id,
        row.agent_id, row.conversation_id, `memory:${row.id}:${bucket}`],
    )
  }
  return rows.length
}

export function startMemorySynthesisScheduler(intervalMs = 15_000): WorkerTaskHandle {
  const tick = () => void enqueuePendingMemorySynthesis().catch((error) => console.warn('[memory:synthesis] enqueue failed:', error instanceof Error ? error.message : String(error)))
  const immediate = setImmediate(tick)
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  return { stop: () => { clearImmediate(immediate); clearInterval(timer) } }
}

export async function loadMemorySynthesisBatch(work: AgentWorkItem): Promise<MemorySynthesisBatch | null> {
  const { rows } = await pool.query<{
    id: string; learner_id: string; conversation_id: string; user_event_id: string; assistant_event_id: string
    user_text: string; assistant_text: string; created_at: string
  }>(
    `SELECT id,learner_id,conversation_id,user_event_id,assistant_event_id,user_text,assistant_text,created_at
       FROM agent_memory_evidence WHERE company_id=$1 AND agent_id=$2 AND conversation_id=$3
        AND status='pending' AND available_at <= NOW() ORDER BY created_at LIMIT 12`,
    [work.companyId, work.agentId, work.channelId],
  )
  if (!rows[0]) return null
  const learnerId = rows[0].learner_id
  const evidence = rows.filter((row) => row.learner_id === learnerId)
  const currentMemories = (await Promise.all((['learner', 'course', 'agent_role'] as const).map((scopeType) => recallScope({
    companyId: work.companyId, agentId: work.agentId, scopeType,
    scopeId: scopeIdFor(scopeType, { learnerId, conversationId: work.channelId, agentId: work.agentId }), query: '', limit: 12,
  })))).flat()
  return {
    evidence: evidence.map((row) => ({
      id: row.id, learnerId: row.learner_id, conversationId: row.conversation_id,
      userEventId: row.user_event_id, assistantEventId: row.assistant_event_id,
      user: row.user_text, assistant: row.assistant_text, occurredAt: row.created_at,
    })),
    currentMemories,
  }
}

function validChange(value: unknown): value is MemorySynthesisChange {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<MemorySynthesisChange>
  const action = String(item.action)
  return ['create', 'update', 'expire'].includes(action)
    && ['learner', 'course', 'agent_role'].includes(String(item.scopeType))
    && typeof item.scopeId === 'string' && item.scopeId.length > 0 && item.scopeId.length <= 128
    && Array.isArray(item.sourceEventIds) && item.sourceEventIds.length > 0 && item.sourceEventIds.length <= 32
    && item.sourceEventIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128)
    && (action === 'create' || (typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 128))
    && (action === 'create' || (Number.isInteger(item.expectedVersion) && Number(item.expectedVersion) >= 1))
    && (action === 'expire' || (typeof item.content === 'string' && item.content.trim().length > 0 && item.content.length <= 500))
    && (item.kind === undefined || (typeof item.kind === 'string' && item.kind.length > 0 && item.kind.length <= 32))
    && (item.validUntil === undefined || (typeof item.validUntil === 'string' && Number.isFinite(Date.parse(item.validUntil))))
}

async function applyChange(client: PoolClient, work: AgentWorkItem, change: MemorySynthesisChange, confidence: number): Promise<boolean> {
  if (change.action === 'create') {
    if (!change.content?.trim()) return false
    const id = `mem-${randomUUID().slice(0, 12)}`
    const kind = String(change.kind ?? 'observation').replace(/[^a-z_]/g, '').slice(0, 32) || 'observation'
    const meta = {
      type: 'memory', kind, scopeType: change.scopeType, scopeId: change.scopeId,
      origin: 'synthesized', sourceEventIds: change.sourceEventIds, version: 1, confidence,
      validUntil: change.validUntil ?? null, lastVerifiedAt: new Date().toISOString(), status: 'active', pinned: false,
    }
    await client.query(
      `INSERT INTO agent_workspace(agent_id,path,body,meta,company_id,updated_at) VALUES($1,$2,$3,$4::jsonb,$5,NOW())`,
      [work.agentId, `memory/${kind}/${id}.md`, change.content.trim(), JSON.stringify(meta), work.companyId],
    )
    return true
  }
  if (!change.id) return false
  const { rows } = await client.query<{ path: string; meta: Record<string, unknown> }>(
    `SELECT path,meta FROM agent_workspace WHERE company_id=$1 AND path LIKE $2
      AND meta->>'scopeType'=$3 AND meta->>'scopeId'=$4 FOR UPDATE`,
    [work.companyId, `memory/%/${change.id}.md`, change.scopeType, change.scopeId],
  )
  const row = rows[0]
  if (!row || row.meta?.origin !== 'synthesized' || row.meta?.pinned === true) return false
  if (change.expectedVersion !== undefined && Number(row.meta?.version ?? 1) !== change.expectedVersion) throw new Error('memory synthesis stale')
  if (change.action === 'expire') {
    await client.query(`UPDATE agent_workspace SET meta=meta||jsonb_build_object('status','expired','version',COALESCE((meta->>'version')::int,1)+1,'lastVerifiedAt',NOW()),updated_at=NOW() WHERE company_id=$1 AND path=$2`, [work.companyId, row.path])
  } else if (change.content?.trim()) {
    await client.query(
      `UPDATE agent_workspace SET body=$3,embedding=NULL,meta=meta||jsonb_build_object(
        'sourceEventIds',$4::jsonb,'confidence',$5::real,'version',COALESCE((meta->>'version')::int,1)+1,'lastVerifiedAt',NOW(),'status','active'),updated_at=NOW()
       WHERE company_id=$1 AND path=$2`,
      [work.companyId, row.path, change.content.trim(), JSON.stringify(change.sourceEventIds), confidence],
    )
  }
  return true
}

export async function applyMemorySynthesis(args: {
  work: AgentWorkItem; evidenceIds: string[]; changes: unknown; approved: boolean; confidence: number
}): Promise<{ outcome: 'committed' | 'rejected' | 'invalid' | 'stale'; changeCount: number }> {
  const rawConfidence = Number(args.confidence)
  const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0
  const changes = Array.isArray(args.changes) && args.changes.length <= 64 && args.changes.every(validChange) ? args.changes : null
  if (!changes) {
    await pool.query(`UPDATE agent_memory_evidence SET attempts=attempts+1,error='invalid synthesis output',available_at=NOW()+INTERVAL '30 seconds'
      WHERE company_id=$1 AND agent_id=$2 AND id=ANY($3::text[]) AND status='pending'`, [args.work.companyId, args.work.agentId, args.evidenceIds])
    return { outcome: 'invalid', changeCount: 0 }
  }
  const { rows: evidence } = await pool.query<{ id: string; learner_id: string; conversation_id: string }>(
    `SELECT id,learner_id,conversation_id FROM agent_memory_evidence
      WHERE company_id=$1 AND agent_id=$2 AND id=ANY($3::text[]) AND status='pending'`,
    [args.work.companyId, args.work.agentId, args.evidenceIds],
  )
  const known = new Set(evidence.map((row) => row.id))
  if (known.size !== new Set(args.evidenceIds).size || changes.some((change) => change.sourceEventIds.some((id) => !known.has(id)))) {
    return { outcome: 'invalid', changeCount: 0 }
  }
  if (!args.approved || confidence < 0.6) {
    await pool.query(`UPDATE agent_memory_evidence SET status='rejected',processed_at=NOW(),error='verification rejected synthesis'
      WHERE company_id=$1 AND agent_id=$2 AND id=ANY($3::text[])`, [args.work.companyId, args.work.agentId, args.evidenceIds])
    return { outcome: 'rejected', changeCount: 0 }
  }
  const learnerIds = new Set(evidence.map((row) => row.learner_id))
  const allowed = (change: MemorySynthesisChange) => change.scopeType === 'learner' ? learnerIds.has(change.scopeId)
    : change.scopeType === 'course' ? change.scopeId === args.work.channelId : change.scopeId === args.work.agentId
  if (changes.some((change) => !allowed(change))) return { outcome: 'invalid', changeCount: 0 }
  const client = await pool.connect()
  let count = 0
  try {
    await client.query('BEGIN')
    for (const change of changes) {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`memory:${args.work.companyId}:${change.scopeType}:${change.scopeId}`])
      if (await applyChange(client, args.work, change, confidence)) count++
    }
    await client.query(`UPDATE agent_memory_evidence SET status='processed',processed_at=NOW(),error=NULL WHERE id=ANY($1::text[])`, [args.evidenceIds])
    await client.query('COMMIT')
    return { outcome: 'committed', changeCount: count }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    if (error instanceof Error && error.message === 'memory synthesis stale') {
      await pool.query(`UPDATE agent_memory_evidence SET attempts=attempts+1,error='stale memory snapshot',available_at=NOW()+INTERVAL '5 seconds'
        WHERE company_id=$1 AND agent_id=$2 AND id=ANY($3::text[]) AND status='pending'`, [args.work.companyId, args.work.agentId, args.evidenceIds])
      return { outcome: 'stale', changeCount: 0 }
    }
    throw error
  } finally { client.release() }
}
