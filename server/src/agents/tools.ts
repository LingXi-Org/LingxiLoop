/**
 * Server-side tool executor — used by cli.ts (`lingxiloop react / dm /
 * pull-group / palette`) and by the legacy in-process agent loop
 * (inproc / subprocess scheduler modes). Browser-driven actions now
 * run via the in-pod `opencli` binary (Chromium under Xvfb), not
 * through here.
 *
 * Pod-mode agents DO NOT use this file. The bundle imports
 * `runtime/pod-tools.ts` instead, which dispatches only the four
 * pod-local tool kinds (bash + native FS) and skips DB logging. All
 * "actions in the world" the LLM wants to take go through bash +
 * the `lingxiloop` CLI shim, which HTTPs back to /runtime/cli and lands
 * here on the server.
 *
 * Pod-safe types + the LLM tool schema + bash / web tools live in
 * `tools-shared.ts` so they can be imported by both code paths
 * without dragging pg into the bundle.
 */

import { randomUUID } from 'node:crypto'
import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { getTrackedLlmClient } from './llm-ledger.js'
import type { FsNamespace } from './runtime/fs-namespace.js'
import { tEditFile, tReadFile, tWriteFile } from './runtime/native-tools.js'
import {
  type ToolResult,
  tBash, tSetTurnStatus,
} from './tools-shared.js'

export type { ToolResult } from './tools-shared.js'
export { TOOL_DEFS_RESPONSES } from './tools-shared.js'

/**
 * Tool definitions for the OpenAI Responses API.
 *
 * Single tool: `bash`. All other capabilities (web search, dm with another agent, pull-group,
 * react, palette, image generation, plus private state mgmt) are subcommands
 * of the `lingxiloop` CLI on PATH. Adding a new
 * capability = adding a CLI subcommand; no LLM tool definition update needed.
 */

/** Dispatch a single tool call. Logs to tool_calls table. */
export async function executeTool(args: {
  agentId: string
  name: string
  argsJson: string
  messageId?: string | null
  runId?: string | null
  companyId?: string | null
  /** Per-turn FS namespace. When provided, bash runs with cwd
   *  = ns.rootDir and the three native FS tools operate on it.
   *  Optional so other call sites (rehire, manual replay) can keep
   *  running without a namespace. */
  ns?: FsNamespace | null
  /** Internal, LingxiLoop-generated idempotency key (issue #7) — passed
   *  out-of-band from `runCli`'s trusted `internal` context, never from
   *  model/CLI-controllable args. Only consumed by `react` today. */
  idempotencyKey?: string
}): Promise<ToolResult> {
  const t0 = Date.now()
  const id = `t-${randomUUID()}`
  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(args.argsJson || '{}')
  } catch {
    parsed = {}
  }

  await pool.query(
    `INSERT INTO tool_calls (id, message_id, agent_id, name, args, status, run_id, company_id)
     VALUES ($1,$2,$3,$4,$5::jsonb,'pending',$6,$7)`,
    [id, args.messageId ?? null, args.agentId, args.name, JSON.stringify(parsed), args.runId ?? null, args.companyId ?? null],
  )

  let result: ToolResult
  try {
    switch (args.name) {
      case 'palette':            result = await tPalette(parsed, args.companyId ?? null, args.agentId); break
      case 'dm_with':            result = await tDmWith(parsed, args.agentId); break
      case 'pull_group':         result = await tPullGroup(parsed, args.agentId); break
      case 'set_turn_status':    result = tSetTurnStatus(parsed); break
      case 'shell':
      case 'bash':               result = await tBash(parsed, args.agentId, args.ns ?? null); break
      case 'react':              result = await tReact(parsed, args.agentId, args.idempotencyKey); break
      // Native FS tools — require an active per-turn namespace. Reject
      // gracefully if called outside a turn (shouldn't happen via the
      // normal LLM path; defensive).
      case 'read_file':
        result = args.ns ? await tReadFile(parsed, args.ns) : noNamespace('read_file', args.name)
        break
      case 'write_file':
        result = args.ns ? await tWriteFile(parsed, args.ns) : noNamespace('write_file', args.name)
        break
      case 'edit_file':
        result = args.ns ? await tEditFile(parsed, args.ns) : noNamespace('edit_file', args.name)
        break
      default:
        result = {
          ok: false, output: null, error: 'unknown tool',
          durationMs: Date.now() - t0,
          display: { name: args.name, arg: '', status: 'unknown tool', detail: `tool not implemented: ${args.name}` },
        }
    }
  } catch (err) {
    result = {
      ok: false, output: null, error: String(err), durationMs: Date.now() - t0,
      display: { name: args.name, arg: JSON.stringify(parsed).slice(0, 80), status: 'error', detail: String(err) },
    }
  }

  await pool.query(
    `UPDATE tool_calls
        SET result = $2::jsonb, status = $3, error = $4, duration_ms = $5
      WHERE id = $1`,
    [id, JSON.stringify(result.output ?? null), result.ok ? 'ok' : 'error', result.error ?? null, result.durationMs],
  )

  return result
}

/* ============== individual tools ============== */

// tBash lives in tools-shared.ts (pod-safe — no DB). Imported above and
// dispatched in the switch in executeTool.

async function tDmWith(args: Record<string, unknown>, instigatorId: string): Promise<ToolResult> {
  const t0 = Date.now()
  const partnerId = String(args.partner_id ?? '').trim()
  const topic = String(args.topic ?? '').trim()
  const opening = String(args.opening_message ?? '').trim()
  if (!partnerId || partnerId === instigatorId) {
    return { ok: false, output: null, error: 'invalid partner', durationMs: Date.now() - t0,
      display: { name: 'dm_with', arg: partnerId, status: 'error', detail: 'Pick a different agent', icon: 'web' } }
  }
  const { startPrivateChat } = await import('./private_chat.js')
  const result = await startPrivateChat({ instigatorId, partnerId, topic, opening })
  return {
    ok: true,
    output: { conversationId: result.conversationId, partnerId, topic },
    durationMs: Date.now() - t0,
    display: {
      name: 'dm_with', arg: `${partnerId} · ${topic.slice(0, 40)}`,
      status: `opened · ${result.conversationId.slice(0, 12)}`,
      detail: `→ "${opening.slice(0, 200)}"\n\nDirect conversation opened with ${partnerId}. Same shape as any 1-on-1 chat — your partner will see it in their mailbox and reply naturally.`,
      icon: 'web',
    },
  }
}

async function tPullGroup(args: Record<string, unknown>, instigatorId: string): Promise<ToolResult> {
  const t0 = Date.now()
  const title = String(args.title ?? '').trim().slice(0, 80) || 'untitled'
  const reason = String(args.reason ?? '').trim()
  const opening = String(args.opening_message ?? '').trim()
  const members = Array.isArray(args.members) ? (args.members as unknown[]).map((m) => String(m)).filter(Boolean) : []
  const leaderId = String(args.leader_id ?? '').trim()
  if (!leaderId) throw new Error('pull_group requires leader_id')
  // Always include the instigator. Do NOT auto-add a human — agents are
  // first-class and can pull true agent-only groups (which surface in
  // the Whispers peek tab). The agent picks who belongs based on the
  // members[] list it supplied.
  if (!members.includes(instigatorId)) members.push(instigatorId)
  const { startPulledGroup } = await import('./scanner_helper.js')
  const result = await startPulledGroup({ instigatorId, title, members, leaderId, reason, opening })
  return {
    ok: true, output: { conversationId: result.conversationId, members },
    durationMs: Date.now() - t0,
    display: {
      name: 'pull_group', arg: title,
      status: `created · ${result.conversationId.slice(0, 12)}`,
      detail: `members: ${members.join(', ')}\nreason: ${reason}\n\n→ "${opening.slice(0, 200)}"`,
      icon: 'web',
    },
  }
}

function noNamespace(toolName: string, displayName: string): ToolResult {
  const detail = `${toolName} requires an active per-turn FS namespace; called outside of a turn (or namespace failed to hydrate).`
  return {
    ok: false, output: null, error: detail, durationMs: 0,
    display: { name: displayName, arg: '', status: 'no namespace', detail, icon: 'github' },
  }
}

async function tReact(args: Record<string, unknown>, agentId: string, idempotencyKeyArg?: string): Promise<ToolResult> {
  const t0 = Date.now()
  const messageId = String(args.message_id ?? '').trim()
  const emoji = String(args.emoji ?? '').trim()
  if (!messageId || !emoji) {
    return { ok: false, output: null, error: 'message_id and emoji required', durationMs: Date.now() - t0,
      display: { name: 'react', arg: '', status: 'error', detail: 'missing args' } }
  }
  // Internal, LingxiLoop-generated idempotency key (issue #7) — arrives ONLY
  // via the out-of-band `idempotencyKeyArg` param (threaded from runCli's
  // trusted `internal` context through executeTool), never from `args`
  // (the tool's model/CLI-controllable JSON args) — so no caller can spoof
  // or collide a key across conversations.
  const idempotencyKey = idempotencyKeyArg?.trim() || null

  // reaction.toggle is NOT naturally idempotent — replaying it flips state
  // back. When an idempotency key is present, claim-and-mutate atomically
  // in ONE transaction against agent_action_executions: if the key already
  // committed as 'succeeded', return that stored result WITHOUT touching
  // message_reactions again. A crash between claim and commit rolls the
  // whole transaction back, so a retry is a clean first attempt — no
  // partial state to reconcile (issue #7 §4).
  if (idempotencyKey) {
    const replayed = await tryReplayReaction(idempotencyKey)
    if (replayed) return { ...replayed, durationMs: Date.now() - t0 }
  }

  const txClient = idempotencyKey ? await pool.connect() : null
  const q = txClient ?? pool
  try {
    if (txClient) {
      await txClient.query('BEGIN')
      // Claim the key inside this same transaction. ON CONFLICT DO NOTHING
      // means a concurrent duplicate loses the race here and falls through
      // to the replay branch below with nothing mutated.
      const { rows: claimed } = await txClient.query<{ idempotency_key: string }>(
        `INSERT INTO agent_action_executions
           (idempotency_key, agent_id, input_scope_key, action_index, action_type, action_hash, status)
         VALUES ($1, $2, '', 0, 'reaction.toggle', $3, 'pending')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, agentId, `${messageId}:${emoji}`],
      )
      if (claimed.length === 0) {
        // Lost a genuine concurrent race for the same key — someone else's
        // transaction is committing (or already committed) this exact
        // mutation. Roll back our no-op transaction and replay theirs.
        await txClient.query('ROLLBACK')
        const replayed = await tryReplayReaction(idempotencyKey!)
        if (replayed) return { ...replayed, durationMs: Date.now() - t0 }
        return { ok: false, output: null, error: 'idempotency claim lost with no replay result', durationMs: Date.now() - t0,
          display: { name: 'react', arg: `${emoji} ${messageId.slice(0, 12)}`, status: 'error', detail: 'concurrent reaction claim did not resolve' } }
      }
    }

    const { result, broadcast } = await mutateReaction(q, messageId, emoji, agentId)

    if (txClient) {
      await txClient.query(
        `UPDATE agent_action_executions SET status = 'succeeded', result_json = $2::jsonb, updated_at = NOW() WHERE idempotency_key = $1`,
        [idempotencyKey, JSON.stringify(result)],
      )
      await txClient.query('COMMIT')
    }
    // Broadcast only after the mutation (and, for the idempotent path, the
    // ledger row) has actually committed — otherwise a crash between
    // publish and COMMIT would tell WS clients about a reaction that then
    // rolled back.
    await broadcast()
    return { ...result, durationMs: Date.now() - t0 }
  } catch (e) {
    if (txClient) await txClient.query('ROLLBACK').catch(() => { /* already failed */ })
    throw e
  } finally {
    if (txClient) txClient.release()
  }
}

/** Look up a previously-succeeded reaction.toggle by idempotency key and
 *  render it back as a ToolResult, WITHOUT touching message_reactions —
 *  the mutation already happened exactly once. Returns null if no
 *  succeeded row exists yet (first attempt, or a still-pending/failed
 *  claim that the caller should attempt to (re)claim itself). */
async function tryReplayReaction(idempotencyKey: string): Promise<Omit<ToolResult, 'durationMs'> | null> {
  const { rows } = await pool.query<{ status: string; result_json: Record<string, unknown> | null }>(
    `SELECT status, result_json FROM agent_action_executions WHERE idempotency_key = $1`,
    [idempotencyKey],
  )
  const row = rows[0]
  if (!row || row.status !== 'succeeded' || !row.result_json) return null
  const output = row.result_json.output as { messageId?: string; emoji?: string; action?: string; reactions?: unknown } | undefined
  return {
    ok: true,
    output: output ?? null,
    display: {
      name: 'react',
      arg: `${output?.emoji ?? ''} ${String(output?.messageId ?? '').slice(0, 12)}`,
      status: `${output?.action ?? 'replayed'} [replayed]`,
      detail: `(replayed — this reaction was already applied on an earlier attempt)`,
      icon: 'web',
    },
  }
}

type QueryExecutor = { query: typeof pool.query }

/** The actual toggle mutation + aggregate, shared by both the idempotent
 *  (transactional) and non-idempotent (plain pool) call paths. `q` is
 *  either the pool itself or a held transaction client — every read/write
 *  here (including the aggregate used for the broadcast payload) goes
 *  through `q` so an in-flight transaction sees its own uncommitted
 *  mutation. Returns the ToolResult PLUS a `broadcast()` callback the
 *  caller must invoke only after the mutation is durably committed —
 *  publishing before commit would tell WS clients about a reaction that
 *  could still roll back. */
async function mutateReaction(
  q: QueryExecutor, messageId: string, emoji: string, agentId: string,
): Promise<{ result: Omit<ToolResult, 'durationMs'>; broadcast: () => Promise<void> }> {
  // Toggle: if already reacted with this emoji, remove; else add
  const existing = await q.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM message_reactions
      WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, agentId, emoji],
  )
  const action = Number(existing.rows[0]?.count ?? '0') > 0 ? 'removed' : 'added'
  if (action === 'removed') {
    await q.query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, agentId, emoji],
    )
  } else {
    await q.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [messageId, agentId, emoji],
    )
  }

  // Aggregate. We DON'T compute a `mine` flag server-side: this row is
  // broadcast to every WS client in the tenant, and "is this mine" is
  // recipient-specific. The renderer derives it from `users` + the local
  // user id. (Pre-fix, this query hardcoded user_id = 'yetone' — dev-seed
  // leakage that made the badge wrong for every real user.)
  const { rows: agg } = await q.query<{ emoji: string; count: number; users: string[] }>(
    `SELECT emoji,
            COUNT(*)::int AS count,
            array_agg(user_id ORDER BY user_id) AS users
       FROM message_reactions WHERE message_id = $1
       GROUP BY emoji ORDER BY count DESC, emoji ASC`,
    [messageId],
  )
  const { rows: cv } = await q.query<{ conversation_id: string; company_id: string }>(
    `SELECT m.conversation_id, c.company_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = $1`, [messageId],
  )
  const conversationId = cv[0]?.conversation_id ?? ''
  const companyId = cv[0]?.company_id

  // Do NOT advance conversation_reads here. A reaction can be a lightweight
  // acknowledgement for long work, and marking the request read before the
  // turn completes can erase unfinished tasks from the agent's inbox. The turn
  // runtime advances reads only after semantic completion is accepted.
  const broadcast = async (): Promise<void> => {
    const { CH_REACTIONS, publish } = await import('../redis.js')
    await publish(CH_REACTIONS, {
      type: 'message.reactions',
      conversationId,
      companyId,
      messageId,
      reactions: agg,
    })
  }

  return {
    result: {
      ok: true,
      output: { messageId, emoji, action, reactions: agg },
      display: {
        name: 'react',
        arg: `${emoji} ${messageId.slice(0, 12)}`,
        status: action,
        detail: emoji === '👀' && action === 'added'
          ? `${agentId} ${action} ${emoji}\n\n👀 is only an acknowledgement for long work. Continue in this same turn and choose the appropriate next step: complete the task, ask a concrete clarifying question, or report a clear failure. Only generate an image when the user clearly asked for one.`
          : `${agentId} ${action} ${emoji}`,
        icon: 'web',
      },
    },
    broadcast,
  }
}

async function tPalette(args: Record<string, unknown>, companyId: string | null, agentId: string): Promise<ToolResult> {
  const t0 = Date.now()
  const brief = String(args.brief ?? '').trim()
  const openai = await getTrackedLlmClient({
    purpose: 'palette', companyId, agentId,
    extras: { brief: brief.slice(0, 120) },
  })
  const r = await openai.responses.create({
    // Palette is a tiny JSON-only utility: 5 hex codes, no reasoning required.
    // Route through the cerebellum (support) model, not the agent's brain.
    model: env.OPENAI_MODEL_SUPPORT,
    instructions: 'You produce 5-color hex palettes. Reply ONLY with JSON: {"colors":["#RRGGBB", ...]}. No prose.',
    input: `Design brief: ${brief}\n\nReply with JSON only.`,
    text: { format: { type: 'json_object' } },
    max_output_tokens: 800,
    reasoning: { effort: 'low' },
  })
  const text = r.output_text ?? '{}'
  let colors: string[] = []
  try {
    const parsed = JSON.parse(text) as { colors?: string[] }
    colors = (parsed.colors ?? []).filter((c) => /^#[0-9A-Fa-f]{6}$/.test(c)).slice(0, 5)
  } catch { /* ignore */ }
  return {
    ok: colors.length > 0,
    output: { colors, brief },
    durationMs: Date.now() - t0,
    display: {
      name: 'palette', arg: brief.slice(0, 60),
      status: `${colors.length} colors`,
      detail: colors.join('  '),
      icon: 'figma',
    },
  }
}
