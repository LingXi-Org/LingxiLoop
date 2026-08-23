import { randomUUID } from 'node:crypto'
import OpenAI from 'openai'
import { runStructuredLearningAction } from '../agents/cli.js'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { wukongClient } from '../im/wukong.js'
import type { AgentWorkItem, HostAction, HostActionResult, LingxiMessageV1 } from './types.js'

const APPROVAL_REQUIRED = new Set([
  'email.send', 'email.reply',
  'computer.input', 'computer.takeover',
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

async function executeRoutine(work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
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
    const id = randomUUID()
    const { rows } = await pool.query(
      `INSERT INTO agent_routines
         (id, company_id, agent_id, channel_id, kind, title, instructions, schedule, timezone, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'paused',$3) RETURNING *`,
      [id, work.companyId, work.agentId, work.channelId, textArg(args, 'kind'), textArg(args, 'title'),
        textArg(args, 'instructions'), JSON.stringify(record(args.schedule)), textArg(args, 'timezone', false) || 'Asia/Shanghai'],
    )
    return { ok: true, value: rows[0] }
  }
  throw new Error(`unsupported routine action: ${method}`)
}

async function executePoll(work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
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

async function executeResearch(work: AgentWorkItem, method: string, args: Record<string, unknown>): Promise<HostActionResult> {
  if (method !== 'search' && method !== 'read') throw new Error(`unsupported research action: ${method}`)
  const query = method === 'search'
    ? textArg(args, 'query')
    : `Read and summarize this source for a learner, retaining dates and source attribution: ${textArg(args, 'url')}`
  const client = new OpenAI({ apiKey: env.DEEPSEEK_API_KEY, baseURL: env.DEEPSEEK_BASE_URL })
  const response = await client.chat.completions.create({
    model: env.DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: 'You are a learning research assistant. State clearly when a claim is an inference and never invent citations or pretend you browsed a source.' },
      { role: 'user', content: query },
    ],
    max_tokens: 2_000,
  })
  return { ok: true, value: { text: response.choices[0]?.message?.content ?? '', query, agentId: work.agentId } }
}

export function actionRequiresApproval(action: string): boolean { return APPROVAL_REQUIRED.has(action) }

export async function executeLearningAction(work: AgentWorkItem, action: HostAction): Promise<HostActionResult> {
  const args = record(action.args)
  const [namespace, method] = action.action.split('.')
  if (!namespace || !method) throw new Error('action must use namespace.method')
  if (namespace === 'chat') return executeChat(work, method, args, action)
  if (namespace === 'routines') return executeRoutine(work, method, args)
  if (namespace === 'polls') return executePoll(work, method, args)
  if (namespace === 'turn') return { ok: true, value: { status: method, ...args } }
  if (namespace === 'research') return executeResearch(work, method, args)
  const result = await runStructuredLearningAction(action.action, args, work.agentId, { idempotencyKey: action.idempotencyKey })
  return result.ok ? { ok: true, value: { text: result.text, sideEffects: result.sideEffects ?? [] } } : { ok: false, error: result.text }
}
