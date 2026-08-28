import { createHash } from 'node:crypto'
import { pool } from '../../db/pool.js'
import type { CliResult, CliSideEffect } from '../cli-result.js'
import { resolveAs } from '../cli-identity.js'
import { type ParsedArgs, unescapeChat } from '../cli-parse.js'

interface RunCliInternalContext {
  idempotencyKey?: string
  projectId?: string
  deferReadCursor?: boolean
}

interface LoadedEmailAttachment {
  filename: string
  mimeType: string
  sizeBytes: number
  base64: string
  storageKey: string
  publicUrl: string
}

interface EmailContact {
  participantId: string | null
  name: string
  address: string
  kind: 'agent' | 'human' | 'external'
  role?: string | null
}

interface EmailCommandDependencies {
  ok(text: string, sideEffects?: CliSideEffect[]): CliResult
  err(text: string, code?: number): CliResult
  agentCompany(agentId: string): Promise<string | null>
  loadEmailAttachmentFromPath(path: string): Promise<LoadedEmailAttachment>
}

export function createEmailCommand(dependencies: EmailCommandDependencies) {
  const { ok, err, agentCompany, loadEmailAttachmentFromPath } = dependencies
  async function listEmailContacts(
    companyId: string,
    viewerId: string,
    query?: string,
  ): Promise<EmailContact[]> {
    const out: EmailContact[] = []
    const { computeAgentAddress } = await import('../../email.js')
    // Optional fuzzy filter. Applied uniformly across name / id / email so a
    // single query like "wey" matches an agent's id, a human's display
    // name, OR an external email-contacts row. We do the match in JS (after
    // each block's SQL) rather than per-table SQL ILIKE so the assembled
    // list stays consistent — and so the predicate matches both
    // participants.name AND the computed agent address.
    const q = query?.trim().toLowerCase() ?? ''
    const matches = (c: EmailContact) => !q
      || c.name.toLowerCase().includes(q)
      || c.address.toLowerCase().includes(q)
      || (c.participantId?.toLowerCase().includes(q) ?? false)
      || (c.role?.toLowerCase().includes(q) ?? false)
    // 1. Same-tenant agents (excluding the viewer themselves). Include those
    // whose participants.email column is still NULL — `/participants` already
    // exposes a deterministic address for un-minted agents, so the CLI
    // contact list should match (otherwise a fresh agent is invisible until
    // someone has emailed them, which is the bootstrap chicken-and-egg).
    const { rows: agents } = await pool.query<{ id: string; name: string; email: string | null; slug: string; role: string | null }>(
      `SELECT p.id, p.name, p.email, p.role, c.slug
         FROM participants p
         JOIN companies c ON c.id = p.company_id
        WHERE p.company_id = $1 AND p.kind = 'agent' AND p.departed_at IS NULL
          AND p.id <> $2
        ORDER BY p.name ASC`,
      [companyId, viewerId],
    )
    for (const a of agents) {
      const address = a.email ?? computeAgentAddress(a.id, a.slug)
      if (!address) continue
      const c: EmailContact = { participantId: a.id, name: a.name, address, kind: 'agent', role: a.role }
      if (matches(c)) out.push(c)
    }
    // 2. Workspace humans (auth email).
    const { rows: humans } = await pool.query<{ id: string; display_name: string; email: string }>(
      `SELECT u.id, u.display_name, u.email
         FROM users u
         JOIN company_members cm ON cm.user_id = u.id
        WHERE cm.company_id = $1 AND u.email IS NOT NULL
        ORDER BY u.display_name ASC`,
      [companyId],
    )
    for (const h of humans) {
      const c: EmailContact = { participantId: h.id, name: h.display_name, address: h.email, kind: 'human' }
      if (matches(c)) out.push(c)
    }
    // 3. External addresses we've corresponded with. Without a filter we cap
    // at the 30 most recent; with a filter we widen the net so a search
    // can find older correspondents too (still capped to keep memory bounded).
    const limit = q ? 200 : 30
    const { rows: ext } = await pool.query<{ address: string; display_name: string | null; message_count: number }>(
      `SELECT address, display_name, message_count FROM email_contacts
        WHERE company_id = $1
        ORDER BY last_seen_at DESC LIMIT $2`,
      [companyId, limit],
    )
    for (const e of ext) {
      const c: EmailContact = {
        participantId: null,
        name: e.display_name ?? e.address,
        address: e.address,
        kind: 'external',
      }
      if (matches(c)) out.push(c)
    }
    return out
  }
  
  /** Resolve a recipient string the agent typed into a real email address.
   *  Accepts: a participant id (looked up in same company), a human user
   *  display id, an explicit "Name <addr>", or a bare address. Returns
   *  the parsed { addr, name } shape or null if unresolvable. */
  async function resolveEmailRecipient(raw: string, viewerCompanyId: string): Promise<{ addr: string; name: string | null } | null> {
    // Synthetic external:<addr> ids are inbound-author markers only — they
    // come from senders we don't have a participants row for and have no
    // routable target by themselves. The agent should write to the bare
    // address instead (which lives in `email_contacts` and shows up under
    // `lingxiloop email contacts`).
    if (raw.startsWith('external:')) return null
    const { parseAddress, ensureParticipantAddress } = await import('../../email.js')
    const direct = parseAddress(raw)
    if (direct) return direct
    // Participant id lookup. Per-kind delivery target:
    //   - agent  → lingxiloop address (lazy-mint if column still NULL)
    //   - human  → real auth email (so it lands in their personal inbox)
    const { rows: pa } = await pool.query<{ name: string; email: string | null; kind: string }>(
      `SELECT name, email, kind FROM participants
        WHERE id = $1 AND company_id = $2 AND departed_at IS NULL LIMIT 1`,
      [raw, viewerCompanyId],
    )
    if (pa[0]) {
      if (pa[0].kind === 'agent') {
        if (pa[0].email) return { addr: pa[0].email, name: pa[0].name }
        const ensured = await ensureParticipantAddress(raw, viewerCompanyId)
        if (ensured) return { addr: ensured.email, name: ensured.displayName }
      }
      if (pa[0].kind === 'human') {
        const { rows: u } = await pool.query<{ email: string | null }>(
          `SELECT email FROM users WHERE id = $1 LIMIT 1`, [raw],
        )
        if (u[0]?.email) return { addr: u[0].email, name: pa[0].name }
      }
    }
    // Direct user-id lookup (caller passed users.id, not participants.id).
    const { rows: us } = await pool.query<{ display_name: string; email: string }>(
      `SELECT u.display_name, u.email
         FROM users u
         JOIN company_members cm ON cm.user_id = u.id
        WHERE u.id = $1 AND cm.company_id = $2 LIMIT 1`,
      [raw, viewerCompanyId],
    )
    if (us[0]) return { addr: us[0].email, name: us[0].display_name }
    return null
  }
  
  interface EmailThreadRow {
    conversation_id: string
    title: string
    updated_at: string
    unread_count: number
    last_subject: string | null
    last_from: string | null
    last_at: string | null
    last_body: string | null
  }
  
  async function listAgentEmailThreads(args: {
    agentId: string
    companyId: string
    unreadOnly: boolean
    limit: number
  }): Promise<EmailThreadRow[]> {
    // Threads = email conversations the agent is in. We surface the latest
    // email_messages row per thread for the snippet, and an unread count
    // computed against conversation_reads.last_read_at (same source of
    // truth as the chat inbox uses). Keeps the agent's mental model
    // consistent: "unread" means "you haven't acked this thread since".
    const { rows } = await pool.query<EmailThreadRow>(
      `WITH my_threads AS (
         SELECT c.id, c.title, c.updated_at
           FROM conversations c
          WHERE c.kind = 'email'
            AND c.company_id = $1
            AND c.members @> to_jsonb(ARRAY[$2::text])
       ),
       last_msg AS (
         SELECT DISTINCT ON (em.conversation_id)
                em.conversation_id, em.subject, em.from_addr,
                m.body, m.created_at AS at
           FROM email_messages em
           JOIN messages m ON m.id = em.message_id
          WHERE em.company_id = $1
          ORDER BY em.conversation_id, em.created_at DESC
       ),
       unread AS (
         SELECT m.conversation_id, COUNT(*)::int AS n
           FROM messages m
           LEFT JOIN conversation_reads r
                  ON r.conversation_id = m.conversation_id AND r.user_id = $2
          WHERE m.kind = 'email'
            AND m.company_id = $1
            AND m.author_id <> $2
            AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
          GROUP BY m.conversation_id
       )
       SELECT t.id AS conversation_id, t.title, t.updated_at::text,
              COALESCE(u.n, 0) AS unread_count,
              l.subject AS last_subject, l.from_addr AS last_from,
              l.at::text AS last_at, l.body AS last_body
         FROM my_threads t
         LEFT JOIN last_msg l ON l.conversation_id = t.id
         LEFT JOIN unread   u ON u.conversation_id = t.id
        WHERE NOT $3 OR COALESCE(u.n, 0) > 0
        ORDER BY t.updated_at DESC
        LIMIT $4`,
      [args.companyId, args.agentId, args.unreadOnly, args.limit],
    )
    return rows
  }
  
  async function cmdEmail(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const sub = parsed.positional[0]
    if (!sub) {
      return err(
        'usage:\n' +
        '  email send --to <addr|id>[,<addr|id>...] [--cc <...>] --subject "..." --body "..." [--attach <path>[,<path>...]] [--as <id>]\n' +
        '  email reply <message_id> --body "..." [--cc <addr|id>...] [--attach <path>[,<path>...]] [--as <id>]\n' +
        '  email inbox [--unread] [--limit N] [--as <id>]\n' +
        '  email show <conversation_id> [--tail N] [--as <id>]\n' +
        '  email contacts [<query>] [--as <id>]   (or just: lingxiloop contacts [<query>])\n' +
        '  email whoami [--as <id>]   — your own address',
      )
    }
    const me = resolveAs(parsed)
    const companyId = await agentCompany(me)
    if (!companyId) return err(`unknown agent ${me} (no company)`)
  
    switch (sub) {
      case 'whoami':   return cmdEmailWhoami(me, companyId)
      case 'contacts': return cmdEmailContacts(parsed, me, companyId, Boolean(parsed.flags.json))
      case 'inbox':    return cmdEmailInbox(parsed, me, companyId)
      case 'show':     return cmdEmailShow(parsed, me, companyId)
      case 'send':     return cmdEmailSend(parsed, me, companyId, internal.idempotencyKey, internal.projectId)
      case 'reply':    return cmdEmailReply(parsed, me, companyId, internal.idempotencyKey)
      default:
        return err(`unknown email subcommand: ${sub}`)
    }
  }
  
  async function cmdEmailWhoami(me: string, companyId: string): Promise<CliResult> {
    const { ensureParticipantAddress } = await import('../../email.js')
    const { env } = await import('../../env.js')
    const addr = await ensureParticipantAddress(me, companyId)
    if (!addr) {
      if (!env.EMAIL_DOMAIN) return err('email feature not configured (set EMAIL_DOMAIN)')
      return err(`no email address available for ${me} (not an agent, or company missing)`)
    }
    return ok(`${addr.displayName} <${addr.email}>`)
  }
  
  async function cmdEmailContacts(
    parsed: ParsedArgs,
    me: string,
    companyId: string,
    json: boolean,
  ): Promise<CliResult> {
    // Optional fuzzy filter: `lingxiloop email contacts wey` matches against
    // name / id / email (substring, case-insensitive). The empty-result
    // path explicitly tells the caller that NO contact matches the query
    // — the agent's LLM uses this signal to ask the user for the address
    // instead of silently doing nothing.
    const query = parsed.positional[1]?.trim() ?? ''
    const list = await listEmailContacts(companyId, me, query)
    if (json) return ok(JSON.stringify(list, null, 2))
    if (list.length === 0) {
      const { env } = await import('../../env.js')
      if (!env.EMAIL_DOMAIN) return ok('(email feature not configured — set EMAIL_DOMAIN to enable)')
      if (query) {
        return ok(`(no contacts match "${query}". If the user named someone you don't recognize, ASK them for the email address before guessing — don't silently skip the task.)`)
      }
      return ok('(no email contacts yet — invite someone or wait for inbound mail)')
    }
    // Width is driven by longest entry per column so long names / addresses
    // don't get chopped. Cap so a pathological 300-char address can't blow
    // up the layout — but the cap is generous (60) versus the previous 44.
    const KIND_W = 8
    const nameW = Math.min(40, Math.max(12, ...list.map((c) => c.name.length)))
    // The role column tells the agent WHAT each teammate does — the whole point
    // of a directory. Width tracks the longest role (capped); falls back to a
    // header-width minimum so the column header always fits.
    const roleW = Math.min(24, Math.max(4, ...list.map((c) => (c.role ?? '').length)))
    const addrW = Math.min(60, Math.max(20, ...list.map((c) => c.address.length)))
    const lines = [
      `${'kind'.padEnd(KIND_W)} ${'name'.padEnd(nameW)}  ${'role'.padEnd(roleW)}  ${'address'.padEnd(addrW)}  id`,
      '-'.repeat(KIND_W + 1 + nameW + 2 + roleW + 2 + addrW + 2 + 6),
      ...list.map((c) =>
        `${c.kind.padEnd(KIND_W)} ${c.name.slice(0, nameW).padEnd(nameW)}  ${(c.role ?? '—').slice(0, roleW).padEnd(roleW)}  ${c.address.slice(0, addrW).padEnd(addrW)}  ${c.participantId ?? '—'}`,
      ),
    ]
    return ok(lines.join('\n'))
  }
  
  async function cmdEmailInbox(parsed: ParsedArgs, me: string, companyId: string): Promise<CliResult> {
    const unread = Boolean(parsed.flags.unread)
    const limit = Math.min(50, Math.max(1, Number(parsed.flags.limit ?? 20)))
    const threads = await listAgentEmailThreads({ agentId: me, companyId, unreadOnly: unread, limit })
    if (parsed.flags.json) return ok(JSON.stringify(threads, null, 2))
    if (threads.length === 0) {
      // Distinguish "feature not wired" from "feature wired, just empty" so
      // a fresh agent isn't left guessing whether mail is broken vs quiet.
      const { env } = await import('../../env.js')
      if (!env.EMAIL_DOMAIN) {
        return ok('(email feature not configured — set EMAIL_DOMAIN to enable inbound + outbound)')
      }
      return ok(unread ? `(no unread email for ${me})` : `(no email threads for ${me} yet)`)
    }
    const lines: string[] = []
    for (const t of threads) {
      const unreadTag = t.unread_count > 0 ? ` ★${t.unread_count}` : ''
      // Keep full subject + from — the LLM consumer reads better with all
      // content visible; truncation only hurt narrow terminals, and those
      // aren't our audience here.
      const subject = t.last_subject ?? t.title ?? '(no subject)'
      const from = t.last_from ?? '?'
      const snippet = (t.last_body ?? '').slice(0, 240).replace(/\n+/g, ' \\n ')
      const at = t.last_at ? new Date(t.last_at).toISOString().replace('T', ' ').slice(0, 16) : ''
      lines.push(`# ${t.conversation_id}${unreadTag}  [${at}]`)
      lines.push(`  from:    ${from}`)
      lines.push(`  subject: ${subject}`)
      if (snippet) lines.push(`  body:    ${snippet}`)
      lines.push('')
    }
    lines.push(`run \`lingxiloop email show <conversation_id>\` to read the full thread, then \`lingxiloop email reply <message_id> --body "..."\` to respond. \`lingxiloop ack <conversation_id>\` clears unread state.`)
    return ok(lines.join('\n'))
  }
  
  async function cmdEmailShow(parsed: ParsedArgs, me: string, companyId: string): Promise<CliResult> {
    const convoId = parsed.positional[1]
    if (!convoId) return err('usage: email show <conversation_id> [--tail N]')
    const tail = Math.min(50, Math.max(1, Number(parsed.flags.tail ?? 10)))
    // Confirm membership — agents can only read threads they're on.
    const { rows: cv } = await pool.query<{ members: string[]; title: string }>(
      `SELECT members, title FROM conversations
        WHERE id = $1 AND company_id = $2 AND kind = 'email' LIMIT 1`,
      [convoId, companyId],
    )
    if (!cv[0]) return err(`unknown email thread ${convoId}`)
    if (!cv[0].members.includes(me)) return err(`${me} is not a member of ${convoId}`)
    const { rows: msgs } = await pool.query<{
      id: string; created_at: string; body: string; from_addr: string;
      to_addrs: string[]; cc_addrs: string[]; subject: string;
      smtp_message_id: string | null; in_reply_to: string | null;
      direction: 'in' | 'out'; transport_status: string;
    }>(
      `SELECT m.id, m.created_at::text, m.body,
              em.from_addr, em.to_addrs, em.cc_addrs, em.subject,
              em.smtp_message_id, em.in_reply_to, em.direction, em.transport_status
         FROM messages m
         JOIN email_messages em ON em.message_id = m.id
        WHERE m.conversation_id = $1
        ORDER BY m.sequence DESC
        LIMIT $2`,
      [convoId, tail],
    )
    msgs.reverse()
    if (parsed.flags.json) return ok(JSON.stringify({ thread: convoId, title: cv[0].title, messages: msgs }, null, 2))
    if (msgs.length === 0) return ok(`(thread ${convoId} has no email messages)`)
    const lines: string[] = [`thread ${convoId}  "${cv[0].title}"`, '']
    for (const m of msgs) {
      const at = new Date(m.created_at).toISOString().replace('T', ' ').slice(0, 16)
      const arrow = m.direction === 'in' ? '↓ in' : '↑ out'
      lines.push(`────  [${m.id}]  ${arrow}  ${m.transport_status}  ${at}`)
      lines.push(`from:    ${m.from_addr}`)
      if (m.to_addrs?.length) lines.push(`to:      ${m.to_addrs.join(', ')}`)
      if (m.cc_addrs?.length) lines.push(`cc:      ${m.cc_addrs.join(', ')}`)
      lines.push(`subject: ${m.subject}`)
      if (m.in_reply_to) lines.push(`in-reply-to: <${m.in_reply_to}>`)
      lines.push('')
      lines.push(m.body)
      lines.push('')
    }
    lines.push(`reply with \`lingxiloop email reply ${msgs[msgs.length - 1].id} --body "..."\`.`)
    return ok(lines.join('\n'))
  }
  
  async function cmdEmailSend(parsed: ParsedArgs, me: string, companyId: string, idempotencyKey?: string, projectId?: string): Promise<CliResult> {
    const toRaw = parsed.flags.to ? String(parsed.flags.to) : ''
    const ccRaw = parsed.flags.cc ? String(parsed.flags.cc) : ''
    const {
      ensureParticipantAddress,
      formatAddress,
      sendViaProvider,
      findOrCreateEmailConversation,
      persistEmailMessage,
      mintMessageId,
      sanitizeSubject,
    } = await import('../../email.js')
    const subject = sanitizeSubject(unescapeChat(String(parsed.flags.subject ?? '')))
    const body = unescapeChat(String(parsed.flags.body ?? '')).trim()
    // --attach takes a comma-separated list of paths (also accepts the same
    // flag repeated by the agent — bin/lingxiloop collapses repeats into the
    // last value, so comma is the supported multi-attach syntax here).
    const attachRaw = parsed.flags.attach ? String(parsed.flags.attach) : ''
    if (!toRaw || !subject || !body) {
      return err('usage: email send --to <addr|id>[,...] [--cc <...>] --subject "..." --body "..." [--attach <path>[,<path>...]]')
    }
    const attachPaths = attachRaw.split(',').map((s) => s.trim()).filter(Boolean)
    const loadedAttachments: Awaited<ReturnType<typeof loadEmailAttachmentFromPath>>[] = []
    for (const p of attachPaths) {
      try {
        loadedAttachments.push(await loadEmailAttachmentFromPath(p))
      } catch (e) {
        return err(`attachment ${p}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    const sender = await ensureParticipantAddress(me, companyId)
    if (!sender) return err('agent has no email address (EMAIL_DOMAIN unset or company missing)')
  
    const toItems = toRaw.split(',').map((s) => s.trim()).filter(Boolean)
    const ccItems = ccRaw.split(',').map((s) => s.trim()).filter(Boolean)
    const toResolved: { addr: string; name: string | null }[] = []
    const ccResolved: { addr: string; name: string | null }[] = []
    for (const t of toItems) {
      const r = await resolveEmailRecipient(t, companyId)
      if (!r) return err(`can't resolve recipient: ${t}`)
      toResolved.push(r)
    }
    for (const c of ccItems) {
      const r = await resolveEmailRecipient(c, companyId)
      if (!r) return err(`can't resolve cc: ${c}`)
      ccResolved.push(r)
    }
    if (toResolved.length === 0) return err('at least one --to recipient required')
  
    // Recipient agents in this same company become conversation members.
    const memberIds = new Set<string>([me])
    for (const r of [...toResolved, ...ccResolved]) {
      const inHouse = await pool.query<{ id: string }>(
        `SELECT id FROM participants
          WHERE LOWER(email) = $1 AND company_id = $2 AND departed_at IS NULL LIMIT 1`,
        [r.addr, companyId],
      )
      if (inHouse.rows[0]) memberIds.add(inHouse.rows[0].id)
    }
  
    const actionHash = idempotencyKey ? createHash('sha256').update(idempotencyKey).digest('hex') : ''
    const messageId = idempotencyKey ? `agent-${actionHash}@lingxiloop.local` : mintMessageId()
    if (idempotencyKey) {
      const { rows } = await pool.query<{ message_id: string; conversation_id: string }>(
        `SELECT message_id, conversation_id FROM email_messages WHERE company_id=$1 AND LOWER(smtp_message_id)=LOWER($2) LIMIT 1`,
        [companyId, messageId],
      )
      if (rows[0]) return ok(`sent (replayed) · ${rows[0].message_id} · thread ${rows[0].conversation_id}`)
    }
    const conv = await findOrCreateEmailConversation({
      companyId,
      projectId,
      inReplyTo: null,
      references: [],
      subject,
      memberIds: [...memberIds],
      idempotencyKey,
    })
  
    // Call the provider FIRST so we record sent/failed accurately. If
    // anything throws we still write a queued/failed row — the agent
    // shouldn't lose the draft just because Resend hiccuped.
    const sendRes = await sendViaProvider({
      from: formatAddress(sender.email, sender.displayName),
      to: toResolved.map((r) => formatAddress(r.addr, r.name)),
      cc: ccResolved.length ? ccResolved.map((r) => formatAddress(r.addr, r.name)) : undefined,
      subject,
      text: body,
      messageId,
      idempotencyKey: idempotencyKey ? `agent-os/${actionHash}` : undefined,
      autoSubmitted: 'auto-generated',
      attachments: loadedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, base64: a.base64,
      })),
    })
  
    const persisted = await persistEmailMessage({
      conversationId: conv.conversationId,
      companyId,
      authorId: me,
      direction: 'out',
      transportStatus: sendRes.ok ? 'sent' : 'failed',
      transportError: sendRes.error,
      smtpMessageId: sendRes.smtpMessageId ?? messageId,
      inReplyTo: null,
      references: [],
      subject,
      fromAddr: formatAddress(sender.email, sender.displayName),
      toAddrs: toResolved.map((r) => formatAddress(r.addr, r.name)),
      ccAddrs: ccResolved.map((r) => formatAddress(r.addr, r.name)),
      body,
      autoSubmitted: true,
      idempotencyKey,
      attachments: loadedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
        storageKey: a.storageKey,
      })),
    })
  
    if (!sendRes.ok) {
      return err(`email persisted as failed: ${sendRes.error} · message_id=${persisted.messageId}`, 1)
    }
    return ok(`sent · ${persisted.messageId} · thread ${conv.conversationId}`, [{
      event: 'email.sent',
      command: 'email send',
      conversationId: conv.conversationId,
      messageId: persisted.messageId,
      authorId: me,
      companyId,
      subject,
      to: toResolved.map((r) => r.addr),
      cc: ccResolved.map((r) => r.addr),
      attachmentCount: loadedAttachments.length,
      transportStatus: 'sent',
      visibleToUser: true,
    }])
  }
  
  async function cmdEmailReply(parsed: ParsedArgs, me: string, companyId: string, idempotencyKey?: string): Promise<CliResult> {
    const replyTo = parsed.positional[1]
    const body = unescapeChat(String(parsed.flags.body ?? '')).trim()
    const attachRaw = parsed.flags.attach ? String(parsed.flags.attach) : ''
    if (!replyTo || !body) return err('usage: email reply <message_id> --body "..." [--cc <addr|id>...] [--attach <path>[,<path>...]]')
    const attachPaths = attachRaw.split(',').map((s) => s.trim()).filter(Boolean)
    const loadedAttachments: Awaited<ReturnType<typeof loadEmailAttachmentFromPath>>[] = []
    for (const p of attachPaths) {
      try {
        loadedAttachments.push(await loadEmailAttachmentFromPath(p))
      } catch (e) {
        return err(`attachment ${p}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    // Pull the original email row and its conversation context.
    const { rows: orig } = await pool.query<{
      conversation_id: string
      smtp_message_id: string | null
      references_chain: string[]
      subject: string
      from_addr: string
      to_addrs: string[]
      cc_addrs: string[]
    }>(
      `SELECT conversation_id, smtp_message_id, references_chain,
              subject, from_addr, to_addrs, cc_addrs
         FROM email_messages WHERE message_id = $1 AND company_id = $2`,
      [replyTo, companyId],
    )
    if (!orig[0]) return err(`unknown email message ${replyTo}`)
    const o = orig[0]
    // Confirm membership — same gate as `email show`.
    const { rows: cv } = await pool.query<{ members: string[] }>(
      `SELECT members FROM conversations WHERE id = $1`, [o.conversation_id],
    )
    if (!cv[0] || !cv[0].members.includes(me)) {
      return err(`${me} is not a member of thread ${o.conversation_id}`)
    }
  
    const {
      ensureParticipantAddress, formatAddress,
      sendViaProvider, persistEmailMessage, mintMessageId, normalizeMessageId,
      sanitizeSubject, splitReplyAddresses,
    } = await import('../../email.js')
    const sender = await ensureParticipantAddress(me, companyId)
    if (!sender) return err('agent has no email address (EMAIL_DOMAIN unset or company missing)')
  
    // Reply-all split: TO = original From, CC = original To+Cc minus self.
    // Earlier iterations collapsed everyone into TO; that read fine but
    // dropped the informed-vs.-required signal real clients rely on.
    const { to: toAddrs, cc: ccFromOriginal } = splitReplyAddresses({
      originalFrom: o.from_addr,
      originalTo: o.to_addrs ?? [],
      originalCc: o.cc_addrs ?? [],
      selfAddresses: [sender.email],
    })
    if (toAddrs.length === 0) return err('no other recipients to reply to')
  
    // Extra cc from --cc, resolved like in `send` — appended to the
    // original CC list (self is already filtered out by splitReplyAddresses;
    // we de-dupe against toAddrs + ccFromOriginal below).
    const ccItems = parsed.flags.cc ? String(parsed.flags.cc).split(',').map((s) => s.trim()).filter(Boolean) : []
    const ccResolved: { addr: string; name: string | null }[] = []
    for (const c of ccItems) {
      const r = await resolveEmailRecipient(c, companyId)
      if (!r) return err(`can't resolve cc: ${c}`)
      ccResolved.push(r)
    }
    const extractAddr = (raw: string) => {
      const m = /<([^>]+)>/.exec(raw)
      return (m ? m[1] : raw).toLowerCase()
    }
    const ccSeen = new Set<string>([
      sender.email.toLowerCase(),
      ...toAddrs.map(extractAddr),
      ...ccFromOriginal.map(extractAddr),
    ])
    const ccCombined: string[] = [...ccFromOriginal]
    for (const r of ccResolved) {
      if (ccSeen.has(r.addr)) continue
      ccSeen.add(r.addr)
      ccCombined.push(formatAddress(r.addr, r.name))
    }
  
    const subject = /^(re|fwd|fw)\s*:/i.test(o.subject) ? sanitizeSubject(o.subject) : sanitizeSubject(`Re: ${o.subject}`)
    const newReferences = [
      ...(o.references_chain ?? []),
      ...(o.smtp_message_id ? [o.smtp_message_id] : []),
    ].filter((x): x is string => Boolean(x))
    const inReplyTo = o.smtp_message_id ? normalizeMessageId(o.smtp_message_id) : null
    const actionHash = idempotencyKey ? createHash('sha256').update(idempotencyKey).digest('hex') : ''
    const messageId = idempotencyKey ? `agent-${actionHash}@lingxiloop.local` : mintMessageId()
    if (idempotencyKey) {
      const { rows } = await pool.query<{ message_id: string; conversation_id: string }>(
        `SELECT message_id, conversation_id FROM email_messages WHERE company_id=$1 AND LOWER(smtp_message_id)=LOWER($2) LIMIT 1`,
        [companyId, messageId],
      )
      if (rows[0]) return ok(`replied (replayed) · ${rows[0].message_id} · thread ${rows[0].conversation_id}`)
    }
  
    const sendRes = await sendViaProvider({
      from: formatAddress(sender.email, sender.displayName),
      to: toAddrs,
      cc: ccCombined.length ? ccCombined : undefined,
      subject,
      text: body,
      inReplyTo: inReplyTo ?? undefined,
      references: newReferences,
      messageId,
      idempotencyKey: idempotencyKey ? `agent-os/${actionHash}` : undefined,
      autoSubmitted: 'auto-replied',
      attachments: loadedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, base64: a.base64,
      })),
    })
  
    const persisted = await persistEmailMessage({
      conversationId: o.conversation_id,
      companyId,
      authorId: me,
      direction: 'out',
      transportStatus: sendRes.ok ? 'sent' : 'failed',
      transportError: sendRes.error,
      smtpMessageId: sendRes.smtpMessageId ?? messageId,
      inReplyTo,
      references: newReferences,
      subject,
      fromAddr: formatAddress(sender.email, sender.displayName),
      toAddrs,
      ccAddrs: ccCombined,
      body,
      autoSubmitted: true,
      idempotencyKey,
      attachments: loadedAttachments.map((a) => ({
        filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
        storageKey: a.storageKey,
      })),
    })
  
    // Auto-ack — replying definitionally means I read the original.
    await pool.query(
      `INSERT INTO conversation_reads (user_id, conversation_id, last_read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, conversation_id) DO UPDATE SET last_read_at = NOW()`,
      [me, o.conversation_id],
    )
  
    if (!sendRes.ok) return err(`email persisted as failed: ${sendRes.error} · ${persisted.messageId}`, 1)
    return ok(`replied · ${persisted.messageId} · thread ${o.conversation_id}`, [{
      event: 'email.sent',
      command: 'email reply',
      conversationId: o.conversation_id,
      messageId: persisted.messageId,
      authorId: me,
      companyId,
      replyToMessageId: replyTo,
      subject,
      to: toAddrs,
      cc: ccCombined,
      attachmentCount: loadedAttachments.length,
      transportStatus: 'sent',
      visibleToUser: true,
    }])
  }
  
  return { cmdEmail }
}
