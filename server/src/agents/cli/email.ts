import {
  getAgentEmailIdentity,
  getAgentEmailThread,
  isAgentEmailAddressingConfigured,
  listAgentEmailContacts,
  listAgentEmailInbox,
  replyToAgentEmail,
  sendAgentEmail,
  type AgentEmailContact,
  type AgentEmailDeliveryResult,
  type AgentEmailThread,
  type AgentEmailThreadView,
  type EmailScope,
} from '../../modules/email/index.js'
import { resolveAs } from '../cli-identity.js'
import { type ParsedArgs, unescapeChat } from '../cli-parse.js'
import type { CliResult, CliSideEffect } from '../cli-result.js'

interface RunCliInternalContext {
  idempotencyKey?: string
  projectId?: string
}

interface LoadedEmailAttachment {
  filename: string
  mimeType: string
  sizeBytes: number
  storageKey: string
}

interface EmailCommandDependencies {
  ok(text: string, sideEffects?: CliSideEffect[]): CliResult
  err(text: string, code?: number): CliResult
  agentCompany(agentId: string): Promise<string | null>
  loadEmailAttachmentFromPath(path: string): Promise<LoadedEmailAttachment>
}

export function createEmailCommand(dependencies: EmailCommandDependencies) {
  const { ok, err, agentCompany, loadEmailAttachmentFromPath } = dependencies

  async function cmdEmail(parsed: ParsedArgs, internal: RunCliInternalContext = {}): Promise<CliResult> {
    const subcommand = parsed.positional[0]
    if (!subcommand) {
      return err(
        'usage:\n'
        + '  email send --to <addr|id>[,<addr|id>...] [--cc <...>] --subject "..." --body "..." [--attach <path>[,<path>...]] [--as <id>]\n'
        + '  email reply <message_id> --body "..." [--cc <addr|id>...] [--attach <path>[,<path>...]] [--as <id>]\n'
        + '  email inbox [--unread] [--limit N] [--as <id>]\n'
        + '  email show <conversation_id> [--tail N] [--as <id>]\n'
        + '  email contacts [<query>] [--as <id>]\n'
        + '  email whoami [--as <id>]   — your own address',
      )
    }
    const agentId = resolveAs(parsed)
    const companyId = await agentCompany(agentId)
    if (!companyId) return err(`unknown agent ${agentId} (no company)`)
    const scope = { userId: agentId, companyId }
    try {
      switch (subcommand) {
        case 'whoami': return await cmdEmailWhoami(scope)
        case 'contacts': return await cmdEmailContacts(parsed, scope)
        case 'inbox': return await cmdEmailInbox(parsed, scope)
        case 'show': return await cmdEmailShow(parsed, scope)
        case 'send': return await cmdEmailSend(parsed, scope, internal)
        case 'reply': return await cmdEmailReply(parsed, scope, internal)
        default: return err(`unknown email subcommand: ${subcommand}`)
      }
    } catch (error) {
      return err(error instanceof Error ? error.message : String(error))
    }
  }

  async function cmdEmailWhoami(scope: EmailScope): Promise<CliResult> {
    const identity = await getAgentEmailIdentity(scope)
    if (!identity) {
      if (!isAgentEmailAddressingConfigured()) {
        return err('email feature not configured (set EMAIL_DOMAIN)')
      }
      return err(`no email address available for ${scope.userId} (not an agent, or company missing)`)
    }
    return ok(`${identity.displayName} <${identity.email}>`)
  }

  async function cmdEmailContacts(parsed: ParsedArgs, scope: EmailScope): Promise<CliResult> {
    const query = parsed.positional[1]?.trim() ?? ''
    const contacts = await listAgentEmailContacts(scope, query)
    if (parsed.flags.json) return ok(JSON.stringify(contacts, null, 2))
    if (contacts.length === 0) {
      if (!isAgentEmailAddressingConfigured()) {
        return ok('(email feature not configured — set EMAIL_DOMAIN to enable)')
      }
      if (query) {
        return ok(`(no contacts match "${query}". If the user named someone you don't recognize, ASK them for the email address before guessing — don't silently skip the task.)`)
      }
      return ok('(no email contacts yet — invite someone or wait for inbound mail)')
    }
    return ok(formatContacts(contacts))
  }

  async function cmdEmailInbox(parsed: ParsedArgs, scope: EmailScope): Promise<CliResult> {
    const unreadOnly = Boolean(parsed.flags.unread)
    const limit = boundedNumber(parsed.flags.limit, 20)
    const threads = await listAgentEmailInbox(scope, { unreadOnly, limit })
    if (parsed.flags.json) return ok(JSON.stringify(threads.map(threadJson), null, 2))
    if (threads.length === 0) {
      if (!isAgentEmailAddressingConfigured()) {
        return ok('(email feature not configured — set EMAIL_DOMAIN to enable inbound + outbound)')
      }
      return ok(unreadOnly
        ? `(no unread email for ${scope.userId})`
        : `(no email threads for ${scope.userId} yet)`)
    }
    const lines: string[] = []
    for (const thread of threads) {
      const unreadTag = thread.unreadCount > 0 ? ` ★${thread.unreadCount}` : ''
      const subject = thread.lastSubject ?? thread.title ?? '(no subject)'
      const from = thread.lastFrom ?? '?'
      const snippet = (thread.lastBody ?? '').slice(0, 240).replace(/\n+/g, ' \\n ')
      const at = thread.lastAt ? timestamp(thread.lastAt) : ''
      lines.push(`# ${thread.conversationId}${unreadTag}  [${at}]`)
      lines.push(`  from:    ${from}`)
      lines.push(`  subject: ${subject}`)
      if (snippet) lines.push(`  body:    ${snippet}`)
      lines.push('')
    }
    lines.push('run `lingxiloop email show <conversation_id>` to read the full thread, then `lingxiloop email reply <message_id> --body "..."` to respond. `lingxiloop ack <conversation_id>` clears unread state.')
    return ok(lines.join('\n'))
  }

  async function cmdEmailShow(parsed: ParsedArgs, scope: EmailScope): Promise<CliResult> {
    const conversationId = parsed.positional[1]
    if (!conversationId) return err('usage: email show <conversation_id> [--tail N]')
    const thread = await getAgentEmailThread(scope, conversationId, boundedNumber(parsed.flags.tail, 10))
    if (parsed.flags.json) return ok(JSON.stringify(threadJsonView(thread), null, 2))
    if (thread.messages.length === 0) return ok(`(thread ${conversationId} has no email messages)`)
    const lines: string[] = [`thread ${conversationId}  "${thread.title}"`, '']
    for (const message of thread.messages) {
      const arrow = message.direction === 'in' ? '↓ in' : '↑ out'
      lines.push(`────  [${message.id}]  ${arrow}  ${message.transportStatus}  ${timestamp(message.createdAt)}`)
      lines.push(`from:    ${message.fromAddress}`)
      if (message.toAddresses.length) lines.push(`to:      ${message.toAddresses.join(', ')}`)
      if (message.ccAddresses.length) lines.push(`cc:      ${message.ccAddresses.join(', ')}`)
      lines.push(`subject: ${message.subject}`)
      if (message.inReplyTo) lines.push(`in-reply-to: <${message.inReplyTo}>`)
      lines.push('', message.body, '')
    }
    lines.push(`reply with \`lingxiloop email reply ${thread.messages.at(-1)?.id} --body "..."\`.`)
    return ok(lines.join('\n'))
  }

  async function cmdEmailSend(
    parsed: ParsedArgs,
    scope: EmailScope,
    internal: RunCliInternalContext,
  ): Promise<CliResult> {
    const to = commaList(parsed.flags.to)
    const cc = commaList(parsed.flags.cc)
    const subject = unescapeChat(String(parsed.flags.subject ?? '')).trim()
    const body = unescapeChat(String(parsed.flags.body ?? '')).trim()
    if (to.length === 0 || !subject || !body) {
      return err('usage: email send --to <addr|id>[,...] [--cc <...>] --subject "..." --body "..." [--attach <path>[,<path>...]]')
    }
    const attachments = await loadAttachments(commaList(parsed.flags.attach))
    if ('error' in attachments) return attachments.error
    const result = await sendAgentEmail(scope, {
      to,
      cc,
      subject,
      body,
      attachments: attachments.value.map((attachment) => ({
        key: attachment.storageKey,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
    }, {
      idempotencyKey: internal.idempotencyKey,
      projectId: internal.projectId,
    })
    return deliveryResult('send', scope, result, attachments.value.length)
  }

  async function cmdEmailReply(
    parsed: ParsedArgs,
    scope: EmailScope,
    internal: RunCliInternalContext,
  ): Promise<CliResult> {
    const replyToMessageId = parsed.positional[1]
    const body = unescapeChat(String(parsed.flags.body ?? '')).trim()
    if (!replyToMessageId || !body) {
      return err('usage: email reply <message_id> --body "..." [--cc <addr|id>...] [--attach <path>[,<path>...]]')
    }
    const attachments = await loadAttachments(commaList(parsed.flags.attach))
    if ('error' in attachments) return attachments.error
    const result = await replyToAgentEmail(scope, replyToMessageId, {
      body,
      cc: commaList(parsed.flags.cc),
      attachments: attachments.value.map((attachment) => ({
        key: attachment.storageKey,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
    }, { idempotencyKey: internal.idempotencyKey })
    return deliveryResult('reply', scope, result, attachments.value.length, replyToMessageId)
  }

  function deliveryResult(
    command: 'send' | 'reply',
    scope: EmailScope,
    result: AgentEmailDeliveryResult,
    attachmentCount: number,
    replyToMessageId?: string,
  ): CliResult {
    const verb = command === 'send' ? 'sent' : 'replied'
    if (result.replayed) {
      return ok(`${verb} (replayed) · ${result.messageId} · thread ${result.conversationId}`)
    }
    if (result.transportStatus !== 'sent') {
      return err(`email persisted as failed: ${result.error ?? 'provider failure'} · message_id=${result.messageId}`, 1)
    }
    return ok(`${verb} · ${result.messageId} · thread ${result.conversationId}`, [{
      event: 'email.sent',
      command: `email ${command}`,
      conversationId: result.conversationId,
      messageId: result.messageId,
      authorId: scope.userId,
      companyId: scope.companyId,
      ...(replyToMessageId ? { replyToMessageId } : {}),
      subject: result.subject,
      to: result.to,
      cc: result.cc,
      attachmentCount,
      transportStatus: 'sent',
      visibleToUser: true,
    }])
  }

  async function loadAttachments(paths: string[]): Promise<
    | { value: LoadedEmailAttachment[] }
    | { error: CliResult }
  > {
    const value: LoadedEmailAttachment[] = []
    for (const path of paths) {
      try {
        value.push(await loadEmailAttachmentFromPath(path))
      } catch (error) {
        return { error: err(`attachment ${path}: ${error instanceof Error ? error.message : String(error)}`) }
      }
    }
    return { value }
  }

  return { cmdEmail }
}

function commaList(raw: string | boolean | undefined): string[] {
  return raw === undefined || typeof raw === 'boolean'
    ? []
    : String(raw).split(',').map((value) => value.trim()).filter(Boolean)
}

function boundedNumber(raw: string | boolean | undefined, fallback: number): number {
  const value = Number(raw ?? fallback)
  return Math.min(50, Math.max(1, Number.isFinite(value) ? value : fallback))
}

function timestamp(value: string): string {
  return new Date(value).toISOString().replace('T', ' ').slice(0, 16)
}

function formatContacts(contacts: AgentEmailContact[]): string {
  const kindWidth = 8
  const nameWidth = Math.min(40, Math.max(12, ...contacts.map((contact) => contact.name.length)))
  const roleWidth = Math.min(24, Math.max(4, ...contacts.map((contact) => (contact.role ?? '').length)))
  const addressWidth = Math.min(60, Math.max(20, ...contacts.map((contact) => contact.address.length)))
  return [
    `${'kind'.padEnd(kindWidth)} ${'name'.padEnd(nameWidth)}  ${'role'.padEnd(roleWidth)}  ${'address'.padEnd(addressWidth)}  id`,
    '-'.repeat(kindWidth + 1 + nameWidth + 2 + roleWidth + 2 + addressWidth + 2 + 6),
    ...contacts.map((contact) => (
      `${contact.kind.padEnd(kindWidth)} ${contact.name.slice(0, nameWidth).padEnd(nameWidth)}  ${(contact.role ?? '—').slice(0, roleWidth).padEnd(roleWidth)}  ${contact.address.slice(0, addressWidth).padEnd(addressWidth)}  ${contact.participantId ?? '—'}`
    )),
  ].join('\n')
}

function threadJson(thread: AgentEmailThread) {
  return {
    conversation_id: thread.conversationId,
    title: thread.title,
    updated_at: thread.updatedAt,
    unread_count: thread.unreadCount,
    last_subject: thread.lastSubject,
    last_from: thread.lastFrom,
    last_at: thread.lastAt,
    last_body: thread.lastBody,
  }
}

function threadJsonView(thread: AgentEmailThreadView) {
  return {
    thread: thread.conversationId,
    title: thread.title,
    messages: thread.messages.map((message) => ({
      id: message.id,
      created_at: message.createdAt,
      body: message.body,
      from_addr: message.fromAddress,
      to_addrs: message.toAddresses,
      cc_addrs: message.ccAddresses,
      subject: message.subject,
      smtp_message_id: message.smtpMessageId,
      in_reply_to: message.inReplyTo,
      direction: message.direction,
      transport_status: message.transportStatus,
    })),
  }
}
