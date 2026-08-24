import { createHash, randomUUID } from 'node:crypto'
import { runStructuredLearningAction } from '../agents/cli.js'
import { pool } from '../db/pool.js'
import { wukongClient } from '../im/wukong.js'
import {
  addCanvasWorkspaceAgents,
  appendCanvasFrameContent,
  createCanvasFrame,
  deleteCanvasFrame,
  getCanvasSnapshot,
  handoffCanvasWork,
  listCanvasAvailableAgents,
  setCanvasStatus,
  startCanvasWorkspace,
  updateCanvasFrame,
  type CanvasMemberInput,
} from '../canvas/service.js'
import { readResearch, searchResearch } from './research.js'
import { recallMemories, verifyExplicitMemory, writeExplicitMemory } from './memory-service.js'
import type { AgentWorkItem, HostAction, HostActionResult, LingxiMessageV1, MemoryScopeType } from './types.js'

const APPROVAL_REQUIRED = new Set([
  'email.send', 'email.reply',
  'routines.create', 'routines.activate',
  'documents.delete', 'boards.delete', 'calendar.delete',
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textArg(args: Record<string, unknown>, name: string, required = true): string {
  const value = typeof args[name] === 'string' ? args[name].trim() : ''
  if (required && !value) throw new Error(`${name} is required`)
  return value
}

async function executeChat(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  if (method === 'history') {
    const messages = await wukongClient().syncMessages(textArg(args, 'channelId', false) || work.channelId, Number(args.channelType ?? 2), Number(args.limit ?? 50), work.agentId)
    return { ok: true, value: messages }
  }
  if (method === 'send') {
    const body = textArg(args, 'body')
    const channelId = textArg(args, 'channelId', false) || work.channelId
    const payload: LingxiMessageV1 = {
      version: 1, kind: 'text', clientMsgNo: `action-${action.idempotencyKey}`, body,
      ...(typeof args.replyToClientMsgNo === 'string' ? { replyToClientMsgNo: args.replyToClientMsgNo } : {}),
      refs: { runId: action.runId, agentId: work.agentId },
    }
    return { ok: true, value: await wukongClient().sendMessage(channelId, Number(args.channelType ?? 2), work.agentId, payload) }
  }
  if (method === 'handoff') {
    const targetAgentId = textArg(args, 'toAgentId')
    const payload: LingxiMessageV1 = {
      version: 1, kind: 'handoff', clientMsgNo: `handoff-${action.idempotencyKey}`,
      body: textArg(args, 'note', false),
      refs: { runId: action.runId, fromAgentId: work.agentId, toAgentId: targetAgentId },
      data: { title: textArg(args, 'title'), status: 'pending' },
    }
    const sent = await wukongClient().sendMessage(work.channelId, Number(args.channelType ?? 2), work.agentId, payload)
    await pool.query(
      `INSERT INTO agent_work_items
         (id, company_id, agent_id, channel_id, thread_root_client_msg_no, trigger_client_msg_no, reason, priority)
       VALUES ($1,$2,$3,$4,$5,$6,'handoff',150)
       ON CONFLICT (agent_id, trigger_client_msg_no, reason) DO NOTHING`,
      [randomUUID(), work.companyId, targetAgentId, work.channelId, payload.clientMsgNo, payload.clientMsgNo],
    )
    return { ok: true, value: sent }
  }
  if (method === 'react') throw new Error('reactions are sent by the WuKong client SDK and are not a host-side chat action')
  throw new Error(`unsupported chat action: ${method}`)
}

function stableId(prefix: string, key: string): string {
  return `${prefix}-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`
}

async function executeRoutine(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  if (method === 'list') {
    const { rows } = await pool.query(`SELECT * FROM agent_routines WHERE company_id=$1 AND agent_id=$2 ORDER BY created_at DESC`, [work.companyId, work.agentId])
    return { ok: true, value: rows }
  }
  if (method === 'pause' || method === 'activate') {
    const { rows } = await pool.query(
      `UPDATE agent_routines SET status=$1, updated_at=NOW() WHERE id=$2 AND company_id=$3 AND agent_id=$4 RETURNING *`,
      [method === 'pause' ? 'paused' : 'active', textArg(args, 'routineId'), work.companyId, work.agentId],
    )
    if (!rows[0]) throw new Error('routine not found')
    return { ok: true, value: rows[0] }
  }
  if (method === 'create') {
    const id = stableId('routine', action.idempotencyKey)
    const { rows } = await pool.query(
      `INSERT INTO agent_routines
         (id, company_id, agent_id, channel_id, kind, title, instructions, schedule, timezone, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'paused',$3)
       ON CONFLICT (id) DO UPDATE SET updated_at=agent_routines.updated_at RETURNING *`,
      [id, work.companyId, work.agentId, work.channelId, textArg(args, 'kind'), textArg(args, 'title'),
        textArg(args, 'instructions'), JSON.stringify(record(args.schedule)), textArg(args, 'timezone', false) || 'Asia/Shanghai'],
    )
    return { ok: true, value: rows[0] }
  }
  throw new Error(`unsupported routine action: ${method}`)
}

async function executePoll(work: AgentWorkItem, method: string, args: Record<string, unknown>, action: HostAction): Promise<HostActionResult> {
  const { castVote, closePoll, createPoll } = await import('../polls.js')
  if (method === 'create') {
    const rawOptions = Array.isArray(args.options) ? args.options.map(String) : []
    return {
      ok: true,
      value: await createPoll({
        conversationId: textArg(args, 'channelId', false) || work.channelId,
        companyId: work.companyId,
        authorId: work.agentId,
        question: textArg(args, 'question'),
        mode: args.mode === 'multi' ? 'multi' : 'single',
        options: rawOptions,
        expiresInMinutes: typeof args.expiresInMinutes === 'number' ? args.expiresInMinutes : null,
        idempotencyKey: action.idempotencyKey,
      }),
    }
  }
  const messageId = textArg(args, 'messageId')
  if (method === 'vote') {
    const optionIds = Array.isArray(args.optionIds) ? args.optionIds.map(String) : []
    return {
      ok: true,
      value: await castVote({
        messageId, companyId: work.companyId, voterParticipantId: work.agentId,
        voterKind: 'agent', optionIds,
      }),
    }
  }
  if (method === 'close') return { ok: true, value: await closePoll({ messageId, companyId: work.companyId, actorId: work.agentId, reason: 'manual' }) }
  if (method === 'show') {
    const { rows } = await pool.query(
      `SELECT p.*, COALESCE(v.tallies, '[]'::jsonb) AS tallies
         FROM im_polls p
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(jsonb_build_object('optionId', option_id, 'count', count, 'voterIds', voter_ids)) AS tallies
             FROM (SELECT option_id, COUNT(*)::int AS count,
                          array_agg(voter_participant_id ORDER BY voter_participant_id) AS voter_ids
                     FROM im_poll_votes WHERE poll_client_msg_no=p.poll_client_msg_no GROUP BY option_id) x
         ) v ON TRUE
        WHERE p.poll_client_msg_no=$1 AND p.company_id=$2`,
      [messageId, work.companyId],
    )
    if (!rows[0]) throw new Error('poll not found')
    return { ok: true, value: rows[0] }
  }
  throw new Error(`unsupported poll action: ${method}`)
}

async function executeResearch(_work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
  if (method === 'search') return { ok: true, value: await searchResearch(textArg(args, 'query'), Number(args.limit ?? 8)) }
  if (method === 'read') return { ok: true, value: await readResearch(textArg(args, 'url')) }
  throw new Error(`unsupported research action: ${method}`)
}

async function executeCanvas(
  work: AgentWorkItem,
  method: string,
  args: Record<string, unknown>,
  action: HostAction,
): Promise<HostActionResult> {
  const canvasId = textArg(args, 'canvasId', false) || work.canvasId
  const members = (): CanvasMemberInput[] => {
    if (!Array.isArray(args.members)) throw new Error('members must be an array')
    return args.members.map((raw) => {
      const member = record(raw)
      return {
        agentId: textArg(member, 'agentId'), assignment: textArg(member, 'assignment'),
        ...(Array.isArray(member.dependsOnAgentIds) ? { dependsOnAgentIds: member.dependsOnAgentIds.map(String) } : {}),
      }
    })
  }
  if (method === 'available_agents') return { ok: true, value: await listCanvasAvailableAgents(work.companyId) }
  if (method === 'start_workspace') {
    const snapshot = await startCanvasWorkspace({
      companyId: work.companyId, initiatorAgentId: work.agentId, conversationId: work.channelId,
      triggerClientMsgNo: work.triggerClientMsgNo, title: textArg(args, 'title'), goal: textArg(args, 'goal'),
      members: members(), idempotencyKey: action.idempotencyKey,
    })
    const card: LingxiMessageV1 = {
      version: 1, kind: 'canvas', clientMsgNo: `canvas-card-${snapshot.id}`,
      body: snapshot.title, refs: { canvasId: snapshot.id, runId: action.runId, agentId: work.agentId },
      data: { canvasId: snapshot.id, title: snapshot.title, goal: snapshot.goal, status: snapshot.status,
        members: snapshot.assignments.map((item) => ({ agentId: item.agentId, assignment: item.assignment, color: item.color, status: item.status })),
        frameCount: 0, suppressAgentWake: true },
    }
    const { rows: bindings } = await pool.query<{ profile: Record<string, unknown> }>(
      `SELECT profile FROM im_channel_bindings WHERE channel_id=$1 AND company_id=$2`, [work.channelId, work.companyId],
    )
    await wukongClient().sendMessage(work.channelId, Number(bindings[0]?.profile?.channelType ?? 2), work.agentId, card).catch(() => undefined)
    return { ok: true, value: snapshot, directive: { type: 'defer_to_canvas', canvasId: snapshot.id } }
  }
  if (method === 'add_agents') {
    if (!canvasId) throw new Error('canvasId is required')
    return { ok: true, value: await addCanvasWorkspaceAgents({ companyId: work.companyId, canvasId, actorId: work.agentId, members: members() }) }
  }
  if (method === 'get') {
    return { ok: true, value: await getCanvasSnapshot(work.companyId, work.agentId, canvasId) }
  }
  if (method === 'handoff') {
    if (!canvasId) throw new Error('canvasId is required for a Canvas handoff')
    const frameIds = Array.isArray(args.frameIds) ? args.frameIds.map(String) : []
    return {
      ok: true,
      value: await handoffCanvasWork({
        companyId: work.companyId,
        canvasId,
        fromAgentId: work.agentId,
        toAgentId: textArg(args, 'toAgentId'),
        task: textArg(args, 'task'),
        context: textArg(args, 'context', false),
        frameIds,
        idempotencyKey: action.idempotencyKey,
      }),
    }
  }
  if (method === 'create_frame') {
    if (!canvasId) throw new Error('canvasId is required for task Canvas frames')
    return {
      ok: true,
      value: await createCanvasFrame({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent',
        idempotencyKey: action.idempotencyKey, canvasId, frame: args,
      }),
    }
  }
  if (method === 'set_status') {
    return {
      ok: true,
      value: await setCanvasStatus({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent',
        canvasId, status: textArg(args, 'status'), frameId: typeof args.frameId === 'string' ? args.frameId : null,
      }),
    }
  }
  const frameId = textArg(args, 'frameId')
  if (method === 'update_frame') {
    const { frameId: _frameId, ...patch } = args
    return {
      ok: true,
      value: await updateCanvasFrame({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent', frameId, patch,
      }),
    }
  }
  if (method === 'append_content') {
    return {
      ok: true,
      value: await appendCanvasFrameContent({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent', frameId,
        content: textArg(args, 'content'),
      }),
    }
  }
  if (method === 'delete_frame') {
    return {
      ok: true,
      value: await deleteCanvasFrame({
        companyId: work.companyId, actorId: work.agentId, actorKind: 'agent', frameId,
      }),
    }
  }
  throw new Error(`unsupported canvas action: ${method}`)
}

export function actionRequiresApproval(action: string): boolean { return APPROVAL_REQUIRED.has(action) }

export async function executeLearningAction(work: AgentWorkItem, action: HostAction): Promise<HostActionResult> {
  const args = record(action.args)
  const [namespace, method] = action.action.split('.')
  if (!namespace || !method) throw new Error('action must use namespace.method')
  if (namespace === 'chat') return executeChat(work, method, args, action)
  if (namespace === 'routines') return executeRoutine(work, method, args, action)
  if (namespace === 'polls') return executePoll(work, method, args, action)
  if (namespace === 'turn') return { ok: true, value: { status: method, ...args } }
  if (namespace === 'research') return executeResearch(work, method, args)
  if (namespace === 'canvas') return executeCanvas(work, method, args, action)
  if (namespace === 'memory') {
    const rawScope = String(args.scope ?? 'course')
    const scopeType: MemoryScopeType = rawScope === 'learner' || rawScope === 'agent_role' ? rawScope : 'course'
    const scopeId = scopeType === 'course' ? work.channelId : scopeType === 'agent_role' ? work.agentId : textArg(args, 'learnerId')
    if (scopeType === 'learner') {
      const { rows } = await pool.query(
        `SELECT 1 FROM participants p JOIN im_channel_bindings b ON b.company_id=p.company_id
          WHERE p.id=$1 AND p.company_id=$2 AND p.kind='human' AND b.channel_id=$3 AND b.profile->'members' ? p.id`,
        [scopeId, work.companyId, work.channelId],
      )
      if (!rows[0]) throw new Error('learnerId is not a human member of this learning conversation')
    }
    if (method === 'recall' || method === 'list') return { ok: true, value: await recallMemories({
      companyId: work.companyId, agentId: work.agentId, scopeType, scopeId,
      query: typeof args.query === 'string' ? args.query : '', limit: Number(args.limit ?? 12), conversationId: work.channelId,
    }) }
    if (method === 'note') return { ok: true, value: await writeExplicitMemory({
      companyId: work.companyId, agentId: work.agentId, scopeType, scopeId,
      body: textArg(args, 'body'), kind: typeof args.kind === 'string' ? args.kind : undefined,
      sourceEventId: work.triggerClientMsgNo,
    }) }
    if (method === 'verify') return { ok: true, value: {
      verified: await verifyExplicitMemory({ companyId: work.companyId, id: textArg(args, 'id') }),
    } }
    throw new Error(`unsupported memory action: ${method}`)
  }
  const result = await runStructuredLearningAction(action.action, args, work.agentId, { idempotencyKey: action.idempotencyKey })
  return result.ok ? { ok: true, value: { text: result.text, sideEffects: result.sideEffects ?? [] } } : { ok: false, error: result.text }
}
