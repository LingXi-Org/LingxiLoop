/**
 * LingxiLoop CLI — programmatic introspection of the entire app.
 *
 * The same surface is callable two ways:
 *   1. By agents via the `cli` tool: `cli({command: "groups --as iris"})`
 *   2. By humans via `npx tsx server/src/cli-bin.ts ...`
 *
 * Output is plain text (agent-friendly, like reading `man`). Pass `--json`
 * for structured output if the agent wants to parse fields.
 */

import { pool } from '../db/pool.js'
import { env } from '../env.js'
import { parseMentions } from '../mentions.js'
import { freshenAttachmentUrl, type StoredAttachment, storage, storageKeyFromPublicUrl } from '../storage.js'
import {
  clearAgentChannelUnread,
  clearAllAgentUnread,
  getAgentChannelHistory,
  getAgentInbox,
  searchAgentMessages,
  sendAgentChannelMessage,
  toggleAgentChannelReaction,
} from '../im/public.js'
import type { CliResult, CliSideEffect } from './cli-result.js'
import { createHandoff, requestApproval, updateHandoff, upsertAutonomyRule } from './coworker.js'
import { stripLoneSurrogates } from './text-safety.js'
import { createBoardCommands } from './cli/board.js'
import { createCalendarCommand } from './cli/calendar.js'
import { createConversationDeliveryCommands } from './cli/conversation-delivery.js'
import { createConversationMetadataCommands } from './cli/conversation-metadata.js'
import { createEmailCommand } from './cli/email.js'
import { createHelpCommand } from './cli/help.js'
import { createDocumentCommand } from './cli/document.js'
import { createParticipantDirectoryCommands } from './cli/participant-directory.js'

// Every CLI result flows through ok()/err(), so scrubbing lone UTF-16 surrogates
// here means CLI output (read by agents as tool results) can never carry a split
// emoji into a model transcript — the single chokepoint that covers all the
// body.slice(0, N) truncations below. See text-safety.ts.
function ok(text: string, sideEffects?: CliSideEffect[]): CliResult {
  text = stripLoneSurrogates(text)
  return sideEffects && sideEffects.length > 0
    ? { ok: true, text, exitCode: 0, sideEffects }
    : { ok: true, text, exitCode: 0 }
}
function err(text: string, code = 1): CliResult {
  return { ok: false, text: stripLoneSurrogates(text), exitCode: code }
}

/** Look up an agent's tenant. Used by anything that writes per-agent
 *  data tied to a workspace (`agent_workspace`, etc.) — without this,
 *  rows land with NULL `company_id` and the Observability view (which
 *  filters by the user's active company) can't see them.
 *
 *  Agent ids are globally unique (partial unique index on
 *  `participants(id) WHERE kind='agent'` + server-side slugify on
 *  /agents POST), so id-only lookup returns the single correct row. */
async function agentCompany(agentId: string): Promise<string> {
  const { rows } = await pool.query<{ company_id: string | null }>(
    `SELECT company_id FROM participants WHERE id = $1 LIMIT 1`, [agentId],
  )
  const companyId = rows[0]?.company_id
  if (!companyId) throw new Error(`agent ${agentId} has no company`)
  return companyId
}

/* ============== argv parsing ============== */

import { type ParsedArgs, parseArgs, tokenize, unescapeChat } from './cli-parse.js'

export { tokenize }

// resolveAs lives in ./cli-identity for test-isolation (zero-side-effect
// import). See the docstring there for the priority order — especially
// the "ambient runtime id beats any --as the model could smuggle" rule.
import { resolveAs } from './cli-identity.js'
import type { WorklogEntry, WorkTaskType } from './work-claims.js'
/* ============== Worklog plumbing ==============
 *
 * Heavy agent-runtime actions (browser research, document creation, image
 * generation) stake a tenant-scoped claim before doing the work so peer agents
 * who would otherwise duplicate the call yield instead. The claim
 * lives in Redis and auto-expires; releaseWork() in a finally block
 * cleans up on success or known failure.
 *
 * Redis coordination is required. Claim failures reject the command so
 * duplicate work cannot be admitted through an alternate path.
 */
import { workClaims as worklogClient } from './work-claims.js'
import { clearHold, consumeHold, getSeen, recordHold, recordSeen } from './seen-boundary.js'

function tenantScopeKey(companyId: string): string {
  return `tenant:${companyId}`
}

/** Build the descriptive "someone else is doing this" error string. */
function duplicateWorkErrorMessage(existing: WorklogEntry): string {
  const ageSec = Math.max(1, Math.round((Date.now() - existing.startedAt) / 1000))
  return (
    `${existing.agentId} started ${existing.taskType} on "${existing.subject}" ${ageSec}s ago — ` +
    `don't duplicate. Wait for them to finish (claims auto-expire after 5 min if they stall), ` +
    `or react on the relevant message and step back. If your angle is genuinely different from theirs, ` +
    `rephrase your subject distinctly enough that the system sees it as a separate request.`
  )
}

/** Try to take a tenant-scoped worklog claim. Returns null if the
 *  claim was accepted (caller should proceed and release at the end);
 *  returns a CliResult error if a peer already holds it (caller
 *  should propagate the error verbatim). */
async function tryClaimTenantWork(
  companyId: string,
  agentId: string,
  taskType: WorkTaskType,
  subject: string,
): Promise<CliResult | null> {
  const r = await worklogClient.claimWork({
    scopeKey: tenantScopeKey(companyId),
    agentId,
    taskType,
    subject,
  })
  if (r.accepted) return null
  return err(duplicateWorkErrorMessage(r.existing))
}

async function releaseTenantWork(
  companyId: string,
  agentId: string,
  taskType: WorkTaskType,
  subject: string,
): Promise<void> {
  await worklogClient.releaseWork({
    scopeKey: tenantScopeKey(companyId),
    agentId,
    taskType,
    subject,
  })
}

/** One-line, agent-readable summary of an attachment. */
function renderAttachment(att: StoredAttachment | null | undefined): string | null {
  if (!att) return null
  const size = typeof att.size === 'number' ? ` ${att.size}B` : ''
  return `    ↳ [${att.kind}] ${att.name}${size} → ${att.url}`
}

function attachmentFromImData(companyId: string, data: Record<string, unknown> | undefined): StoredAttachment | null {
  if (!data) return null
  const kind = ['img', 'pdf', 'file', 'fig'].includes(String(data.kind))
    ? data.kind as StoredAttachment['kind']
    : null
  const name = typeof data.name === 'string' ? data.name : null
  const key = typeof data.key === 'string' ? data.key : null
  if (!kind || !name || !key?.startsWith(`attachments/${companyId}/`)) return null
  return {
    kind,
    name,
    key,
    url: typeof data.url === 'string' ? data.url : '',
    ...(typeof data.mime === 'string' ? { mime: data.mime } : {}),
    ...(typeof data.size === 'number' ? { size: data.size } : {}),
  }
}

function imTimestamp(timestamp: number): string {
  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000
  return new Date(milliseconds).toISOString()
}

/* ============== commands ============== */

const cmdHelp = createHelpCommand(ok)
const { cmdParticipants, cmdStatus, cmdWhoami } = createParticipantDirectoryCommands({ ok, err })

async function cmdConversations(parsed: ParsedArgs, kindFilter?: 'group' | 'direct'): Promise<CliResult> {
  const me = resolveAs(parsed)
  const params: unknown[] = [me]
  let kindWhere = ''
  if (kindFilter) {
    params.push(kindFilter)
    kindWhere = `AND kind = $2`
  }
  const { rows } = await pool.query<{
    id: string; kind: string; title: string; subtitle: string | null;
    members: string[]; tag: string | null;
    updated_at: string; pulled_by: { agentId?: string } | null
  }>(
    `SELECT id, kind, title, subtitle, members, tag, updated_at, pulled_by
       FROM conversations
      WHERE members @> to_jsonb(ARRAY[$1::text]) ${kindWhere}
      ORDER BY updated_at DESC`,
    params,
  )
  if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
  if (rows.length === 0) return ok(`(no conversations for ${me})`)

  const lines = [
    `${me} is in ${rows.length} conversation(s):`,
    ``,
    `id                          kind     title                                       members`,
    `------------------------------------------------------------------------------------------------`,
    ...rows.map((r) => {
      const tag = r.tag ? ` [${r.tag}]` : ''
      const pulled = r.pulled_by?.agentId ? ` ← pulled by ${r.pulled_by.agentId}` : ''
      return `${r.id.padEnd(28)} ${r.kind.padEnd(8)} ${r.title.slice(0, 42).padEnd(42)} ${r.members.join(',')}${tag}${pulled}`
    }),
  ]
  return ok(lines.join('\n'))
}

async function cmdMembers(parsed: ParsedArgs): Promise<CliResult> {
  const id = parsed.positional[0]
  if (!id) return err('usage: members <conversation_id>')
  const { rows } = await pool.query<{ members: string[] }>(
    `SELECT members FROM conversations WHERE id = $1`,
    [id],
  )
  if (!rows[0]) return err(`unknown conversation: ${id}`)
  const memberIds = rows[0].members
  const { rows: peeps } = await pool.query<{
    id: string; name: string; kind: string; role: string | null; status: string
  }>(
    `SELECT id, name, kind, role, status FROM participants WHERE id = ANY($1::text[])`,
    [memberIds],
  )
  if (parsed.flags.json) return ok(JSON.stringify(peeps, null, 2))
  const memberLines: string[] = []
  for (const p of peeps) {
    memberLines.push(`  · ${p.id.padEnd(12)} ${p.kind.padEnd(6)} ${p.status.padEnd(10)} ${p.name}${p.role ? ` (${p.role})` : ''}`)
  }
  const lines = [
    `${id} has ${peeps.length} member(s):`,
    ``,
    ...memberLines,
  ]
  return ok(lines.join('\n'))
}

async function cmdMessages(parsed: ParsedArgs): Promise<CliResult> {
  const id = parsed.positional[0]
  if (!id) return err('usage: messages <conversation_id> [--tail N] [--thread <root_id>]')
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  const tail = Math.min(200, Math.max(1, Number(parsed.flags.tail ?? 20)))
  // `--thread <root_id>` filters to direct replies of one message. Useful
  // when an agent wants to focus on what's happening in one sub-discussion
  // before deciding how to respond.
  const threadRootId = parsed.flags.thread ? String(parsed.flags.thread) : null
  const authoritative = await getAgentChannelHistory({ companyId, agentId: me, channelId: id, limit: 200 })
  if (!authoritative) return err(`unknown authoritative channel ${id}`)
  const ordered = [...authoritative].sort((left, right) => left.messageSeq - right.messageSeq)
  const threadRoot = threadRootId
    ? ordered.find((message) => message.messageId === threadRootId || message.clientMsgNo === threadRootId)
    : undefined
  const threadTargets = new Set([
    threadRootId,
    threadRoot?.messageId,
    threadRoot?.clientMsgNo,
  ].filter((value): value is string => Boolean(value)))
  const selected = ordered
    .filter((message) => !threadRootId || threadTargets.has(message.payload.replyToClientMsgNo ?? ''))
    .slice(-tail)
  const authorIds = [...new Set(ordered.map((message) => message.fromUid))]
  const { rows: authors } = authorIds.length > 0
    ? await pool.query<{ id: string; name: string }>(
      `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
      [companyId, authorIds],
    )
    : { rows: [] }
  const authorNames = new Map(authors.map((author) => [author.id, author.name]))
  const inOrder = await Promise.all(selected.map(async (message) => {
    const quotedId = message.payload.replyToClientMsgNo ?? null
    const quotedMessage = quotedId
      ? ordered.find((candidate) => candidate.messageId === quotedId || candidate.clientMsgNo === quotedId)
      : undefined
    const attachment = attachmentFromImData(companyId, message.payload.data)
    return {
      id: message.messageId,
      author_id: message.fromUid,
      author_name: authorNames.get(message.fromUid) ?? message.fromUid,
      kind: message.payload.kind,
      body: message.payload.body ?? '',
      sequence: message.messageSeq,
      created_at: imTimestamp(message.timestamp),
      attachment: attachment ? await freshenAttachmentUrl(attachment) : null,
      poll: message.payload.data?.poll as InboxPollPayload | undefined ?? null,
      quoted_message_id: quotedId,
      quoted: quotedMessage ? {
        id: quotedMessage.messageId,
        authorId: quotedMessage.fromUid,
        authorName: authorNames.get(quotedMessage.fromUid) ?? quotedMessage.fromUid,
        body: quotedMessage.payload.body ?? '',
      } : null,
    }
  }))
  // Advance the Redis "seen" boundary — `lingxiloop messages` just showed
  // the agent these rows, so the highest seq here counts as "what I've
  // seen" for the freshness preflight on its next `lingxiloop reply`. Without
  // this, the agent's typical flow `messages → reply` would HOLD on the
  // very tail it just fetched. Redis coordination is monotonic and required.
  if (inOrder.length > 0) {
    await recordSeen(me, id, inOrder[inOrder.length - 1].sequence)
  }
  if (parsed.flags.json) return ok(JSON.stringify(inOrder, null, 2))
  if (inOrder.length === 0) {
    return ok(threadRootId
      ? `(no replies in thread ${threadRootId})`
      : `(no messages in ${id})`)
  }
  const header = threadRootId
    ? `${inOrder.length} reply(ies) in thread ${threadRootId}:`
    : `last ${inOrder.length} message(s) in ${id}:`
  const lines = [header, '']
  for (const m of inOrder) {
    const t = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const body = m.body.slice(0, 280).replace(/\n/g, ' \\n ')
    lines.push(`  [${m.id}] [${t}] ${m.author_id.padEnd(8)} #${String(m.sequence).padStart(3, ' ')}  ${body}`)
    if (m.quoted_message_id) {
      if (m.quoted) {
        const qBody = m.quoted.body.slice(0, 180).replace(/\n/g, ' \\n ')
        lines.push(`    ↩ quoting [${m.quoted.id}] ${m.quoted.authorName}: ${qBody}`)
      } else {
        lines.push(`    ↩ quoting [${m.quoted_message_id}] (original deleted)`)
      }
    }
    if (m.kind === 'poll' && m.poll) {
      for (const line of renderPollBlock(m.id, m.poll)) lines.push(line)
    }
    const att = renderAttachment(m.attachment)
    if (att) lines.push(att)
  }
  return ok(lines.join('\n'))
}

/** `lingxiloop thread <convo_id> <root_msg_id> [--tail N]`
 *  Sugar around `messages <convo> --thread <root>`. Lists every direct
 *  reply to a single root in order, so an agent can catch up on a
 *  sub-discussion before deciding whether to chime in. */
async function cmdThread(parsed: ParsedArgs): Promise<CliResult> {
  const convoId = parsed.positional[0]
  const rootId = parsed.positional[1]
  if (!convoId || !rootId) return err('usage: thread <convo_id> <root_msg_id> [--tail N]')
  // Delegate to cmdMessages with --thread filled in. We mutate `parsed` in
  // place since this command does nothing else; cleaner than reimplementing
  // the same SELECT-with-quoted projection a second time.
  const proxied: ParsedArgs = {
    positional: [convoId],
    flags: { ...parsed.flags, thread: rootId },
  }
  return cmdMessages(proxied)
}

async function cmdConvening(parsed: ParsedArgs): Promise<CliResult> {
  const id = parsed.positional[0]
  if (!id) return err('usage: convening <conversation_id>')
  const { rows } = await pool.query<{
    pulled_by_id: string; pulled_at: string; headline_lead: string; headline_tail: string;
    subhead: string; who_and_why: unknown; reasoning: unknown; status: string
  }>(
    `SELECT pulled_by_id, pulled_at, headline_lead, headline_tail, subhead,
            who_and_why, reasoning, status
       FROM convening_info WHERE conversation_id = $1`,
    [id],
  )
  const c = rows[0]
  if (!c) return err(`no convening info for ${id}`)
  if (parsed.flags.json) return ok(JSON.stringify(c, null, 2))
  const reasoning = Array.isArray(c.reasoning) ? c.reasoning.map((r, i) => `  ${i + 1}. ${r}`).join('\n') : ''
  const who = Array.isArray(c.who_and_why)
    ? (c.who_and_why as Array<{ pid: string; reason: string }>).map((w) => `  · ${w.pid}${w.reason ? ` — ${w.reason}` : ''}`).join('\n')
    : ''
  return ok([
    `headline:    ${c.headline_lead}${c.headline_tail ? ' ' + c.headline_tail : ''}`,
    `subhead:     ${c.subhead}`,
    `pulled by:   ${c.pulled_by_id}`,
    `pulled at:   ${c.pulled_at}`,
    `status:      ${c.status}`,
    '',
    `who & why:`,
    who,
    '',
    `reasoning:`,
    reasoning,
  ].join('\n'))
}

async function cmdSearch(parsed: ParsedArgs): Promise<CliResult> {
  const query = parsed.positional[0]
  if (!query) return err('usage: search <query> [--in <convo_id>] [--limit N]')
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  const inConvo = parsed.flags.in ? String(parsed.flags.in) : null
  const limit = Math.min(50, Math.max(1, Number(parsed.flags.limit ?? 10)))
  const matches = await searchAgentMessages({
    companyId,
    agentId: me,
    query,
    ...(inConvo ? { channelId: inConvo } : {}),
    limit,
  })
  const authorIds = [...new Set(matches.map((match) => match.message.fromUid))]
  const { rows: authors } = authorIds.length > 0
    ? await pool.query<{ id: string; name: string }>(
      `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
      [companyId, authorIds],
    )
    : { rows: [] }
  const names = new Map(authors.map((author) => [author.id, author.name]))
  const rows = matches.map((match) => ({
    id: match.message.messageId,
    conversation_id: match.channelId,
    conversation_title: match.title,
    author_id: match.message.fromUid,
    author_name: names.get(match.message.fromUid) ?? match.message.fromUid,
    body: match.message.payload.body ?? '',
    created_at: imTimestamp(match.message.timestamp),
  }))
  if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
  if (rows.length === 0) return ok(`(no matches for "${query}"${inConvo ? ` in ${inConvo}` : ''})`)
  const lines = [`${rows.length} match(es) for "${query}":`, '']
  for (const m of rows) {
    const t = new Date(m.created_at).toLocaleString()
    const idx = m.body.toLowerCase().indexOf(query.toLowerCase())
    const slice = m.body.slice(Math.max(0, idx - 20), idx + 100).replace(/\n/g, ' \\n ')
    lines.push(`  · [${t}] ${m.conversation_id} ${m.author_id}: …${slice}…`)
  }
  return ok(lines.join('\n'))
}

async function cmdToolsLog(parsed: ParsedArgs): Promise<CliResult> {
  const agent = parsed.flags.agent ? String(parsed.flags.agent) : null
  const limit = Math.min(50, Math.max(1, Number(parsed.flags.limit ?? 15)))
  const params: unknown[] = []
  let where = ''
  if (agent) { params.push(agent); where = `WHERE agent_id = $1` }
  params.push(limit)
  const limitParam = `$${params.length}`
  const { rows } = await pool.query<{
    id: string; agent_id: string; name: string; status: string; duration_ms: number | null;
    args: unknown; created_at: string
  }>(
    `SELECT id, agent_id, name, status, duration_ms, args, created_at
       FROM tool_calls ${where}
       ORDER BY created_at DESC LIMIT ${limitParam}`,
    params,
  )
  if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
  if (rows.length === 0) return ok(`(no tool calls)`)
  return ok([
    `last ${rows.length} tool call(s):`,
    '',
    ...rows.map((r) => {
      const t = new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const argsBrief = JSON.stringify(r.args).slice(0, 100)
      return `  [${t}] ${r.agent_id.padEnd(8)} ${r.name.padEnd(22)} ${r.status.padEnd(7)} ${r.duration_ms ?? '-'}ms  ${argsBrief}`
    }),
  ].join('\n'))
}

/* ============== mailbox: inbox / ack / reply ============== */

import { createHash, randomUUID } from 'node:crypto'

interface InboxQuotedSummary {
  id: string
  authorId: string
  authorName: string
  kind: string
  body: string
  sequence: number
}

interface InboxItem {
  id: string
  conversation_id: string
  conversation_title: string
  conversation_kind: string
  conversation_topic: string | null
  author_id: string
  author_name: string
  body: string
  kind: string
  sequence: number
  created_at: string
  attachment: StoredAttachment | null
  poll: InboxPollPayload | null
  quoted_message_id: string | null
  quoted: InboxQuotedSummary | null
}

interface InboxPollPayload {
  question: string
  mode: 'single' | 'multi'
  options: Array<{ id: string; text: string }>
  expiresAt: string | null
  closedAt: string | null
  closedReason: 'expired' | 'manual' | null
}

/** Render a poll message as a multi-line block that gives the agent
 *  every fact it needs to vote in one read: the question, the option ids
 *  (so it can pick one without a second roundtrip), the mode, the
 *  open/closed/expired state, and the exact `lingxiloop poll vote` line to
 *  copy-paste. Without this, polls look like a plain text message with
 *  a 📊 prefix and the agent has no idea options exist.
 *
 *  Indented to match the surrounding `[id] hh:mm author: body` rows so
 *  it lines up visually inside both `lingxiloop inbox` and `lingxiloop messages`. */
function renderPollBlock(messageId: string, poll: InboxPollPayload): string[] {
  const lines: string[] = []
  const state = poll.closedAt
    ? `closed${poll.closedReason ? ` (${poll.closedReason})` : ''}`
    : (poll.expiresAt ? `open · expires ${poll.expiresAt}` : 'open · no expiration')
  lines.push(`    📊 POLL · ${poll.mode}-choice · ${state}`)
  lines.push(`    question: ${poll.question}`)
  for (const o of poll.options) {
    lines.push(`      • ${o.id} — ${o.text}`)
  }
  if (!poll.closedAt) {
    lines.push(`    → to vote: lingxiloop poll vote ${messageId} <option_id>${poll.mode === 'multi' ? '[,<option_id>...]' : ''}`)
    lines.push(`    → if the question doesn't apply to you or none of the options is your real answer, stay silent (no reply, no vote)`)
  }
  return lines
}

async function loadInbox(agentId: string): Promise<InboxItem[]> {
  const companyId = await agentCompany(agentId)
  if (!companyId) return []
  const entries = await getAgentInbox({ companyId, agentId, limit: 200 })
  const participantIds = [...new Set(entries.flatMap((entry) => [
    entry.message.fromUid,
    entry.quotedMessage?.fromUid,
  ].filter((value): value is string => Boolean(value))))]
  const { rows: participants } = participantIds.length > 0
    ? await pool.query<{ id: string; name: string }>(
      `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
      [companyId, participantIds],
    )
    : { rows: [] }
  const names = new Map(participants.map((participant) => [participant.id, participant.name]))
  return Promise.all(entries.map(async (entry): Promise<InboxItem> => {
    const message = entry.message
    const quoted = entry.quotedMessage
    const attachment = attachmentFromImData(companyId, message.payload.data)
    return {
      id: message.messageId,
      conversation_id: entry.channelId,
      conversation_title: entry.title,
      conversation_kind: entry.kind,
      conversation_topic: entry.topic,
      author_id: message.fromUid,
      author_name: names.get(message.fromUid) ?? message.fromUid,
      body: message.payload.body ?? '',
      kind: message.payload.kind,
      sequence: message.messageSeq,
      created_at: imTimestamp(message.timestamp),
      attachment: attachment ? await freshenAttachmentUrl(attachment) : null,
      poll: message.payload.data?.poll as InboxPollPayload | undefined ?? null,
      quoted_message_id: message.payload.replyToClientMsgNo ?? null,
      quoted: quoted ? {
        id: quoted.messageId,
        authorId: quoted.fromUid,
        authorName: names.get(quoted.fromUid) ?? quoted.fromUid,
        kind: quoted.payload.kind,
        body: quoted.payload.body ?? '',
        sequence: quoted.messageSeq,
      } : null,
    }
  }))
}

async function cmdInbox(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const filterConvo = parsed.positional[0] ?? null
  const items = await loadInbox(me)
  const filtered = filterConvo ? items.filter((m) => m.conversation_id === filterConvo) : items
  if (parsed.flags.json) return ok(JSON.stringify(filtered, null, 2))
  if (filtered.length === 0) return ok(`(inbox empty for ${me})`)

  // Group by conversation
  const byConvo = new Map<string, InboxItem[]>()
  for (const it of filtered) {
    if (!byConvo.has(it.conversation_id)) byConvo.set(it.conversation_id, [])
    byConvo.get(it.conversation_id)!.push(it)
  }
  const lines: string[] = [`${filtered.length} unread message(s) for ${me}, across ${byConvo.size} conversation(s):`, '']
  for (const [convoId, msgs] of byConvo) {
    const head = msgs[0]
    lines.push(`# ${convoId}  [${head.conversation_kind}]  "${head.conversation_title}"`)
    if (head.conversation_topic) lines.push(`  Topic: ${head.conversation_topic}`)
    for (const m of msgs) {
      const t = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const body = m.kind === 'tool' ? '[tool call]' : m.body.slice(0, 240).replace(/\n/g, ' \\n ')
      lines.push(`  [${m.id}]  ${t}  ${m.author_name}: ${body}`)
      // Inline the quoted-original (one line, indented) so you can see what
      // a reply is replying to without a second lookup. Pass `--quote <id>`
      // to `reply` to quote a message back.
      if (m.quoted_message_id) {
        if (m.quoted) {
          const qBody = m.quoted.body.slice(0, 180).replace(/\n/g, ' \\n ')
          lines.push(`    ↩ quoting [${m.quoted.id}] ${m.quoted.authorName}: ${qBody}`)
        } else {
          lines.push(`    ↩ quoting [${m.quoted_message_id}] (original deleted)`)
        }
      }
      if (m.kind === 'poll' && m.poll) {
        for (const line of renderPollBlock(m.id, m.poll)) lines.push(line)
      }
      const att = renderAttachment(m.attachment)
      if (att) lines.push(att)
    }
    lines.push('')
  }
  lines.push(`when you're done deciding what to do (reply / react / dm / nothing), run \`lingxiloop ack <convo_id>\` to clear that conversation from your inbox so the next wake-up doesn't see it again. \`lingxiloop ack --all\` clears everything in your inbox.`)
  return ok(lines.join('\n'))
}

/** `lingxiloop glance <convo>` — read the room before committing a reply.
 *
 *  Two things real teammates do that an LLM-driven agent doesn't get
 *  for free: (1) see what's just been said since they started thinking,
 *  (2) see who else is currently typing. This command surfaces both:
 *  recent messages in the convo (last ~12, with the agent's own
 *  replies tagged ▸ME) plus the set of peer agents that are currently
 *  marked "thinking" in this convo.
 *
 *  The agent prompt teaches the model to glance once before each
 *  broadcast reply — so a peer can race past with their answer while
 *  the model was still composing and the model adjusts (yield, build
 *  on it, pick a different angle) instead of blurting the same thing. */
async function cmdGlance(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  const convoId = (typeof parsed.flags['conversation'] === 'string' ? parsed.flags['conversation'] : null)
    ?? parsed.positional[0]
  if (!convoId) return err('usage: glance --conversation <id>  (or: glance <id>)')

  const authoritative = await getAgentChannelHistory({ companyId, agentId: me, channelId: convoId, limit: 12 })
  if (!authoritative) return err(`unknown authoritative channel ${convoId}`)
  const ordered = [...authoritative].sort((left, right) => left.messageSeq - right.messageSeq)
  const authorIds = [...new Set(ordered.map((message) => message.fromUid))]
  const { rows: authors } = authorIds.length > 0
    ? await pool.query<{ id: string; name: string }>(
      `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
      [companyId, authorIds],
    )
    : { rows: [] }
  const authorNames = new Map(authors.map((author) => [author.id, author.name]))
  const recent = ordered.map((message) => ({
    id: message.messageId,
    author_id: message.fromUid,
    author_name: authorNames.get(message.fromUid) ?? message.fromUid,
    kind: message.payload.kind,
    body: message.payload.body ?? '',
    created_at: imTimestamp(message.timestamp),
    sequence: message.messageSeq,
  }))

  // Advance the Redis "seen" boundary — glance just showed the agent
  // these messages, so they count as "seen" for the freshness preflight
  // on its next `lingxiloop reply`. Same required Redis path as
  // cmdMessages reads only WuKong history and advances this coordination cursor.
  if (recent.length > 0) {
    await recordSeen(me, convoId, recent[recent.length - 1].sequence)
  }

  // NO composing/claim-order roster. Exposing "who's composing, ordered by
  // who claimed first, [earlier/later than you]" is exactly what let an agent
  // map its claim RANK to a task slot ("I'm 3rd to claim → I post 3") — a
  // whole class of coordination bugs that then needed a wall of scenario-patch
  // prompt rules. Exposing only the posted message stream + a private
  // seen-cursor makes slot-by-position
  // structurally unrepresentable: the only fact an agent can act on is "the
  // latest thing actually posted", so it posts the real next item and races,
  // and the server's freshness gate (cmdReply preflight) serializes collisions.
  // glance now returns ONLY the stream, matching that model.
  if (parsed.flags.json) {
    return ok(JSON.stringify({ conversation_id: convoId, recent }, null, 2))
  }

  const lines: string[] = []
  lines.push(`Glance into ${convoId} — last ${recent.length} message(s):`)
  lines.push('')
  if (recent.length === 0) {
    lines.push('  (no messages yet)')
  } else {
    for (const m of recent) {
      const t = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const tag = m.author_id === me ? '▸ME' : '   '
      const body = m.kind === 'system'
        ? '[system]'
        : m.body.slice(0, 200).replace(/\n/g, ' \\n ')
      lines.push(`  [${m.id}] ${tag} ${t}  ${m.author_name}: ${body}`)
    }
  }
  return ok(lines.join('\n'))
}

async function cmdAck(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  if (parsed.flags.all) {
    const channelIds = await clearAllAgentUnread({ companyId, agentId: me })
    for (const channelId of channelIds) void clearHold(me, `reply:${channelId}`)
    return ok(`acked ${channelIds.length} conversation(s)`)
  }
  const convoId = parsed.positional[0]
  if (!convoId) return err('usage: ack <conversation_id>  OR  ack --all')
  const cleared = await clearAgentChannelUnread({ companyId, agentId: me, channelId: convoId })
  if (!cleared) return err(`unknown authoritative channel ${convoId}`)
  // Standing down — see the --all branch above.
  void clearHold(me, `reply:${convoId}`)
  return ok(`acked ${convoId}`)
}

const { cmdFollow, cmdMute } = createConversationDeliveryCommands({ ok, err })

// Membership system-message + counter helpers live in
// `agents/membership.ts` so the HTTP endpoints (POST /members,
// POST /leave) and the agent CLI share one implementation. Importing
// here re-exposes the names this file already used.
import { postMembershipSystemMessage } from './membership.js'

async function cmdLeave(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const convoId = parsed.positional[0]
  if (!convoId) return err('usage: leave <conversation_id>')

  const { rows } = await pool.query<{
    kind: string; title: string; members: string[]; company_id: string | null; leader_id: string | null
  }>(
    `SELECT kind, title, members, company_id, leader_id FROM conversations WHERE id = $1`,
    [convoId],
  )
  const c = rows[0]
  if (!c) return err(`unknown conversation ${convoId}`)
  if (c.kind === 'direct') {
    return err('cannot leave a direct conversation — use `lingxiloop ack` to mute it from your inbox instead')
  }
  if (!c.members.includes(me)) return err(`${me} is not a member of ${convoId}`)
  if (c.leader_id === me) return err(`cannot leave while ${me} is Leader; ask a human member to change the Leader first`)

  // Post the system message BEFORE updating members so the leaving
  // agent's inbox (filtered by c.members @> [me]) still surfaces this
  // final row in their next wake — that's how they "perceive" their own
  // departure cleanly.
  const systemMessage = await postMembershipSystemMessage({
    conversationId: convoId,
    companyId: c.company_id,
    actorId: me,
    kind: 'left',
    participantId: me,
  })

  const next = c.members.filter((m) => m !== me)
  await pool.query(
    `UPDATE conversations SET members = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [convoId, JSON.stringify(next)],
  )

  return ok(`left "${c.title}" (${convoId}); ${next.length} member(s) remain`, [{
    event: 'conversation.membership_changed',
    command: 'leave',
    action: 'left',
    conversationId: convoId,
    actorId: me,
    participantId: me,
    companyId: c.company_id ?? undefined,
    systemMessageId: systemMessage.messageId,
    memberCount: next.length,
    visibleToUser: true,
  }])
}

async function cmdInvite(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const convoId = parsed.positional[0]
  const target = parsed.positional[1]
  if (!convoId || !target) return err('usage: invite <conversation_id> <member_id>')
  if (target === me) return err(`${me} is already the one inviting`)

  const { rows } = await pool.query<{
    kind: string; title: string; members: string[]; company_id: string | null; leader_id: string | null
  }>(
    `SELECT kind, title, members, company_id, leader_id FROM conversations WHERE id = $1`,
    [convoId],
  )
  const c = rows[0]
  if (!c) return err(`unknown conversation ${convoId}`)
  if (c.kind === 'direct') {
    return err('cannot invite into a direct conversation — use `lingxiloop pull-group` to start a fresh thread')
  }
  if (!c.members.includes(me)) return err(`${me} is not a member of ${convoId} — can't invite into a group you're not in`)
  if (c.members.includes(target)) return ok(`${target} is already a member of ${convoId}`)

  // Verify the invitee exists in this tenant.
  const tenant = c.company_id
  if (tenant) {
    const { rows: pp } = await pool.query<{ id: string }>(
      `SELECT id FROM participants WHERE id = $1 AND company_id = $2 LIMIT 1`,
      [target, tenant],
    )
    if (!pp[0]) return err(`${target} is not a participant in this workspace`)
  }

  const next = [...c.members, target]
  await pool.query(
    `UPDATE conversations SET members = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [convoId, JSON.stringify(next)],
  )

  const systemMessage = await postMembershipSystemMessage({
    conversationId: convoId,
    companyId: c.company_id,
    actorId: me,
    kind: 'joined',
    participantId: target,
  })

  return ok(`invited ${target} into "${c.title}" (${convoId}); ${next.length} member(s) total`, [{
    event: 'conversation.membership_changed',
    command: 'invite',
    action: 'joined',
    conversationId: convoId,
    actorId: me,
    participantId: target,
    companyId: c.company_id ?? undefined,
    systemMessageId: systemMessage.messageId,
    memberCount: next.length,
    visibleToUser: true,
  }])
}

async function cmdKick(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const convoId = parsed.positional[0]
  const target = parsed.positional[1]
  if (!convoId || !target) return err('usage: kick <conversation_id> <member_id>')
  if (target === me) return err('use `lingxiloop leave <convo_id>` to leave a group yourself')

  const { rows } = await pool.query<{
    kind: string; title: string; members: string[]; company_id: string | null; leader_id: string | null
  }>(
    `SELECT kind, title, members, company_id, leader_id FROM conversations WHERE id = $1`,
    [convoId],
  )
  const c = rows[0]
  if (!c) return err(`unknown conversation ${convoId}`)
  if (c.kind === 'direct') return err('cannot kick from a direct conversation')
  if (!c.members.includes(me)) return err(`${me} is not a member of ${convoId} — can't kick from a group you're not in`)
  if (!c.members.includes(target)) return err(`${target} is not a member of ${convoId}`)
  if (c.leader_id === target) return err(`cannot remove ${target} while they are Leader; ask a human member to change the Leader first`)

  const next = c.members.filter((m) => m !== target)
  // Refuse to leave a group with just one member as a side-effect of kick —
  // if there'd only be the actor left, that's "everyone else gone", which
  // is fine, but require explicit confirmation via --confirm-empty for the
  // case where the kick removes the LAST other member. Cheap guard against
  // accidental group-clearing.
  if (next.length === 1 && !parsed.flags['confirm-empty']) {
    return err(`kicking ${target} would leave only ${me} in this group; pass --confirm-empty if that's intended`)
  }

  // Post BEFORE removing the target from members. The mailbox query
  // filters by current `c.members @> [agentId]`, so if we updated first
  // the kicked agent would never see the row that explains why their
  // inbox went quiet on this conversation. Posting first means the
  // target gets one last wake with this exact message.
  const systemMessage = await postMembershipSystemMessage({
    conversationId: convoId,
    companyId: c.company_id,
    actorId: me,
    kind: 'kicked',
    participantId: target,
  })

  await pool.query(
    `UPDATE conversations SET members = $2::jsonb, updated_at = NOW() WHERE id = $1`,
    [convoId, JSON.stringify(next)],
  )

  return ok(`kicked ${target} from "${c.title}" (${convoId}); ${next.length} member(s) remain`, [{
    event: 'conversation.membership_changed',
    command: 'kick',
    action: 'kicked',
    conversationId: convoId,
    actorId: me,
    participantId: target,
    companyId: c.company_id ?? undefined,
    systemMessageId: systemMessage.messageId,
    memberCount: next.length,
    visibleToUser: true,
  }])
}

async function cmdReply(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
  const me = resolveAs(parsed)
  const convoId = parsed.positional[0]
  // Strip any hallucinated <tool_call> XML on the way in too — defense in depth.
  const body = unescapeChat(parsed.positional.slice(1).join(' '))
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function_call>[\s\S]*?<\/function_call>/gi, '')
    .trim()
  const hasAttachFlag = Boolean(
    parsed.flags.attach ||
    parsed.flags['generate-image'] ||
    parsed.flags['attach-text'] ||
    parsed.flags['attach-bytes'],
  )
  // `--quote / -q <message_id>` makes this reply a direct quote of that
  // message. The target must live in the SAME conversation — cross-convo
  // quotes would leak content, so the server-side path enforces that too.
  const quoteFlag = parsed.flags.quote ?? parsed.flags.q
  const quotedMessageId = quoteFlag ? String(quoteFlag).trim() : null
  // Internal, LingxiLoop-generated idempotency key (issue #7) — arrives ONLY
  // via the out-of-band `internal` context (see RunCliInternalContext),
  // never as an argv flag. No CLI caller (human or AgentOS process,
  // untrusted caller can set or spoof this. Enforced via a unique index on
  // The IM acceptance ledger binds this key to one WuKong client message
  // identity, so a retried/duplicate-waked send resolves to the same message.
  const idempotencyKey = internal.idempotencyKey?.trim() || null
  if (!convoId || (!body && !hasAttachFlag)) {
    return err('usage: reply <convo_id> "<body>" [--quote <msg_id>] [--attach <url> | --generate-image "<prompt>" [--size square|wide|tall] | --attach-text "<filename>" "<content>" | --attach-bytes "<filename>" --bytes-b64 "<base64>" [--bytes-mime "<mime>"]]')
  }

  // Verify the agent is a member of the conversation
  const { rows: cv } = await pool.query<{ members: string[]; company_id: string; kind: string }>(
    `SELECT members, company_id, kind FROM conversations WHERE id = $1`, [convoId],
  )
  if (!cv[0]) return err(`unknown conversation ${convoId}`)
  if (!cv[0].members.includes(me)) return err(`${me} is not a member of ${convoId}`)
  const companyId = cv[0].company_id

  if (cv[0].kind === 'email') {
    if (!body) return err('email replies require a non-empty body')
    try {
      const { replyInEmailConversation } = await import('../modules/email/index.js')
      const result = await replyInEmailConversation({
        conversationId: convoId, companyId, authorId: me, body, autoSubmitted: true,
      })
      if (result.transportStatus !== 'sent') {
        return err(`email reply persisted as failed: ${result.error} · ${result.messageId}`, 1)
      }
      return ok(`replied via email · ${result.messageId}`, [{
        event: 'message.posted', command: 'reply', medium: 'email',
        conversationId: convoId, messageId: result.messageId, authorId: me,
        companyId, visibleToUser: true, transportStatus: result.transportStatus,
      }])
    } catch (error) {
      return err(`email auto-promote failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const channelHistory = await getAgentChannelHistory({ companyId, agentId: me, channelId: convoId })
  if (!channelHistory) return err(`unknown authoritative channel ${convoId}`)
  const history = [...channelHistory].sort((left, right) => left.messageSeq - right.messageSeq)
  const clientNonce = idempotencyKey
    ? `agent-reply:${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 48)}`
    : `agent-reply:${randomUUID()}`
  const { rows: mentionTargets } = await pool.query<{ id: string; name: string }>(
    `SELECT id,name FROM participants WHERE company_id=$1 AND id=ANY($2::text[])`,
    [companyId, cv[0].members],
  )
  const participantNames = new Map(mentionTargets.map((participant) => [participant.id, participant.name]))

  // ─── Idempotent replay short-circuit ───────────────────────────────
  // Skips every gate below (anti-monologue, freshness, verbatim-dup) —
  // those are draft-time decision gates and don't apply to a message we
  // already sent. Scoped to plain chat sends; the email auto-promote
  // path below has its own (out-of-scope-for-#7) transport semantics.
  if (idempotencyKey) {
    const replayed = history.find((message) => message.clientMsgNo === clientNonce)
    if (replayed) {
      const attachmentNote = replayed.payload.kind === 'attachment' ? ' · attached' : ''
      const quoteNote = replayed.payload.replyToClientMsgNo ? ` · quoted ${replayed.payload.replyToClientMsgNo}` : ''
      return ok(`sent (${replayed.messageId}, seq ${replayed.messageSeq})${attachmentNote}${quoteNote} [replayed]`, [{
        event: 'message.posted',
        command: 'reply',
        medium: 'chat',
        conversationId: convoId,
        messageId: replayed.messageId,
        sequence: replayed.messageSeq,
        authorId: me,
        companyId,
        visibleToUser: true,
        attachment: replayed.payload.kind === 'attachment',
        quotedMessageId: replayed.payload.replyToClientMsgNo,
        replayed: true,
      }])
    }
  }

  // ─── Anti-monologue gate ──────────────────────────────────────────
  // In multi-party conversations (3+ members), an agent can't post a
  // second message in a row before anyone else has spoken. The most
  // common failure mode this catches: agent posts plan → same agent
  // immediately posts continuation → next agent posts THEIR version of
  // the same plan → loop. Group-chat real-people don't double-text
  // their own thread before anyone responds; agents do, constantly,
  // because each wake-up is a fresh "should I respond?" decision with
  // no global stop-signal.
  //
  // Exemptions:
  //  - DMs (2-member convos): legit follow-ups like "oh also one more
  //    thing" happen naturally. Keep them open.
  //  - 10-minute escape valve: if your own last message has been
  //    sitting there for 10+ minutes without anyone biting, the thread
  //    has gone quiet and a nudge is fair game.
  //
  // Bypass via `--continue` / `--also`: rare cases where the agent
  // genuinely has to add to its own previous message (e.g. an
  // urgent correction, an attachment that didn't fit). The flag
  // forces the agent to commit deliberately rather than absent-
  // mindedly continuing to monologue.
  const monologueBypass = Boolean(parsed.flags.continue || parsed.flags.also)
  if (!monologueBypass && cv[0].members.length > 2) {
    const lastMessage = history.at(-1)
    if (lastMessage?.fromUid === me) {
      const sentAt = lastMessage.timestamp > 10_000_000_000
        ? lastMessage.timestamp : lastMessage.timestamp * 1000
      const ageMs = Date.now() - sentAt
      const MIN_GAP_MS = 10 * 60 * 1000
      if (ageMs < MIN_GAP_MS) {
        const ageSec = Math.max(1, Math.round(ageMs / 1000))
        return err(
          `you already posted in ${convoId} ${ageSec}s ago and nobody has replied yet — ` +
          `you can't post again until someone else speaks. ` +
          `If you have more to say, fold it into your next message when someone responds. ` +
          `Right now: react on the relevant message (lingxiloop react ${convoId} <message_id> 👀 / ✅ / 🎯), ` +
          `or set_turn_status done and step back. ` +
          `Override only if it's truly urgent: rerun with --continue.`
        )
      }
    }
  }

  // ─── FRESHNESS PREFLIGHT ───────────────────────────────────────────
  // Goal: stop the classic collision (Iris and Marcus both posting "3" in
  // a counting game). Mechanism: read this agent's "seen seq" boundary
  // from Redis (the one loadInbox / cmdMessages / cmdGlance recorded), and
  // if any non-self message in this conversation has a seq > baseline,
  // HOLD the send and surface the held messages so the agent re-decides.
  //
  // This state lives only in Redis so it remains independent from the inbox
  // cursor. Redis errors reject the command; an absent key returns zero.
  //
  // Bypasses match the monologue gate above + send-anyway override:
  //   - 2-member DMs: parallel typing is normal, both replies are valid
  //   - --continue / --also: agent has explicit "this is a follow-up" intent
  //   - --send-anyway: explicit override after the agent re-decided that
  //     the original draft is STILL correct given the new context.
  //     ARMED ONLY BY A PRIOR HOLD (hold token, see below) — a preemptive
  //     --send-anyway on a first attempt is ignored and the preflight runs.
  //   - email convos: already returned above via the auto-promote path
  //
  // What this does NOT catch (separate fix, 0eaf04c): brain-level out-of-
  // order races where the SECOND agent hasn't INSERTed yet (Nova posting 6
  // BEFORE Iris's 5 lands — both Nova's and Iris's prefights pass because
  // neither has anything newer than Marcus's 4 in the messages table at
  // their respective INSERT moments). That's the "NEVER SKIP AHEAD" prompt
  // rule's job. This preflight catches POST-INSERT races (both already
  // tried to insert the same slot — the second one sees the first).
  //
  // Why the hold token exists (2026-06-11/12 double-deliverable incidents):
  // agents learned to pass --send-anyway PREEMPTIVELY to save a round-trip
  // ("compile story → reply --send-anyway" with zero glances), which made
  // this entire preflight a no-op exactly when it mattered — a peer had
  // posted the same deliverable 40s earlier and the HELD envelope would
  // have shown it. The token turns the flag from a free pass into an
  // acknowledgement: it only works AFTER this server has actually shown
  // the agent a HELD envelope for this conversation.
  const sendAnywayFlag = Boolean(parsed.flags['send-anyway'])
  const replyHoldScope = `reply:${convoId}`
  const preflightApplies = !monologueBypass && cv[0].members.length > 2
  const heldAck = sendAnywayFlag
    ? await consumeHold(me, replyHoldScope)
    : { armed: false, heldUpToSeq: null }
  let sendAnywayArmed = heldAck.armed
  if (sendAnywayArmed && preflightApplies && heldAck.heldUpToSeq !== null) {
    // The token acknowledges the room AS SHOWN in that HELD envelope — up
    // to peer seq `heldUpToSeq`. If the room moved past it, the
    // acknowledgement is void: the flag must never skip the gates for
    // messages the agent has NOT been shown. (2026-07-08 counting game:
    // Saga was HELD at 17:30 drafting "2", yielded — banking the token —
    // and a NEW turn's preemptive --send-anyway consumed it at 17:34,
    // shipping a stale "6" past Nova's 6 and Iris's 7 sight unseen.)
    const newer = history
      .filter((message) => message.fromUid !== me && message.messageSeq > heldAck.heldUpToSeq!)
      .slice(0, 8)
      .map((message) => ({
        sequence: message.messageSeq,
        author_id: message.fromUid,
        author_name: participantNames.get(message.fromUid) ?? null,
        body: message.payload.body ?? '',
      }))
    if (newer.length > 0) {
      sendAnywayArmed = false
      const maxHeldSeq = newer[newer.length - 1].sequence
      // Shown ⇒ part of the agent's world-state: advance the SEEN CURSOR past
      // what THIS envelope shows and arm a fresh token bound to the new
      // high-water seq, so a considered re-run works without re-holding on
      // these same rows (the hold envelope itself advances the seen cursor).
      await recordSeen(me, convoId, maxHeldSeq)
      await recordHold(me, replyHoldScope, maxHeldSeq)
      const lines = newer.map((r) =>
        `  [seq=${r.sequence}] ${r.author_name || r.author_id}: ${r.body.replace(/\s+/g, ' ').slice(0, 200)}`
      ).join('\n')
      return err(
        `HELD — your reply NOT sent. Your --send-anyway acknowledged an EARLIER hold, but the room has moved since: ` +
        `${newer.length} newer message(s) in ${convoId} you have not been shown:\n${lines}\n\n` +
        `Re-decide against THIS state — usually your draft is now wrong ` +
        `(counting: post the next number after the latest, not the one you drafted; ` +
        `relay/chain: continue from the latest entry; if a peer above already delivered what you were about to deliver, stand down or react instead). ` +
        `Run \`lingxiloop reply <convoId> "<revised body>"\` with your new decision, ` +
        `or rerun with --send-anyway only if your draft is STILL correct despite these messages (rare).`,
        2,
      )
    }
  }
  if (!sendAnywayArmed && preflightApplies) {
    // Freshness race detection — the SEEN-CURSOR model: a per-(agent,convo)
    // SEEN CURSOR — "the highest peer
    // seq this agent has actually been SHOWN" — advanced by every surface that
    // puts rows in front of the model: the wake brief (/runtime/inbox), lingxiloop
    // glance, lingxiloop messages, and HELD envelopes themselves. HOLD iff a peer
    // message exists that the agent has NOT been shown; once shown, a plain
    // re-send passes with no flag ritual (the hold envelope carries the
    // cursor forward, so resend-after-shown goes through cleanly).
    //
    // This replaces the compose-anchor (turn-start timestamp, deliberately NOT
    // advanced by glance). The anchor guaranteed a FIRST-attempt HOLD in any
    // busy room even when the agent had already read everything — transcripts:
    // "Same HELD — those messages are what I already glanced → send-anyway" —
    // costing 1-2 extra big-model round-trips per reply. The
    // one dup the anchor caught that a seen-cursor admits (glance shows a
    // peer's just-landed post and the agent still posts the SAME item) is
    // covered by the VERBATIM-DUP gate below.
    //
    // baseline === 0 (never read / Redis TTL expired / Redis down) fails OPEN,
    // as before — the wake brief re-establishes the cursor at turn start.
    const baseline = await getSeen(me, convoId)
    if (baseline > 0) {
      const newer = history
        .filter((message) => message.fromUid !== me && message.messageSeq > baseline)
        .slice(0, 8)
        .map((message) => ({
          sequence: message.messageSeq,
          author_id: message.fromUid,
          author_name: participantNames.get(message.fromUid) ?? null,
          body: message.payload.body ?? '',
        }))
      if (newer.length > 0) {
        // Shown ⇒ seen: advance the cursor past what this envelope shows so a
        // considered re-send passes instead of re-holding on the same rows —
        // the hold envelope itself advances the cursor. If MORE peers
        // post after this, the re-attempt holds again on the truly-new ones.
        const maxHeldSeq = newer[newer.length - 1].sequence
        await recordSeen(me, convoId, maxHeldSeq)
        const lines = newer.map((r) =>
          `  [seq=${r.sequence}] ${r.author_name || r.author_id}: ${r.body.replace(/\s+/g, ' ').slice(0, 200)}`
        ).join('\n')
        // Arm the hold token: NOW the agent has actually been shown the
        // held context, so a follow-up --send-anyway is a real
        // acknowledgement rather than a preemptive skip. Bound to the max
        // shown seq — if the room moves again before the re-run, the
        // acknowledgement is void (see the staleness check above).
        await recordHold(me, replyHoldScope, maxHeldSeq)
        return err(
          `HELD — your reply NOT sent. ${newer.length} newer message(s) in ${convoId} you have not been shown:\n${lines}\n\n` +
          (sendAnywayFlag
            ? `(Your --send-anyway was IGNORED: it only acknowledges a HOLD you have already been shown — passing it preemptively does nothing.)\n`
            : '') +
          `You have now seen these — re-decide against THIS state, then simply re-send: a plain \`lingxiloop reply <convoId> "<revised body>"\` will go through (no flag needed). ` +
          `Usually your draft is now wrong (counting: post the next number after the latest; relay/chain: continue from the latest entry; ` +
          `if a peer above already delivered what you were about to deliver, the work is DONE — stand down or react instead).`,
          2,  // exit code 2 = "held, retry with different content" (distinct from 1 = generic error)
        )
      }
    }
    // ─── VERBATIM-DUP GATE ───────────────────────────────────────────
    // The freshness preflight above catches "peer posted AFTER my baseline /
    // anchor." But during aggressive lapping (team-adapts pushing multiple
    // agents to cover) two agents can independently draft the SAME content
    // before either's anchor or baseline is set against the other — both
    // glance, see the same state, both decide on the same NEXT-ITEM.
    // Seq-based preflight passes (no peer message > my baseline) but the
    // draft is verbatim identical to a recent peer post. Real teammates
    // would say "oh, X beat me to it" — they don't immediately repeat the
    // most-recent thing said. Encode that as a HARD gate: if my draft body
    // (trimmed) matches the IMMEDIATELY PREVIOUS non-self peer message
    // verbatim, HOLD. This caught two T7 collisions (你-你, 了-了) where
    // both rates of slot-coverage races would have shipped duplicate
    // characters into the chain.
    //
    // Scope: only the LAST peer message — narrowest principled rule, no
    // scenario examples. If a peer 5 messages ago said "yes" and you're
    // also drafting "yes" in response to something new, that's not noise;
    // only the immediately-prior dup is.
    const draftBodyTrimmed = body.trim()
    if (draftBodyTrimmed.length > 0) {
      const lastPeerMessage = [...history].reverse().find((message) => (
        message.fromUid !== me && message.payload.kind === 'text'
      ))
      const lastPeer = lastPeerMessage ? {
        sequence: lastPeerMessage.messageSeq,
        author_id: lastPeerMessage.fromUid,
        author_name: participantNames.get(lastPeerMessage.fromUid) ?? null,
        body: lastPeerMessage.payload.body ?? '',
      } : null
      if (lastPeer && lastPeer.body.trim() === draftBodyTrimmed) {
        // Advance baseline past this peer post so re-attempt with NEW content
        // doesn't HOLD on the same row again.
        await recordSeen(me, convoId, lastPeer.sequence)
        await recordHold(me, replyHoldScope, lastPeer.sequence)
        const peer = lastPeer
        return err(
          `HELD — your draft is VERBATIM IDENTICAL to the most recent peer post in ${convoId}:\n` +
          `  [seq=${peer.sequence}] ${peer.author_name || peer.author_id}: ${peer.body.replace(/\s+/g, ' ').slice(0, 200)}\n\n` +
          `They beat you to it. Real teammates don't immediately repeat the same thing — pick a different angle, the NEXT item in a sequence, or stay silent if their post already covers what you wanted to say.`,
          2,
        )
      }
    }
  }

  // If quoting, prove the target exists in THIS conversation. If it doesn't,
  // fail loudly — unlike the HTTP path (which is forgiving in case of a
  // delete race), the agent should know its quote pointer is bad so it can
  // fix the call rather than ship a silently-quoteless reply.
  let resolvedQuotedId: string | null = null
  if (quotedMessageId) {
    const quoted = history.find((message) => (
      message.messageId === quotedMessageId || message.clientMsgNo === quotedMessageId
    ))
    if (!quoted) {
      return err(`--quote target ${quotedMessageId} not found in ${convoId}`)
    }
    resolvedQuotedId = quoted.messageId
  }

  // Optional attachment in three flavors:
  //   --attach <url>                    — share an existing URL (no key, won't re-sign)
  //   --generate-image "<prompt>"       — call the image model, upload to storage,
  //                                       attach with signed URL + key
  //   --attach-text "<filename>" "..."  — save the content as a real file and attach it
  type AgentAttachment = {
    url: string; name: string; kind: 'img' | 'file';
    mime?: string; size?: number; key?: string;
  }
  let attachment: AgentAttachment | null = null

  if (parsed.flags['generate-image']) {
    const prompt = String(parsed.flags['generate-image']).trim()
    if (!prompt) return err('--generate-image requires a non-empty prompt')
    // Same tenant-scoped claim as `lingxiloop image generate` — the image
    // model doesn't care whether the call came via reply or as a
    // standalone, but peer agents do.
    const blocked = await tryClaimTenantWork(companyId, me, 'image-generate', prompt)
    if (blocked) return blocked
    try {
      attachment = await generateAndUploadImage({
        prompt,
        size: String(parsed.flags.size ?? 'square'),
        tenant: companyId,
        agentId: me,
      })
    } catch (e) {
      return err(`image generation failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      await releaseTenantWork(companyId, me, 'image-generate', prompt)
    }
  } else if (parsed.flags['attach-text']) {
    const filename = String(parsed.flags['attach-text']).trim().slice(0, 200)
    // Content comes from the body (which then gets cleared) OR from an
    // explicit --attach-text-content. Common case: agent writes the file
    // as the body and uses --attach-text to mark it as an attachment.
    const content = String(parsed.flags['attach-text-content'] ?? body)
    if (!filename || !content) return err('--attach-text requires a filename and content')
    attachment = await saveTextAttachment(companyId, filename, content)
  } else if (parsed.flags['attach-bytes']) {
    const filename = String(parsed.flags['attach-bytes']).trim().slice(0, 200)
    const b64 = String(parsed.flags['bytes-b64'] ?? '').trim()
    const mime = parsed.flags['bytes-mime']
      ? String(parsed.flags['bytes-mime']).trim().toLowerCase()
      : undefined
    if (!filename || !b64) return err('--attach-bytes requires a filename and --bytes-b64 "<base64>"')
    try {
      attachment = await saveBytesAttachment(companyId, filename, b64, mime)
    } catch (e) {
      return err(`attach-bytes failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  } else if (parsed.flags.attach) {
    const url = String(parsed.flags.attach)
    const key = storageKeyFromPublicUrl(url)
    if (!key || !key.startsWith(`attachments/${companyId}/`)) {
      return err('--attach must reference an attachment already stored in this workspace R2 prefix')
    }
    const name = parsed.flags['attach-name'] ? String(parsed.flags['attach-name']) : url.split('/').pop() ?? 'attachment'
    attachment = { url: await storage.publicUrl(key), key, name, kind: 'img' }
  }

  // If the body was consumed as the text-file content (no separate
  // --attach-text-content flag was passed), suppress it from the
  // outgoing message — the file IS the message.
  const consumedAsTextContent =
    parsed.flags['attach-text'] && !parsed.flags['attach-text-content']
  const finalBody = consumedAsTextContent ? '' : body
  const { mentionedIds, mentionAll } = parseMentions(finalBody, mentionTargets)

  const sendResult = await sendAgentChannelMessage({
    companyId,
    agentId: me,
    channelId: convoId,
    clientNonce,
    payload: {
      version: 1,
      kind: attachment ? 'attachment' : 'text',
      clientMsgNo: clientNonce,
      ...(finalBody ? { body: finalBody } : {}),
      ...(resolvedQuotedId ? { replyToClientMsgNo: resolvedQuotedId } : {}),
      data: {
        ...(attachment ?? {}),
        mentionedIds,
        mentionAll,
      },
    },
  })
  if (sendResult.kind === 'channel_not_found') return err(`unknown authoritative channel ${convoId}`)
  if (sendResult.kind === 'nonce_conflict') return err('reply idempotency key was reused with different content')
  if (sendResult.kind === 'verbatim_peer') {
    const peer = sendResult.peer
    await recordSeen(me, convoId, peer.messageSeq)
    await recordHold(me, replyHoldScope, peer.messageSeq)
    return err(
      `HELD — your draft became VERBATIM IDENTICAL to the most recent peer post while sending:\n` +
      `  [seq=${peer.messageSeq}] ${participantNames.get(peer.fromUid) ?? peer.fromUid}: ${(peer.payload.body ?? '').replace(/\s+/g, ' ').slice(0, 200)}\n\n` +
      `They beat you to it. Re-read the room and choose a different contribution or stay silent.`,
      2,
    )
  }
  const { messageId, sequence } = sendResult

  // Advance the Redis "seen" boundary to the authoritative WuKong sequence, so the
  // freshness preflight on my NEXT lingxiloop reply compares against the post-
  // insertion state (peer messages with seq <= mine are "things I obviously
  // saw"; only seq > mine would trip a HOLD). Pure Redis side-effect — does
  // does not mutate the authoritative WuKong unread state.
  await recordSeen(me, convoId, sequence)
  // Drop any lingering hold token: this send committed WITHOUT the
  // override, so a hold acknowledged-but-unused must not arm a later
  // preemptive --send-anyway in this conversation.
  void clearHold(me, replyHoldScope)
  const attachmentNote = attachment
    ? ` · attached ${attachment.kind} "${attachment.name}"`
    : ''
  const quoteNote = resolvedQuotedId ? ` · quoted ${resolvedQuotedId}` : ''
  return ok(`sent (${messageId}, seq ${sequence})${attachmentNote}${quoteNote}`, [{
    event: 'message.posted',
    command: 'reply',
    medium: 'chat',
    conversationId: convoId,
    messageId,
    sequence,
    authorId: me,
    companyId,
    visibleToUser: true,
    attachment: Boolean(attachment),
    quotedMessageId: resolvedQuotedId,
  }])
}

/* ─── Image / file generation helpers ───────────────────────────────────
 * Both helpers return an AgentAttachment ready for the authoritative WuKong
 * payload. They go through the authoritative R2 storage abstraction.
 *
 * Failure mode: throw — the caller wraps in a try/catch and returns
 * a CLI error so the agent's bash() call exits non-zero and the agent
 * can pick a different path. */

const IMAGE_SIZE_MAP: Record<string, '1024x1024' | '1536x1024' | '1024x1536'> = {
  square: '1024x1024',
  wide:   '1536x1024',
  tall:   '1024x1536',
}

async function generateAndUploadImage(opts: {
  prompt: string
  size: string
  tenant: string
  agentId: string
}): Promise<{ url: string; name: string; kind: 'img'; mime: string; size: number; key: string }> {
  if (!env.OPENAI_IMAGE_MODEL) {
    throw new Error('OPENAI_IMAGE_MODEL is required for image generation')
  }
  const size = IMAGE_SIZE_MAP[opts.size] ?? '1024x1024'
  // Product image generation uses the tracked LLM image entrypoint.
  const { createImage } = await import('../llm.js')
  const r = await createImage({ purpose: 'agent-image', companyId: opts.tenant, agentId: opts.agentId }, {
    model: env.OPENAI_IMAGE_MODEL,
    prompt: opts.prompt,
    size,
    n: 1,
    response_format: 'b64_json',
  })
  const first = r.data?.[0]
  const b64 = first?.b64_json
  if (!b64) throw new Error('image provider returned no b64_json data')
  const buf = Buffer.from(b64, 'base64')
  const { randomUUID } = await import('node:crypto')
  const id = randomUUID().replace(/-/g, '')
  const key = `attachments/${opts.tenant}/${id}.png`
  const url = await storage.put(key, buf, 'image/png')
  // Slug the prompt into a friendly filename for the bubble caption.
  const slug = opts.prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5)
    .join('-')
    .slice(0, 40) || 'image'
  return {
    url,
    key,
    name: `${slug}.png`,
    kind: 'img',
    mime: 'image/png',
    size: buf.length,
  }
}

/** `lingxiloop image generate "<prompt>" [--size square|wide|tall] [--as <id>] [--json]`
 *  Generates an image through the configured OpenAI image model,
 *  uploads it to storage, and returns the signed URL + key
 *  so the caller can `lingxiloop reply <c> "<body>" --attach <url>` later.
 *  Decoupled from `reply --generate-image` so an agent can test a
 *  prompt, look at the result, and discard / regenerate without shipping
 *  a half-baked image into a conversation. */
async function cmdImage(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const op = parsed.positional[0]
  if (op !== 'generate') {
    return err('usage: image generate "<prompt>" [--size square|wide|tall] [--as <id>] [--json]')
  }
  // Allow either `image generate "long prompt with spaces"` (the typical
  // quoted form) or `image generate word1 word2 ...` (autocomplete-friendly);
  // we just join positional tail.
  const prompt = parsed.positional.slice(1).join(' ').trim()
  if (!prompt) return err('image generate requires a non-empty prompt')
  const size = String(parsed.flags.size ?? 'square')

  const tenant = await agentCompany(me)
  const blocked = await tryClaimTenantWork(tenant, me, 'image-generate', prompt)
  if (blocked) return blocked

  try {
    const att = await generateAndUploadImage({ prompt, size, tenant, agentId: me })
    if (parsed.flags.json) return ok(JSON.stringify(att, null, 2))
    const dim = size === 'wide' ? '1536×1024'
      : size === 'tall' ? '1024×1536'
      : '1024×1024'
    return ok([
      `generated ${dim} · ${Math.round(att.size / 1024)}KB · ${env.OPENAI_IMAGE_MODEL}`,
      `name: ${att.name}`,
      `url:  ${att.url}`,
      `key:  ${att.key}`,
      ``,
      `attach to a reply with:`,
      `  lingxiloop reply <convo_id> "<body>" --attach "${att.url}" --attach-name "${att.name}"`,
    ].join('\n'))
  } catch (e) {
    return err(`image generation failed: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    await releaseTenantWork(tenant, me, 'image-generate', prompt)
  }
}

/** Save a base64-encoded blob as a file attachment of ANY type. This is
 *  the universal escape hatch — text files have their own --attach-text
 *  helper, images get the --generate-image path, but anything else (PDF,
 *  zip, audio, binary blob the agent fetched) flows through here. The
 *  agent provides the bytes as base64 and optionally a mime hint. */
async function saveBytesAttachment(
  companyId: string,
  filename: string,
  base64: string,
  mimeHint?: string,
): Promise<{ url: string; name: string; kind: 'img' | 'file'; mime: string; size: number; key: string }> {
  // Generous 32 MB ceiling — same as the user-upload edge. The base64
  // wire form is ~33% larger; we decode first then re-check.
  const MAX_BYTES = 32 * 1024 * 1024
  let buf: Buffer
  try {
    buf = Buffer.from(base64, 'base64')
  } catch {
    throw new Error('--bytes-b64 is not valid base64')
  }
  if (buf.length === 0) throw new Error('--bytes-b64 decoded to zero bytes')
  if (buf.length > MAX_BYTES) throw new Error(`attachment too large (${buf.length} > ${MAX_BYTES})`)

  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin'
  // Mime resolution: explicit hint > ext-based guess > octet-stream.
  const mime = mimeHint ?? extToMime(ext) ?? 'application/octet-stream'
  // Render as image when the mime says so; everything else is a file card.
  const kind: 'img' | 'file' = mime.startsWith('image/') ? 'img' : 'file'

  const { randomUUID } = await import('node:crypto')
  const id = randomUUID().replace(/-/g, '')
  const key = `attachments/${companyId}/${id}.${ext}`
  const url = await storage.put(key, buf, mime)
  return { url, key, name: filename, kind, mime, size: buf.length }
}

/** MIME inference from a file extension. Unknown binary formats use the
 *  standard application/octet-stream media type. */
function extToMime(ext: string): string | null {
  switch (ext) {
    // Images
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'svg': return 'image/svg+xml'
    // Docs
    case 'pdf': return 'application/pdf'
    case 'doc': return 'application/msword'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xls': return 'application/vnd.ms-excel'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    // Archives
    case 'zip': return 'application/zip'
    case 'tar': return 'application/x-tar'
    case 'gz':  return 'application/gzip'
    // Text / code
    case 'txt': return 'text/plain'
    case 'md':  return 'text/markdown'
    case 'csv': return 'text/csv'
    case 'json': return 'application/json'
    case 'yml':
    case 'yaml': return 'application/x-yaml'
    case 'toml': return 'application/x-toml'
    case 'html': return 'text/html'
    // Media
    case 'mp3': return 'audio/mpeg'
    case 'wav': return 'audio/wav'
    case 'mp4': return 'video/mp4'
    case 'mov': return 'video/quicktime'
    default: return null
  }
}

/** Load a local outbound attachment into the authoritative R2 data plane.
 *  Resend receives a short-lived URL from the Email domain; the CLI keeps
 *  only durable object metadata and never carries a second Base64 payload. */
async function loadEmailAttachmentFromPath(path: string): Promise<{
  filename: string; mimeType: string; sizeBytes: number;
  storageKey: string;
}> {
  const fs = await import('node:fs/promises')
  const nodePath = await import('node:path')
  const cryptoMod = await import('node:crypto')
  const MAX_BYTES = 20 * 1024 * 1024  // 20MB — matches Resend's per-attachment ceiling
  const buf = await fs.readFile(path)
  if (buf.length === 0) throw new Error(`empty file: ${path}`)
  if (buf.length > MAX_BYTES) {
    throw new Error(`file too large: ${buf.length} bytes (max ${MAX_BYTES})`)
  }
  const filename = nodePath.basename(path)
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'bin'
  const mimeType = extToMime(ext) ?? 'application/octet-stream'
  const id = cryptoMod.randomUUID().replace(/-/g, '')
  const storageKey = `email-attachments/${id}${ext ? '.' + ext : ''}`
  await storage.put(storageKey, buf, mimeType)
  return {
    filename, mimeType, sizeBytes: buf.length,
    storageKey,
  }
}

/** `lingxiloop skills <op>` — manage Agent Skills (progressive-disclosure
 *  capability packs) stored in this agent's workspace under
 *  `skills/<name>/`. See server/src/agents/skills.ts for the spec. */
async function cmdSkills(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const op = parsed.positional[0] ?? 'list'

  if (op === 'list') {
    const { loadSkillsIndex } = await import('./skills.js')
    const skills = await loadSkillsIndex(me)
    if (parsed.flags.json) return ok(JSON.stringify(skills, null, 2))
    if (skills.length === 0) {
      return ok('(no skills installed — use `lingxiloop skills create <name> "<description>"` to scaffold one)')
    }
    const lines = skills.map((s) =>
      `  ${s.name}\n    ${s.description}\n    → lingxiloop skills read ${s.name}`,
    )
    return ok(lines.join('\n\n'))
  }

  if (op === 'read') {
    const name = parsed.positional[1]
    if (!name) return err('usage: skills read <name> [<sub-path>]')
    const subPath = parsed.positional[2]
    // No sub-path → load the SKILL.md entry-point. With a sub-path,
    // load that bundled file (e.g. `scripts/extract.py`).
    const fullPath = subPath ? `skills/${name}/${subPath}` : `skills/${name}/SKILL.md`
    const { rows } = await pool.query<{ body: string }>(
      `SELECT body FROM agent_workspace WHERE agent_id = $1 AND path = $2 LIMIT 1`,
      [me, fullPath],
    )
    if (!rows[0]) return err(`no such file: ${fullPath}`)
    return ok(rows[0].body)
  }

  if (op === 'create') {
    const name = parsed.positional[1]
    const description = parsed.positional[2]
    if (!name || !description) {
      return err('usage: skills create <name> "<description>"  (name: lowercase a-z, 0-9, hyphens; description: ≤1024 chars)')
    }
    const { validateSkillName } = await import('./skills.js')
    const nameError = validateSkillName(name)
    if (nameError) return err(nameError)
    if (description.length > 1024) return err('description must be ≤ 1024 characters')

    const path = `skills/${name}/SKILL.md`
    const { rows: existing } = await pool.query<{ path: string }>(
      `SELECT path FROM agent_workspace WHERE agent_id = $1 AND path = $2 LIMIT 1`,
      [me, path],
    )
    if (existing[0]) return err(`skill "${name}" already exists — use \`lingxiloop workspace edit ${path}\` to modify it, or \`lingxiloop skills delete ${name}\` first`)

    const body = `---
name: ${name}
description: ${description}
---

# ${name}

_Write the skill instructions here. Recommended sections: overview,
step-by-step, examples, edge cases. Keep this file under ~500 lines —
move long reference material into \`references/\` files and load them
on demand via \`lingxiloop skills read ${name} references/<file>\`._
`
    await pool.query(
      `INSERT INTO agent_workspace (agent_id, path, body, company_id, updated_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [me, path, body, await agentCompany(me)],
    )
    return ok(
      `created skill "${name}" at ${path}\n\n` +
      `flesh it out: lingxiloop workspace edit ${path} "<old>" "<new>"\n` +
      `add scripts:  lingxiloop workspace write skills/${name}/scripts/<file>.py "<body>"\n` +
      `read it back: lingxiloop skills read ${name}`,
      [{
        event: 'skill.created',
        command: 'skills create',
        agentId: me,
        skillName: name,
        path,
      }],
    )
  }

  if (op === 'delete') {
    const name = parsed.positional[1]
    if (!name) return err('usage: skills delete <name>')
    const r = await pool.query(
      `DELETE FROM agent_workspace
        WHERE agent_id = $1 AND (path = $2 OR path LIKE $3)`,
      [me, `skills/${name}/SKILL.md`, `skills/${name}/%`],
    )
    if ((r.rowCount ?? 0) === 0) return err(`no such skill: ${name}`)
    return ok(`deleted skill "${name}" (${r.rowCount} files removed)`, [{
      event: 'skill.deleted',
      command: 'skills delete',
      agentId: me,
      skillName: name,
      fileCount: r.rowCount ?? 0,
    }])
  }

  if (op === 'search') {
    const query = parsed.positional.slice(1).join(' ').trim()
    if (!query) return err('usage: skills search <query>')
    const { env } = await import('../env.js')
    if (!env.SKILLHUB_URL) return err('SkillHub URL not configured — set SKILLHUB_URL on the server')
    try {
      const { searchSkillHub } = await import('./skills.js')
      const hits = await searchSkillHub(query, env.SKILLHUB_URL)
      if (parsed.flags.json) return ok(JSON.stringify(hits, null, 2))
      if (hits.length === 0) return ok(`(no skills found matching "${query}")`)
      // Two lines per hit so it's scannable; include install command
      // verbatim so the agent can paste/run it without thinking.
      return ok(hits.map((h) => {
        const meta = [h.version && `v${h.version}`, h.author && `by ${h.author}`].filter(Boolean).join(' · ')
        return `  ${h.name}${meta ? `  (${meta})` : ''}\n    ${h.description}\n    → lingxiloop skills install ${h.name}`
      }).join('\n\n'))
    } catch (e) {
      return err(`skills search failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (op === 'install') {
    const skillId = parsed.positional[1]
    if (!skillId) return err('usage: skills install <skill_id>')
    try {
      const { env } = await import('../env.js')
      const { fetchSkillManifest, installSkillFromManifest } = await import('./skills.js')
      const manifest = await fetchSkillManifest(skillId, env.SKILLHUB_URL)
      const result = await installSkillFromManifest({ agentId: me, manifest })
      return ok(
        `installed skill "${result.name}" (${result.files} file${result.files === 1 ? '' : 's'})\n` +
        `read it with: lingxiloop skills read ${result.name}`,
        [{
          event: 'skill.installed',
          command: 'skills install',
          agentId: me,
          skillName: result.name,
          fileCount: result.files,
          source: skillId,
        }],
      )
    } catch (e) {
      return err(`skills install failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return err(
    'usage:\n' +
    '  skills list                                 list installed skills (name + description only)\n' +
    '  skills read <name> [<sub-path>]             load full SKILL.md (or a bundled file)\n' +
    '  skills create <name> "<description>"        scaffold a new skill\n' +
    '  skills search <query>                       search the configured SkillHub\n' +
    '  skills install <skill_id>                   install a skill from SkillHub\n' +
    '  skills delete <name>                        remove a skill and all its files',
  )
}

/* ============== Polls ================================================
 * Agents create, vote on, inspect, and close native conversation polls. */
async function cmdPoll(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
  const sub = parsed.positional[0]
  if (!sub) {
    return err(
      'usage:\n' +
      '  poll create <convo_id> "<question>" "<opt1>" "<opt2>" [<opt3>...] [--mode single|multi] [--expires-in <minutes>]\n' +
      '  poll vote <message_id> <option_id>[,<option_id>...]    # multi-choice: comma-separated. Pass --clear to retract\n' +
      '  poll close <message_id>                                # only the author can close\n' +
      '  poll show <message_id>                                 # current tallies + your vote',
    )
  }
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  switch (sub) {
    case 'create': return cmdPollCreate(parsed, me, companyId, internal.idempotencyKey)
    case 'vote':   return cmdPollVote(parsed, me, companyId)
    case 'close':  return cmdPollClose(parsed, me, companyId)
    case 'show':   return cmdPollShow(parsed, me, companyId)
    default:       return err(`unknown poll subcommand: ${sub}`)
  }
}

async function cmdPollCreate(
  parsed: ParsedArgs,
  me: string,
  companyId: string,
  idempotencyKey?: string,
): Promise<CliResult> {
  const convoId = parsed.positional[1]
  const question = parsed.positional[2]
  const options = parsed.positional.slice(3).map(unescapeChat)
  if (!convoId || !question || options.length < 2) {
    return err('usage: poll create <convo_id> "<question>" "<opt1>" "<opt2>" [<opt3>...] [--mode single|multi] [--expires-in <minutes>]')
  }
  const mode = String(parsed.flags.mode ?? 'single') === 'multi' ? 'multi' : 'single'
  const expiresRaw = parsed.flags['expires-in']
  const expiresInMinutes = expiresRaw != null && expiresRaw !== ''
    ? Number(expiresRaw)
    : null
  if (expiresInMinutes != null && !Number.isFinite(expiresInMinutes)) {
    return err('--expires-in must be a number of minutes')
  }
  try {
    const { pollApplication } = await import('../modules/polls/index.js')
    const created = await pollApplication.create({
      conversationId: convoId,
      companyId,
      actorId: me,
      question: unescapeChat(question),
      mode,
      options,
      expiresInMinutes,
      idempotencyKey,
    })
    const optsTxt = created.poll.options.map((o) => `  ${o.id} → ${o.text}`).join('\n')
    return ok(
      `poll posted · ${created.messageId} (seq ${created.sequence})\n` +
      `mode: ${created.poll.mode}${created.poll.expiresAt ? `\nexpires: ${created.poll.expiresAt}` : ''}\n` +
      `options:\n${optsTxt}`,
      [{
        event: 'message.posted',
        command: 'poll',
        conversationId: convoId,
        messageId: created.messageId,
        authorId: me,
        companyId,
        visibleToUser: true,
      }],
    )
  } catch (e) {
    return err(`poll create failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function cmdPollVote(parsed: ParsedArgs, me: string, companyId: string): Promise<CliResult> {
  const messageId = parsed.positional[1]
  if (!messageId) return err('usage: poll vote <message_id> <option_id>[,<option_id>...] [--clear]')
  const optsRaw = parsed.positional[2] ?? ''
  const clear = Boolean(parsed.flags.clear)
  const optionIds = clear
    ? []
    : optsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  if (!clear && optionIds.length === 0) {
    return err('provide at least one option id, or pass --clear to retract')
  }
  try {
    const { pollApplication } = await import('../modules/polls/index.js')
    const event = await pollApplication.vote({
      messageId,
      companyId,
      actorId: me,
      voterKind: 'agent',
      optionIds,
    })
    const tallyTxt = event.tallies.length === 0
      ? '(no votes yet)'
      : event.tallies.map((t) => `  ${t.optionId} · ${t.count} (${t.voterIds.join(', ')})`).join('\n')
    return ok(
      clear
        ? `vote retracted on ${messageId}\n${tallyTxt}`
        : `vote cast on ${messageId} → ${optionIds.join(', ')}\n${tallyTxt}`,
    )
  } catch (e) {
    return err(`poll vote failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function cmdPollClose(parsed: ParsedArgs, me: string, companyId: string): Promise<CliResult> {
  const messageId = parsed.positional[1]
  if (!messageId) return err('usage: poll close <message_id>')
  try {
    const { pollApplication } = await import('../modules/polls/index.js')
    const event = await pollApplication.close({ messageId, companyId, actorId: me, reason: 'manual' })
    if (!event) return ok(`poll ${messageId} was already closed`)
    return ok(`poll ${messageId} closed`)
  } catch (e) {
    return err(`poll close failed: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function cmdPollShow(parsed: ParsedArgs, me: string, companyId: string): Promise<CliResult> {
  const messageId = parsed.positional[1]
  if (!messageId) return err('usage: poll show <message_id>')
  try {
    const { pollApplication } = await import('../modules/polls/index.js')
    const row = await pollApplication.show(companyId, messageId)
    const tallyMap = new Map(row.tallies.map((tally) => [
      tally.optionId,
      { cnt: tally.count, voters: tally.voterIds },
    ]))
    const lines = row.poll.options.map((option) => {
      const tally = tallyMap.get(option.id) ?? { cnt: 0, voters: [] as string[] }
      const mine = tally.voters.includes(me) ? ' ← you' : ''
      return `  ${option.id} (${tally.cnt}) · ${option.text}${mine}`
    }).join('\n')
    const head = [
      `poll ${messageId} · by ${row.author_id} · mode=${row.poll.mode}`,
      row.poll.closedAt ? `closed at ${row.poll.closedAt}` : (row.poll.expiresAt ? `expires ${row.poll.expiresAt}` : 'open'),
      row.poll.question,
    ].join('\n')
    return ok(`${head}\n${lines}`)
  } catch (error) {
    return err(`poll show failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const { cmdEmail } = createEmailCommand({
  ok,
  err,
  agentCompany,
  loadEmailAttachmentFromPath,
})
async function saveTextAttachment(
  companyId: string,
  filename: string,
  content: string,
): Promise<{ url: string; name: string; kind: 'file'; mime: string; size: number; key: string }> {
  // Sniff a reasonable mime from the extension so the renderer + agent
  // both know how to handle it (text/* gets inlined into context on read).
  const ext = filename.includes('.') ? filename.split('.').pop()!.toLowerCase() : 'txt'
  const mime = (() => {
    switch (ext) {
      case 'md': return 'text/markdown'
      case 'json': return 'application/json'
      case 'csv': return 'text/csv'
      case 'html': return 'text/html'
      case 'yml':
      case 'yaml': return 'application/x-yaml'
      case 'toml': return 'application/x-toml'
      default: return 'text/plain'
    }
  })()
  const buf = Buffer.from(content, 'utf8')
  const { randomUUID } = await import('node:crypto')
  const id = randomUUID().replace(/-/g, '')
  const key = `attachments/${companyId}/${id}.${ext}`
  const url = await storage.put(key, buf, mime)
  return { url, key, name: filename, kind: 'file', mime, size: buf.length }
}

const { cmdRename, cmdTopicRead, cmdTopicSet } = createConversationMetadataCommands({ ok, err })

/* ============== explicit coworker ownership / approval ================== */

async function cmdHandoff(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  const sub = parsed.positional[0]
  if (sub === 'create') {
    const conversationId = parsed.positional[1]
    const toAgentId = parsed.positional[2]
    const title = parsed.positional.slice(3).join(' ').trim()
    if (!conversationId || !toAgentId || !title) return err('usage: handoff create <conversation_id> <to_agent_id> <title> [--note text] [--paths a,b] [--browser-targets a,b]')
    const split = (value: unknown): string[] => typeof value === 'string'
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : []
    const handoff = await createHandoff({
      companyId, conversationId, fromAgentId: me, toAgentId, title,
      note: typeof parsed.flags.note === 'string' ? parsed.flags.note : null,
      sharedPaths: split(parsed.flags.paths),
      browserTargets: split(parsed.flags['browser-targets']),
      idempotencyKey: internal.idempotencyKey,
    })
    return ok(`handoff ${handoff.id} → ${toAgentId}: ${title}`, [{
      event: 'handoff.created', command: 'handoff', handoffId: handoff.id,
      conversationId, authorId: me, toAgentId, messageId: handoff.sourceMessageId,
      companyId, visibleToUser: true,
    }])
  }
  if (sub === 'complete' || sub === 'block' || sub === 'accept') {
    const handoffId = parsed.positional[1]
    if (!handoffId) return err(`usage: handoff ${sub} <handoff_id> [--note text]`)
    const status = sub === 'complete' ? 'completed' : sub === 'block' ? 'blocked' : 'accepted'
    const handoff = await updateHandoff({
      companyId, handoffId, actorAgentId: me, status,
      note: typeof parsed.flags.note === 'string' ? parsed.flags.note : null,
    })
    return ok(`handoff ${handoffId} ${status}`, [{
      event: `handoff.${status}`, command: 'handoff', handoffId,
      conversationId: handoff.conversationId, authorId: me,
      messageId: handoff.resultMessageId ?? undefined, companyId, visibleToUser: true,
    }])
  }
  return err('usage: handoff <create|accept|complete|block> ...')
}

async function cmdApproval(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  if (parsed.positional[0] !== 'request') return err('usage: approval request <conversation_id> <kind> <summary> --payload-json <json>')
  const conversationId = parsed.positional[1]
  const kind = parsed.positional[2]
  const summary = parsed.positional.slice(3).join(' ').trim()
  if (!conversationId || !summary || !['external_communication', 'sensitive_or_destructive_action', 'financial_or_irreversible_action'].includes(kind)) {
    return err('usage: approval request <conversation_id> <external_communication|sensitive_or_destructive_action|financial_or_irreversible_action> <summary> --payload-json <json>')
  }
  let payload: Record<string, unknown> = {}
  if (typeof parsed.flags['payload-json'] === 'string') {
    try {
      const value = JSON.parse(parsed.flags['payload-json']) as unknown
      if (!value || typeof value !== 'object' || Array.isArray(value)) return err('--payload-json must be an object')
      payload = value as Record<string, unknown>
    } catch { return err('--payload-json must be valid JSON') }
  }
  const approval = await requestApproval({
    companyId, agentId: me, conversationId,
    kind: kind as 'external_communication' | 'sensitive_or_destructive_action' | 'financial_or_irreversible_action',
    summary, payload,
  })
  return ok(`waiting for human approval ${approval.id}`, [{
    event: 'approval.requested', command: 'approval', approvalId: approval.id,
    conversationId, messageId: approval.messageId, authorId: me, companyId,
    visibleToUser: true, waitingForHuman: true,
  }])
}

async function cmdAutonomy(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  if (parsed.positional[0] !== 'remember') {
    return err('usage: autonomy remember <conversation_id> <scope> <operation> <allow|ask|deny>')
  }
  const conversationId = parsed.positional[1]
  const scope = parsed.positional[2]?.trim()
  const operation = parsed.positional[3]?.trim()
  const mode = parsed.positional[4]
  if (!conversationId || !scope || !operation || !['allow', 'ask', 'deny'].includes(mode)) {
    return err('usage: autonomy remember <conversation_id> <scope> <operation> <allow|ask|deny>')
  }
  const history = await getAgentChannelHistory({ companyId, agentId: me, channelId: conversationId, limit: 200 })
  if (!history) return err(`unknown authoritative channel ${conversationId}`)
  const authorIds = [...new Set(history.map((message) => message.fromUid))]
  const { rows: humans } = authorIds.length > 0
    ? await pool.query<{ id: string }>(
      `SELECT id FROM participants WHERE company_id=$1 AND kind='human' AND id=ANY($2::text[])`,
      [companyId, authorIds],
    )
    : { rows: [] }
  const humanIds = new Set(humans.map((human) => human.id))
  const userId = [...history]
    .sort((left, right) => right.messageSeq - left.messageSeq)
    .find((message) => humanIds.has(message.fromUid))?.fromUid
  if (!userId) return err('autonomy rules require an explicit human instruction in this conversation')
  const rule = await upsertAutonomyRule({
    companyId,
    userId,
    agentId: me,
    scope,
    operation,
    mode: mode as 'allow' | 'ask' | 'deny',
    source: 'explicit_user',
  })
  return ok(`remembered autonomy rule ${scope}.${operation}=${mode}`, [{
    event: 'autonomy.learned',
    command: 'autonomy remember',
    ruleId: rule.id,
    agentId: me,
    conversationId,
    scope,
    operation,
    mode,
    companyId,
    visibleToUser: true,
  }])
}

/* ============== private agent state: memory / log / workspace / tasks ============== */

/** Whitelisted memory kinds. Becomes a path segment, so we keep it
 *  small + slug-safe — agents can't write `memory/Whatever-They-Want/`. */
const MEMORY_KINDS = ['observation', 'preference', 'fact', 'instruction', 'relationship', 'decision', 'note'] as const
type MemoryKind = typeof MEMORY_KINDS[number]
function normalizeMemoryKind(raw: unknown): MemoryKind {
  const s = String(raw ?? '').trim().toLowerCase()
  return (MEMORY_KINDS as readonly string[]).includes(s) ? s as MemoryKind : 'observation'
}

/** Memory is stored as files inside the agent's workspace under
 *  `memory/<kind>/<id>.md`. Structured fields (`kind`, `about`, `pinned`,
 *  `source`, `createdAt`) live in the `meta` JSONB column. Reads use a
 *  `path LIKE 'memory/%'` prefix plus a partial JSONB index on
 *  `meta->>'about'` for the common `--about <subject>` filter. See
 *  v1 schema for the canonical workspace representation. */
async function cmdMemory(parsed: ParsedArgs): Promise<CliResult> {
  const op = parsed.positional[0]
  const me = resolveAs(parsed)
  if (op === 'list') {
    const params: unknown[] = [me]
    let where = `agent_id = $1 AND path LIKE 'memory/%'`
    if (parsed.flags.about) {
      params.push(String(parsed.flags.about))
      where += ` AND meta->>'about' = $${params.length}`
    }
    if (parsed.flags.kind) {
      const k = normalizeMemoryKind(parsed.flags.kind)
      params.push(`memory/${k}/%`)
      where += ` AND path LIKE $${params.length}`
    }
    const limit = Math.min(100, Math.max(1, Number(parsed.flags.limit ?? 20)))
    params.push(limit)
    const limitParam = `$${params.length}`
    const { rows } = await pool.query<{
      path: string; body: string; meta: Record<string, unknown> | null; updated_at: string
    }>(
      `SELECT path, body, meta, updated_at
         FROM agent_workspace WHERE ${where}
         ORDER BY COALESCE((meta->>'pinned')::boolean, false) DESC, updated_at DESC
         LIMIT ${limitParam}`,
      params,
    )
    // Path segment encodes the kind; file stem is the id (sans `.md`).
    const parsed_rows = rows.map((r) => {
      const segs = r.path.split('/')
      const kind = segs[1] ?? 'note'
      const id = (segs[2] ?? '').replace(/\.md$/, '')
      const about = (r.meta?.about as string | undefined) ?? null
      const pinned = Boolean(r.meta?.pinned)
      return { id, kind, about, body: r.body, pinned, created_at: r.updated_at }
    })
    if (parsed.flags.json) return ok(JSON.stringify(parsed_rows, null, 2))
    if (parsed_rows.length === 0) return ok(`(${me} has no memory yet)`)
    return ok([
      `${parsed_rows.length} memory record(s) for ${me}:`,
      '',
      ...parsed_rows.map((m) => {
        const t = new Date(m.created_at).toLocaleDateString()
        const pin = m.pinned ? '★ ' : '  '
        return `  ${pin}[${m.id.slice(0, 10)}] ${m.kind.padEnd(11)} ${(m.about ?? '-').padEnd(10)} ${t}\n      ${m.body.slice(0, 280).replace(/\n/g, ' \\n ')}`
      }),
    ].join('\n'))
  }
  if (op === 'note') {
    const body = parsed.positional[1]
    if (!body) return err('usage: memory note <body> [--about subject] [--kind kind] [--as id]')
    const kind = normalizeMemoryKind(parsed.flags.kind ?? 'observation')
    const about = parsed.flags.about ? String(parsed.flags.about) : null
    const id = `mem-${randomUUID().slice(0, 12)}`
    const path = `memory/${kind}/${id}.md`
    const tenant = await agentCompany(me)
    const meta = { type: 'memory', kind, about, pinned: false, source: null, createdAt: new Date().toISOString() }
    // Compute the embedding before INSERT so the row lands with both body
    // and vector atomically. Provider failures fail the command explicitly.
    const { embedText } = await import('./embeddings.js')
    const embedding = await embedText(body, { companyId: tenant, agentId: me })
    await pool.query(
      `INSERT INTO agent_workspace (agent_id, path, body, meta, embedding, company_id, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::vector, $6, NOW())`,
      [me, path, body, JSON.stringify(meta), embedding, tenant],
    )
    await pool.query(
      `INSERT INTO agent_log (id, agent_id, kind, body, ref) VALUES ($1, $2, 'note', $3, $4::jsonb)`,
      [`log-${randomUUID().slice(0, 12)}`, me, `noted: ${body.slice(0, 120)}`, JSON.stringify({ memoryId: id, path })],
    )
    return ok(`saved memory ${id}`, [{
      event: 'memory.written',
      command: 'memory note',
      memoryId: id,
      path,
      agentId: me,
      kind,
      about,
    }])
  }
  if (op === 'pin') {
    const id = parsed.positional[1]
    if (!id) return err('usage: memory pin <id>')
    // Toggle the `pinned` flag in meta JSONB. `||` on jsonb merges keys
    // (right-hand side wins), so we read+rewrite by setting just that
    // key and let Postgres handle the rest.
    const r = await pool.query<{ meta: Record<string, unknown> }>(
      `UPDATE agent_workspace
          SET meta = COALESCE(meta, '{}'::jsonb)
                   || jsonb_build_object('pinned', NOT COALESCE((meta->>'pinned')::boolean, false))
        WHERE agent_id = $1 AND path LIKE $2
        RETURNING meta`,
      [me, `memory/%/${id}.md`],
    )
    if ((r.rowCount ?? 0) === 0) return err(`no memory ${id} for ${me}`)
    return ok(`pinned: ${r.rows[0].meta?.pinned}`, [{
      event: 'memory.pinned',
      command: 'memory pin',
      memoryId: id,
      agentId: me,
      pinned: Boolean(r.rows[0].meta?.pinned),
    }])
  }
  if (op === 'delete') {
    const id = parsed.positional[1]
    if (!id) return err('usage: memory delete <id>')
    const r = await pool.query(
      `DELETE FROM agent_workspace WHERE agent_id = $1 AND path LIKE $2`,
      [me, `memory/%/${id}.md`],
    )
    if ((r.rowCount ?? 0) === 0) return err(`no memory ${id} for ${me}`)
    return ok(`deleted ${id}`, [{
      event: 'memory.deleted',
      command: 'memory delete',
      memoryId: id,
      agentId: me,
    }])
  }
  return err(`usage: memory <list|note|pin|delete> [...]`)
}

/* ============== Climate (情感系统) — per-agent feelings about people ============== */

/** Clamp to [-1, 1]; coerces strings/numbers; falls back to 0 on garbage. */
function clamp01(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(-1, Math.min(1, n))
}

async function cmdClimate(parsed: ParsedArgs): Promise<CliResult> {
  const op = parsed.positional[0] ?? 'read'
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)

  if (op === 'read') {
    const about = parsed.positional[1]
    const params: unknown[] = [companyId, me]
    let where = `company_id = $1 AND agent_id = $2`
    if (about) { params.push(about); where += ` AND about_id = $${params.length}` }
    const { rows } = await pool.query<{
      about_id: string; affinity: number; trust: number; last_note: string; updated_at: string
    }>(
      `SELECT about_id, affinity, trust, last_note, updated_at
         FROM agent_climate WHERE ${where}
         ORDER BY updated_at DESC LIMIT 50`,
      params,
    )
    if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
    if (rows.length === 0) {
      return ok(about
        ? `(no climate noted for ${me} → ${about})`
        : `(no climate notes saved yet for ${me})`)
    }
    const fmt = (n: number) => (n >= 0 ? `+${n.toFixed(2)}` : n.toFixed(2))
    return ok([
      `Climate around ${me} (${rows.length} relationship${rows.length === 1 ? '' : 's'}):`,
      '',
      ...rows.map((r) => {
        const t = new Date(r.updated_at).toLocaleDateString()
        return `  ${r.about_id.padEnd(10)}  affinity=${fmt(r.affinity)}  trust=${fmt(r.trust)}  ${t}\n      ${r.last_note.slice(0, 240).replace(/\n/g, ' \\n ')}`
      }),
    ].join('\n'))
  }

  if (op === 'note') {
    // usage: climate note <about_id> "<note>" [--affinity n] [--trust n] [--as id]
    const aboutId = parsed.positional[1]
    const note = unescapeChat(parsed.positional.slice(2).join(' ')).trim()
    if (!aboutId || !note) {
      return err('usage: climate note <about_id> "<note>" [--affinity -1..1] [--trust -1..1]')
    }
    const affinityFlag = parsed.flags.affinity
    const trustFlag = parsed.flags.trust
    // Read prior so we can seed the deltas if the agent didn't supply them.
    const { rows: prior } = await pool.query<{
      affinity: number; trust: number; history: unknown
    }>(
      `SELECT affinity, trust, history FROM agent_climate
        WHERE company_id = $1 AND agent_id = $2 AND about_id = $3`,
      [companyId, me, aboutId],
    )
    const prevAffinity = prior[0]?.affinity ?? 0
    const prevTrust = prior[0]?.trust ?? 0
    const nextAffinity = affinityFlag !== undefined ? clamp01(affinityFlag) : prevAffinity
    const nextTrust    = trustFlag    !== undefined ? clamp01(trustFlag)    : prevTrust
    // Append a small history entry. Cap history length so it doesn't grow
    // unbounded — keep only the last 20 notes.
    const prevHistory = Array.isArray(prior[0]?.history) ? prior[0]!.history as Array<unknown> : []
    const newHistory = [
      ...prevHistory.slice(-19),
      { at: new Date().toISOString(), affinity: nextAffinity, trust: nextTrust, note: note.slice(0, 400) },
    ]
    await pool.query(
      `INSERT INTO agent_climate (company_id, agent_id, about_id, affinity, trust, last_note, history, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
       ON CONFLICT (company_id, agent_id, about_id) DO UPDATE
         SET affinity = EXCLUDED.affinity,
             trust    = EXCLUDED.trust,
             last_note = EXCLUDED.last_note,
             history   = EXCLUDED.history,
             updated_at = NOW()`,
      [companyId, me, aboutId, nextAffinity, nextTrust, note.slice(0, 400), JSON.stringify(newHistory)],
    )
    return ok(`climate updated: ${me} → ${aboutId}  affinity=${nextAffinity.toFixed(2)}  trust=${nextTrust.toFixed(2)}`, [{
      event: 'climate.updated',
      command: 'climate note',
      agentId: me,
      aboutId,
      affinity: nextAffinity,
      trust: nextTrust,
    }])
  }

  if (op === 'forget') {
    const aboutId = parsed.positional[1]
    if (!aboutId) return err('usage: climate forget <about_id>')
    const r = await pool.query(
      `DELETE FROM agent_climate WHERE company_id = $1 AND agent_id = $2 AND about_id = $3`,
      [companyId, me, aboutId],
    )
    if ((r.rowCount ?? 0) === 0) return err(`no climate to forget for ${me} → ${aboutId}`)
    return ok(`forgot climate ${me} → ${aboutId}`, [{
      event: 'climate.deleted',
      command: 'climate forget',
      agentId: me,
      aboutId,
    }])
  }

  return err('usage: climate <read|note|forget> [...]')
}

async function cmdLog(parsed: ParsedArgs): Promise<CliResult> {
  const op = parsed.positional[0] ?? 'list'
  const me = resolveAs(parsed)
  if (op === 'note') {
    const body = parsed.positional[1]
    if (!body) return err('usage: log note <body> [--as id]')
    const id = `log-${randomUUID().slice(0, 12)}`
    await pool.query(
      `INSERT INTO agent_log (id, agent_id, kind, body) VALUES ($1, $2, 'note', $3)`,
      [id, me, body],
    )
    return ok(`logged ${id}`)
  }
  // list (default)
  const limit = Math.min(100, Math.max(1, Number(parsed.flags.limit ?? 30)))
  const { rows } = await pool.query<{
    id: string; kind: string; body: string; ref: unknown; created_at: string
  }>(
    `SELECT id, kind, body, ref, created_at
       FROM agent_log WHERE agent_id = $1
       ORDER BY created_at DESC LIMIT $2`,
    [me, limit],
  )
  if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
  if (rows.length === 0) return ok(`(no log entries for ${me})`)
  return ok([
    `last ${rows.length} log entries for ${me}:`,
    '',
    ...rows.map((r) => {
      const t = new Date(r.created_at).toLocaleString()
      return `  [${t}] ${r.kind.padEnd(10)} ${r.body.slice(0, 200)}`
    }),
  ].join('\n'))
}

async function cmdWorkspace(parsed: ParsedArgs): Promise<CliResult> {
  const op = parsed.positional[0]
  const me = resolveAs(parsed)
  // Resolve the agent's tenant once — every write needs to carry the
  // company_id so the Observability view (which filters by tenant)
  // can actually see what the agent stores. Reads are agent-scoped
  // (agent_id is globally unique) so they don't need it.
  const tenant = await agentCompany(me)
  if (op === 'ls') {
    const { rows } = await pool.query<{ path: string; updated_at: string }>(
      `SELECT path, updated_at FROM agent_workspace WHERE agent_id = $1 ORDER BY path ASC`,
      [me],
    )
    if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
    if (rows.length === 0) return ok(`(${me}'s workspace is empty)`)
    return ok([
      `${rows.length} file(s) in ${me}'s workspace:`,
      '',
      ...rows.map((r) => `  ${r.path.padEnd(40)} ${new Date(r.updated_at).toLocaleString()}`),
    ].join('\n'))
  }
  if (op === 'read') {
    const path = parsed.positional[1]
    if (!path) return err('usage: workspace read <path> [--as id]')
    const { rows } = await pool.query<{ body: string; updated_at: string }>(
      `SELECT body, updated_at FROM agent_workspace WHERE agent_id = $1 AND path = $2`,
      [me, path],
    )
    if (!rows[0]) return err(`no file at ${path} in ${me}'s workspace`)
    return ok(rows[0].body)
  }
  if (op === 'write') {
    const path = parsed.positional[1]
    const body = parsed.positional.slice(2).join(' ')
    if (!path || !body) return err('usage: workspace write <path> <body> [--as id]')
    await pool.query(
      `INSERT INTO agent_workspace (agent_id, path, body, company_id, updated_at) VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (agent_id, path) DO UPDATE SET body = EXCLUDED.body, company_id = EXCLUDED.company_id, updated_at = NOW()`,
      [me, path, body, tenant],
    )
    return ok(`wrote ${path} (${body.length} chars)`, [{
      event: 'workspace.file_written',
      command: 'workspace write',
      agentId: me,
      companyId: tenant ?? undefined,
      path,
      bodyLength: body.length,
    }])
  }
  if (op === 'delete') {
    const path = parsed.positional[1]
    if (!path) return err('usage: workspace delete <path> [--as id]')
    const r = await pool.query(`DELETE FROM agent_workspace WHERE agent_id = $1 AND path = $2`, [me, path])
    if ((r.rowCount ?? 0) === 0) return err(`no file at ${path}`)
    return ok(`deleted ${path}`, [{
      event: 'workspace.file_deleted',
      command: 'workspace delete',
      agentId: me,
      companyId: tenant ?? undefined,
      path,
    }])
  }
  if (op === 'edit') {
    const path = parsed.positional[1]
    const oldStr = parsed.positional[2]
    const newStr = parsed.positional[3] ?? ''
    if (!path || oldStr === undefined) return err('usage: workspace edit <path> <old> <new> [--as id]')
    const { rows } = await pool.query<{ body: string }>(
      `SELECT body FROM agent_workspace WHERE agent_id = $1 AND path = $2`, [me, path],
    )
    if (!rows[0]) return err(`no file at ${path}`)
    const body = rows[0].body
    const occurrences = body.split(oldStr).length - 1
    if (occurrences === 0) return err(`old string not found in ${path}`)
    if (occurrences > 1 && !parsed.flags.all) return err(`old string appears ${occurrences} times in ${path} — pass --all or include more context to make it unique`)
    const next = parsed.flags.all ? body.split(oldStr).join(newStr) : body.replace(oldStr, newStr)
    await pool.query(
      `UPDATE agent_workspace SET body = $3, updated_at = NOW() WHERE agent_id = $1 AND path = $2`,
      [me, path, next],
    )
    return ok(`edited ${path} (${occurrences} replacement${occurrences === 1 ? '' : 's'})`, [{
      event: 'workspace.file_updated',
      command: 'workspace edit',
      agentId: me,
      companyId: tenant ?? undefined,
      path,
      replacements: occurrences,
      bodyLength: next.length,
    }])
  }
  if (op === 'grep') {
    const pattern = parsed.positional[1]
    if (!pattern) return err('usage: workspace grep <pattern> [--as id]')
    let re: RegExp
    try { re = new RegExp(pattern, parsed.flags.i ? 'gi' : 'g') } catch { return err(`bad regex: ${pattern}`) }
    const { rows } = await pool.query<{ path: string; body: string }>(
      `SELECT path, body FROM agent_workspace WHERE agent_id = $1 ORDER BY path ASC`, [me],
    )
    const hits: string[] = []
    for (const r of rows) {
      const lines = r.body.split('\n')
      lines.forEach((line, i) => {
        if (re.test(line)) hits.push(`  ${r.path}:${i + 1}: ${line.slice(0, 200)}`)
        re.lastIndex = 0
      })
    }
    if (parsed.flags.json) return ok(JSON.stringify(hits, null, 2))
    if (hits.length === 0) return ok(`(no matches for /${pattern}/ in ${me}'s workspace)`)
    return ok([`${hits.length} match(es):`, '', ...hits].join('\n'))
  }
  return err(`usage: workspace <ls|read|write|edit|grep|delete> [...]`)
}

async function cmdTasks(parsed: ParsedArgs): Promise<CliResult> {
  const op = parsed.positional[0] ?? 'list'
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (op === 'list') {
    const params: unknown[] = [me]
    let where = `agent_id = $1`
    if (parsed.flags.status) { params.push(String(parsed.flags.status)); where += ` AND status = $${params.length}` }
    const { rows } = await pool.query<{
      id: string; title: string; status: string; due_at: string | null;
      created_at: string; updated_at: string
    }>(
      `SELECT id, title, status, due_at, created_at, updated_at
         FROM agent_tasks WHERE ${where} ORDER BY status ASC, updated_at DESC`,
      params,
    )
    if (parsed.flags.json) return ok(JSON.stringify(rows, null, 2))
    if (rows.length === 0) return ok(`(no tasks for ${me})`)
    return ok([
      `${rows.length} task(s) for ${me}:`,
      '',
      ...rows.map((t) => `  [${t.status.padEnd(7)}] ${t.id.slice(0, 12).padEnd(13)} ${t.title}`),
    ].join('\n'))
  }
  if (op === 'add') {
    const title = parsed.positional.slice(1).join(' ')
    if (!title) return err('usage: tasks add <title> [--as id]')
    const id = `task-${randomUUID().slice(0, 12)}`
    await pool.query(
      `INSERT INTO agent_tasks (id, agent_id, title) VALUES ($1, $2, $3)`,
      [id, me, title],
    )
    return ok(`added task ${id}: ${title}`, [{
      event: 'task.created',
      command: 'tasks add',
      taskId: id,
      agentId: me,
      companyId: companyId ?? undefined,
      title,
      status: 'open',
      visibleToUser: true,
    }])
  }
  if (op === 'set') {
    const id = parsed.positional[1]
    const status = parsed.positional[2]
    if (!id || !status) return err('usage: tasks set <task_id> <status>')
    if (!['open', 'doing', 'done', 'dropped'].includes(status)) return err(`bad status: ${status}`)
    const r = await pool.query(
      `UPDATE agent_tasks SET status = $3, updated_at = NOW() WHERE id = $1 AND agent_id = $2`,
      [id, me, status],
    )
    if ((r.rowCount ?? 0) === 0) return err(`no task ${id} for ${me}`)
    return ok(`task ${id} → ${status}`, [{
      event: 'task.status_changed',
      command: 'tasks set',
      taskId: id,
      agentId: me,
      companyId: companyId ?? undefined,
      status,
      visibleToUser: true,
    }])
  }
  return err(`usage: tasks <list|add|set> [...]`)
}

/* ============== calendar ==============
 *
 * Same calendar humans see — agents read upcoming events assigned to them
 * (so "what's on my plate today" is a single command) and create new
 * events to schedule work for themselves or another agent. All rows live
 * in the agent's company; cross-tenant safety is enforced the same way as
 * tasks/email above.
 */

/** Resolve the explicit workspace inherited from an Agent OS turn. */
async function resolveCliProjectId(companyId: string, requested?: string): Promise<string> {
  if (!requested) throw new Error('projectId is required')
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM projects
      WHERE company_id=$1 AND status <> 'archived'
        AND id=$2
      LIMIT 1`,
    [companyId, requested],
  )
  if (!rows[0]) throw new Error('knowledge workspace is unavailable')
  return rows[0].id
}

const { cmdCalendar } = createCalendarCommand({
  ok,
  err,
  agentCompany,
  resolveCliProjectId,
  tryClaimTenantWork,
  releaseTenantWork,
})
const { cmdBoard, cmdClaim, cmdCard } = createBoardCommands({
  ok,
  err,
  agentCompany,
  resolveCliProjectId,
})
async function cmdReact(parsed: ParsedArgs): Promise<CliResult> {
  const me = resolveAs(parsed)
  const companyId = await agentCompany(me)
  if (!companyId) return err(`unknown agent ${me} (no company)`)
  const channelId = parsed.positional[0]
  const messageId = parsed.positional[1]
  const emoji = parsed.positional[2]
  if (!channelId || !messageId || !emoji) return err('usage: react <conversation_id> <message_id> <emoji>')
  const result = await toggleAgentChannelReaction({ companyId, agentId: me, channelId, messageId, emoji })
  if (result.kind === 'channel_not_found') return err(`unknown authoritative channel ${channelId}`)
  if (result.kind === 'message_not_found') return err(`message ${messageId} not found in ${channelId}`)
  const aggregate = result.reactions.find((reaction) => reaction.emoji === emoji)
  const action = aggregate?.users.includes(me) ? 'added' : 'removed'
  return ok(`${action} ${emoji} on ${messageId}`, [{
    event: 'reaction.updated',
    command: 'react',
    visibleToUser: true,
    actorId: me,
    conversationId: channelId,
    messageId,
    emoji,
    action,
  }])
}
function buildToolArgs(toolName: string, parsed: ParsedArgs): { argsJson: string } | { error: string } {
  const pos = parsed.positional
  const f = parsed.flags
  switch (toolName) {
    case 'dm_with': {
      const partnerId = pos[0]
      const topic = pos[1] ?? (f.topic ? String(f.topic) : '')
      const opening = pos[2] ?? (f.say ? String(f.say) : (f.message ? String(f.message) : ''))
      if (!partnerId) return { error: 'usage: dm <partner_id> <topic> <opening>  OR  dm <partner_id> --topic "..." --say "..."' }
      if (!topic || !opening) return { error: 'dm requires both topic and opening message (positional or --topic/--say)' }
      return { argsJson: JSON.stringify({ partner_id: partnerId, topic, opening_message: opening }) }
    }
    case 'pull_group': {
      const title = pos[0]
      if (!title) return { error: 'usage: pull-group <title> --members a,b,c --leader a --reason "..." --say "..."' }
      const membersFlag = f.members ? String(f.members) : ''
      const members = membersFlag.split(',').map((s) => s.trim()).filter(Boolean)
      if (members.length === 0) return { error: 'pull-group requires --members a,b,c' }
      const leaderId = f.leader ? String(f.leader).trim() : ''
      if (!leaderId) return { error: 'pull-group requires --leader <agent_id>' }
      const reason = f.reason ? String(f.reason) : ''
      const opening = f.say ? String(f.say) : (f.message ? String(f.message) : '')
      if (!reason || !opening) return { error: 'pull-group requires --reason "..." and --say "..."' }
      return { argsJson: JSON.stringify({ title, members, leader_id: leaderId, reason, opening_message: opening }) }
    }
    case 'palette': {
      const brief = pos.join(' ').trim() || (f.brief ? String(f.brief) : '')
      if (!brief) return { error: 'usage: palette <brief>' }
      return { argsJson: JSON.stringify({ brief }) }
    }
    default:
      return { error: `unknown tool: ${toolName}` }
  }
}

/* ============== Collaborative documents (CRDT) ==============
 *
 * Agents drive the same Y.Doc rooms the humans see. Edits are applied
 * through the in-process room manager so the WS fan-out + persistence
 * happens automatically — the human's editor sees the agent's cursor
 * + insertion live, as if a remote teammate just typed it.
 */
const { cmdDoc } = createDocumentCommand({
  ok,
  err,
  agentCompany,
  resolveCliProjectId,
  tryClaimTenantWork,
  releaseTenantWork,
  cmdReply,
})
async function runTool(toolName: string, parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
  const built = buildToolArgs(toolName, parsed)
  if ('error' in built) return err(built.error)
  const me = resolveAs(parsed)

  const { executeTool } = await import('./tools.js')
  // Internal idempotency key (issue #7) — out-of-band only, see
  // RunCliInternalContext. Passed as a first-class executeTool param
  // rather than folded into argsJson so it can never be confused with
  // (or overridden by) a model/CLI-supplied tool argument.
  const r = await executeTool({
    agentId: me,
    companyId: await agentCompany(me),
    name: toolName,
    argsJson: built.argsJson,
    idempotencyKey: internal.idempotencyKey,
  })
  const sideEffects = cliToolSideEffects(toolName, r.output, me)
  if (parsed.flags.json) {
    return r.ok
      ? ok(JSON.stringify(r.output, null, 2), sideEffects)
      : { ok: false, text: JSON.stringify({ error: r.error, display: r.display }, null, 2), exitCode: 1 }
  }
  const detail = r.display.detail || (r.output ? JSON.stringify(r.output, null, 2) : '(no output)')
  if (!r.ok) return err(`${r.display.name} failed: ${r.error ?? r.display.status}\n${detail}`)
  const head = `${r.display.name} → ${r.display.status}`
  return ok(`${head}\n\n${detail}`, sideEffects)
}

function cliToolSideEffects(toolName: string, output: unknown, agentId: string): CliSideEffect[] | undefined {
  if (!output || typeof output !== 'object' || Array.isArray(output)) return undefined
  const o = output as Record<string, unknown>
  switch (toolName) {
    case 'dm_with':
      return [{
        event: 'conversation.created',
        command: 'dm',
        actorId: agentId,
        conversationId: String(o.conversationId ?? ''),
        partnerId: String(o.partnerId ?? ''),
        topic: String(o.topic ?? ''),
        visibleToUser: true,
      }]
    case 'pull_group':
      return [{
        event: 'conversation.created',
        command: 'pull-group',
        actorId: agentId,
        conversationId: String(o.conversationId ?? ''),
        members: Array.isArray(o.members) ? o.members.map((m) => String(m)) : [],
        visibleToUser: true,
      }]
    default:
      return undefined
  }
}

/* ============== entry point ============== */

/** Trusted, out-of-band execution context that never travels through argv
 *  (issue #7 review: a plain `--idempotency-key` argv flag is settable by
 *  any caller outside the typed Host Bridge — none of which
 *  should be able to spoof a LingxiLoop-generated idempotency key). Only
 *  `executeCommunicationActions()` (via `AgentRuntimeClient.executeCli`'s
 *  `internal` param) ever supplies this — there is no argv flag, CLI help
 *  text, or parseArgs path that can set it. */
export interface RunCliInternalContext {
  idempotencyKey?: string
  /** Workspace inherited from the Agent OS trigger conversation. */
  projectId?: string
}

/**
 * Structured in-process domain entrypoint used by Agent OS. It deliberately
 * bypasses argv/token parsing: the Host Bridge has already schema-checked a
 * namespace.method action and supplies typed JSON values.
 *
 * The command handlers are shared during the cutover so the mature learning
 * capability implementations retain their validation and side-effect ledger.
 * No executable, shell, CLI string, or provider Agent product is involved.
 */
export async function runStructuredLearningAction(
  action: string,
  values: Record<string, unknown>,
  identity: string,
  internal: RunCliInternalContext = {},
): Promise<CliResult> {
  const [namespace, rawMethod] = action.split('.')
  if (!namespace || !rawMethod) return err('action must use namespace.method')
  const method = rawMethod.replaceAll('_', '-')
  const flags: Record<string, string | boolean> = { as: identity }
  const excluded = new Set<string>()
  const positional: string[] = []
  const stringValue = (key: string, required = true): string => {
    const value = typeof values[key] === 'string' ? values[key].trim() : ''
    if (required && !value) throw new Error(`${key} is required`)
    excluded.add(key)
    return value
  }

  let command = ''
  if (namespace === 'memory') {
    command = 'memory'; positional.push(method)
    if (method === 'note') positional.push(stringValue('body'))
    if (method === 'search') positional.push(stringValue('query'))
  } else if (namespace === 'skills') {
    command = 'skills'; positional.push(method)
    if (method !== 'list') {
      const name = stringValue('name', false)
      if (name) positional.push(name)
    }
  } else if (namespace === 'files') {
    command = 'workspace'; positional.push(method === 'list' ? 'ls' : method)
    if (method === 'list') {
      const path = stringValue('path', false); if (path) positional.push(path)
    } else if (method === 'write') positional.push(stringValue('path'), stringValue('body'))
    else if (method === 'edit') positional.push(stringValue('path'), stringValue('find'), stringValue('replace'))
    else positional.push(stringValue(method === 'grep' ? 'query' : 'path'))
  } else if (namespace === 'documents') {
    command = 'doc'; positional.push(method === 'list' ? 'ls' : method)
    if (method === 'create') positional.push(stringValue('title'))
    else if (method === 'replace') positional.push(stringValue('documentId'))
    else if (method !== 'list') {
      positional.push(stringValue('documentId'))
      const value = stringValue(method === 'rename' ? 'title' : 'body', method !== 'read' && method !== 'delete')
      if (value) positional.push(value)
    }
  } else if (namespace === 'boards') {
    const isCard = method.startsWith('card-')
    command = isCard ? 'card' : 'kanban'
    const operation = method.replace(/^card-/, '')
    positional.push(operation === 'list' ? 'ls' : operation)
    const id = stringValue(isCard ? 'cardId' : 'boardId', false)
    const title = stringValue('title', false)
    if (id) positional.push(id)
    if (title) positional.push(title)
  } else if (namespace === 'calendar') {
    command = 'calendar'; positional.push(method)
  } else if (namespace === 'polls') {
    command = 'poll'; positional.push(method)
    const id = stringValue('messageId', false); if (id) positional.push(id)
  } else if (namespace === 'email') {
    command = 'email'; positional.push(method)
    const id = stringValue('messageId', false); if (id) positional.push(id)
  } else {
    return err(`unsupported structured namespace: ${namespace}`)
  }

  for (const [key, value] of Object.entries(values)) {
    if (excluded.has(key) || value === undefined || value === null || value === false) continue
    const flag = key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)
    flags[flag] = value === true ? true : Array.isArray(value) ? value.map(String).join(',') : String(value)
  }
  const parsed: ParsedArgs = { positional, flags }
  try {
    switch (command) {
      case 'memory': return await cmdMemory(parsed)
      case 'skills': return await cmdSkills(parsed)
      case 'workspace': return await cmdWorkspace(parsed)
      case 'doc': return await cmdDoc(parsed, internal)
      case 'kanban': return await cmdBoard(parsed, internal)
      case 'card': return await cmdCard(parsed, internal)
      case 'calendar': return await cmdCalendar(parsed, internal)
      case 'poll': return await cmdPoll(parsed, internal)
      case 'email': return await cmdEmail(parsed, internal)
      default: return err(`unsupported structured action: ${action}`)
    }
  } catch (error) {
    return err(`error: ${error instanceof Error ? error.message : String(error)}`, 2)
  }
}

export async function runCli(argv: string[], internal: RunCliInternalContext = {}): Promise<CliResult> {
  // Pull a leading global `--as <id>` (or `--as=<id>`) off. Runtime `/cli`
  // prepends identity this way, and direct dev/test callers often do too.
  // Re-attach it to the subcommand args so per-command parsers still see
  // `parsed.flags.as`.
  let asFlag: string | null = null
  while (argv.length > 0 && (argv[0] === '--as' || argv[0].startsWith('--as='))) {
    if (argv[0] === '--as') {
      asFlag = argv[1] ?? null
      argv = argv.slice(2)
    } else {
      asFlag = argv[0].slice('--as='.length)
      argv = argv.slice(1)
    }
  }
  if (argv.length === 0) return cmdHelp()
  const sub = argv[0]
  const rest = argv.slice(1)
  const parsed = parseArgs(rest)
  if (asFlag !== null && parsed.flags.as === undefined) {
    parsed.flags.as = asFlag
  }
  try {
    switch (sub) {
      case 'help':
      case '--help':
      case '-h':
        return await cmdHelp()
      case 'whoami':              return await cmdWhoami(parsed)
      case 'participants':        return await cmdParticipants(parsed)
      case 'conversations':       return await cmdConversations(parsed)
      case 'groups':              return await cmdConversations(parsed, 'group')
      case 'directs':             return await cmdConversations(parsed, 'direct')
      case 'members':             return await cmdMembers(parsed)
      case 'messages':            return await cmdMessages(parsed)
      case 'thread':              return await cmdThread(parsed)
      case 'convening':           return await cmdConvening(parsed)
      case 'search':              return await cmdSearch(parsed)
      case 'tools-log':           return await cmdToolsLog(parsed)
      case 'participants-status': return await cmdStatus(parsed)
      case 'memory':              return await cmdMemory(parsed)
      case 'handoff':             return await cmdHandoff(parsed, internal)
      case 'approval':            return await cmdApproval(parsed)
      case 'autonomy':            return await cmdAutonomy(parsed)
      case 'climate':             return await cmdClimate(parsed)
      case 'log':                 return await cmdLog(parsed)
      case 'workspace':           return await cmdWorkspace(parsed)
      case 'tasks':               return await cmdTasks(parsed)
      case 'calendar':            return await cmdCalendar(parsed, internal)
      // ====== mailbox: how an agent reads + writes the world ======
      case 'inbox':               return await cmdInbox(parsed)
      case 'glance':              return await cmdGlance(parsed)
      case 'ack':                 return await cmdAck(parsed)
      case 'mute':                return await cmdMute(parsed)
      case 'follow':              return await cmdFollow(parsed)
      case 'reply':               return await cmdReply(parsed, internal)
      case 'leave':               return await cmdLeave(parsed)
      case 'kick':                return await cmdKick(parsed)
      case 'invite':              return await cmdInvite(parsed)
      case 'topic':               return await cmdTopicRead(parsed)
      case 'topic-set':           return await cmdTopicSet(parsed)
      case 'rename':              return await cmdRename(parsed)
      case 'skills':              return await cmdSkills(parsed)
      case 'email':               return await cmdEmail(parsed, internal)
      case 'poll':                return await cmdPoll(parsed, internal)
      // ====== other actions (each wraps a tool implementation) ======
      // `kanban` is the canonical verb for the shared boards feature.
      // `card` for the cards inside them. No CJK aliases — easier to
      // type in any keyboard mode.
      case 'claim':               return await cmdClaim(parsed, 'claim')
      case 'unclaim':             return await cmdClaim(parsed, 'unclaim')
      case 'kanban':              return await cmdBoard(parsed, internal)
      case 'card':                return await cmdCard(parsed, internal)
      case 'doc':                 return await cmdDoc(parsed, internal)
      case 'react':               return await cmdReact(parsed)
      case 'dm':                  return await runTool('dm_with', parsed)
      case 'pull-group':          return await runTool('pull_group', parsed)
      case 'palette':             return await runTool('palette', parsed)
      case 'image':               return await cmdImage(parsed)
      default:
        return err(`unknown subcommand: ${sub}\nrun "lingxiloop help" for usage`)
    }
  } catch (e) {
    return err(`error: ${e instanceof Error ? e.message : String(e)}`, 2)
  }
}

// tokenize is re-exported from ./cli-parse — see the import block at the
// top of this file.
