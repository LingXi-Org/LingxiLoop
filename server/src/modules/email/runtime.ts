/** Email delivery and threading orchestration behind the domain public facade. */
import { createHash, randomUUID } from 'node:crypto'
import { pool } from '../../db/pool.js'
import { withTransaction } from '../../db/transaction.js'
import { CH_MESSAGE_NEW, publish } from '../../redis.js'
import { storage } from '../../storage.js'
import {
  assignParticipantAddress,
  findCompanyUserByAuthEmail,
  findCompanyUserEmail,
  findParticipantAddress,
  findParticipantByEmail,
  listAgentsMissingAddress,
} from './address-repository.js'
import {
  computeAgentAddress,
  formatAddress,
  mintMessageId,
  normalizeMessageId,
  parseAddress,
  sanitizeSubject,
  splitReplyAddresses,
} from './addressing.js'
import type { PersistEmailMessageInput, PersistedEmailAttachment } from './contracts.js'
import {
  createEmailConversation,
  findConversationByMessageIds,
  findLatestReplyParent,
  mergeConversationMembers,
  recordEmailContact,
  updateReplyDelivery,
} from './conversation-repository.js'
import {
  completeOutboundDelivery,
  findPersistedEmailMessage,
  persistEmailProjection,
} from './message-repository.js'
import { sendViaProvider, type ProviderSendResult } from './provider.js'

export async function ensureParticipantAddress(participantId: string, companyId: string): Promise<{
  participantId: string
  email: string
  displayName: string
  kind: string
} | null> {
  const participant = await findParticipantAddress(pool, companyId, participantId)
  if (!participant) return null
  if (participant.email) return {
    participantId: participant.participantId,
    email: participant.email,
    displayName: participant.displayName,
    kind: participant.kind,
  }
  const email = computeAgentAddress(participant.participantId, participant.companySlug)
  if (!email) return null
  await assignParticipantAddress(pool, companyId, participantId, email)
  return {
    participantId: participant.participantId,
    email,
    displayName: participant.displayName,
    kind: participant.kind,
  }
}

export async function backfillCompanyAgentAddresses(companyId: string): Promise<number> {
  const participants = await listAgentsMissingAddress(pool, companyId)
  let assigned = 0
  for (const participant of participants) {
    const email = computeAgentAddress(participant.id, participant.companySlug)
    if (email && await assignParticipantAddress(pool, companyId, participant.id, email)) assigned += 1
  }
  return assigned
}

export async function findEmailConversationByMessageIds(
  messageIds: string[],
  companyId: string,
): Promise<string | null> {
  const normalized = messageIds
    .map((messageId) => normalizeMessageId(messageId))
    .filter((messageId): messageId is string => Boolean(messageId))
  return findConversationByMessageIds(pool, companyId, normalized)
}

export async function findParticipantByAddress(
  address: string,
  companyId: string,
): Promise<{ id: string; name: string; kind: string } | null> {
  const normalized = address.trim().toLowerCase()
  return normalized ? findParticipantByEmail(pool, companyId, normalized) : null
}

export async function findUserInCompanyByAuthEmail(
  authEmail: string,
  companyId: string,
): Promise<{ id: string; displayName: string } | null> {
  const normalized = authEmail.trim().toLowerCase()
  return normalized ? findCompanyUserByAuthEmail(pool, companyId, normalized) : null
}

/** Insert one row into the messages + email_messages pair, atomically
 *  bumping the conversation sequence and publishing the wake event so
 *  every recipient agent's pod gets a chance to react.
 *
 *  This is the SHARED write path for both directions — outbound (CLI:
 *  `lingxiloop email send/reply`) and inbound (webhook). Centralizing it
 *  keeps the threading invariants in one spot:
 *    - one messages.id per email message; same id is the email_messages PK
 *    - the conversation already exists; caller decides which one
 *    - smtp_message_id is unique within a company (set per direction)
 *    - in_reply_to / references_chain are bracket-less, lowercased
 *    - the sender (authorId) is a participant in the same company
 *    - publish so other agents in the conversation wake naturally
 *
 *  Returns the new messageId. Throws on DB error — caller's catch
 *  surfaces it as a 4xx / CLI error.
 */
export async function persistEmailMessage(
  input: PersistEmailMessageInput,
): Promise<{ messageId: string; sequence: number }> {
  const messageId = input.idempotencyKey
    ? `m-agent-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`
    : `m-${randomUUID()}`
  if (input.idempotencyKey) {
    const persisted = await findPersistedEmailMessage(pool, input.companyId, input.conversationId, messageId)
    if (persisted) return { messageId, sequence: persisted.sequence }
  }

  const attachments: PersistedEmailAttachment[] = (input.attachments ?? []).map((attachment) => ({
    id: `eatt-${randomUUID().slice(0, 12)}`,
    filename: attachment.filename.slice(0, 200),
    mimeType: (attachment.mimeType || 'application/octet-stream').slice(0, 120),
    sizeBytes: attachment.sizeBytes,
    storageKey: attachment.storageKey,
    truncated: Boolean(attachment.truncated),
  }))
  const normalized = {
    smtpMessageId: normalizeMessageId(input.smtpMessageId),
    inReplyTo: normalizeMessageId(input.inReplyTo),
    references: input.references
      .map((reference) => normalizeMessageId(reference))
      .filter((reference): reference is string => Boolean(reference)),
  }
  const sequence = await withTransaction(pool, (client) => (
    persistEmailProjection(client, input, messageId, attachments, normalized)
  ))

  const wakeAttachments = await Promise.all(attachments.map(async (attachment) => {
    let url: string | null = null
    if (attachment.storageKey && !attachment.truncated) {
      try {
        url = await storage.publicUrl(attachment.storageKey)
      } catch (error) {
        console.warn('[email] attachment URL unavailable after commit', {
          messageId,
          storageKey: attachment.storageKey,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return {
      id: attachment.id,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url,
      truncated: attachment.truncated,
    }
  }))
  await publish(CH_MESSAGE_NEW, {
    type: 'message.new',
    conversationId: input.conversationId,
    companyId: input.companyId,
    message: {
      id: messageId,
      conversationId: input.conversationId,
      authorId: input.authorId,
      kind: 'email',
      body: input.body,
      sequence,
      at: new Date().toISOString(),
      email: {
        subject: input.subject,
        from: input.fromAddr,
        to: input.toAddrs,
        cc: input.ccAddrs ?? [],
        direction: input.direction,
        transportStatus: input.transportStatus,
        transportError: input.transportError ?? null,
        smtpMessageId: normalized.smtpMessageId,
        inReplyTo: normalized.inReplyTo,
        hasHtml: Boolean(input.html),
        autoSubmitted: Boolean(input.autoSubmitted),
        attachments: wakeAttachments,
      },
    },
  })
  return { messageId, sequence }
}

export async function completeOutboundEmail(
  companyId: string,
  messageId: string,
  result: ProviderSendResult,
  authoritativeSmtpMessageId: string,
): Promise<void> {
  if (result.ok && !normalizeMessageId(result.smtpMessageId)) {
    throw new Error('email provider returned success without a valid Message-ID')
  }
  await completeOutboundDelivery(pool, companyId, messageId, {
    status: result.ok ? 'sent' : 'failed',
    error: result.error ?? null,
    smtpMessageId: normalizeMessageId(result.smtpMessageId ?? authoritativeSmtpMessageId),
  })
}

export async function findOrCreateEmailConversation(args: {
  companyId: string
  projectId?: string | null
  inReplyTo: string | null
  references: string[]
  subject: string
  memberIds: string[]
  idempotencyKey?: string
}): Promise<{ conversationId: string; created: boolean }> {
  const candidates = [args.inReplyTo, ...args.references]
    .map((messageId) => normalizeMessageId(messageId))
    .filter((messageId): messageId is string => Boolean(messageId))
  const existing = await findConversationByMessageIds(pool, args.companyId, candidates)
  if (existing) {
    await mergeConversationMembers(pool, args.companyId, existing, args.memberIds)
    return { conversationId: existing, created: false }
  }

  const title = args.subject.replace(/^\s*((re|fwd|fw)\s*:\s*)+/i, '').trim() || '(no subject)'
  const conversationId = args.idempotencyKey
    ? `email-agent-${createHash('sha256').update(args.idempotencyKey).digest('hex').slice(0, 24)}`
    : `email-${randomUUID().slice(0, 12)}`
  const result = await createEmailConversation(pool, {
    id: conversationId,
    companyId: args.companyId,
    projectId: args.projectId,
    title: title.slice(0, 200),
    memberIds: Array.from(new Set(args.memberIds)),
  })
  return { conversationId, created: result.created }
}

export async function recordExternalContact(args: {
  companyId: string
  address: string
  displayName: string | null
}): Promise<void> {
  const address = args.address.trim().toLowerCase()
  if (!address) return
  await recordEmailContact(pool, {
    companyId: args.companyId,
    address,
    displayName: args.displayName,
  })
}

/** Auto-promote a chat-style reply in an email conversation into a real
 *  email reply. Shared by the HTTP /conversations/:id/messages handler and
 *  the agent CLI's `lingxiloop reply` — both need to detect kind='email'
 *  conversations and route the body through Resend instead of writing a
 *  plain text message that the external recipient never sees.
 *
 *  Builds the reply context from the latest email_messages row in the
 *  conversation: subject (with Re: prefix), In-Reply-To, References,
 *  recipient list (splitReplyAddresses minus self). Sender's From line
 *  uses the caller's LingxiLoop-domain address — lazy-minted if it wasn't
 *  there yet, matching the resolver used by /participants. */
export async function replyInEmailConversation(args: {
  conversationId: string
  companyId: string
  authorId: string
  body: string
  /** True when the reply is automation-driven (agent CLI). Stamps the
   *  RFC 3834 Auto-Submitted header so the recipient's vacation responders
   *  and our own loop protection know it's machine-generated. */
  autoSubmitted?: boolean
}): Promise<{ messageId: string; sequence: number; transportStatus: string; error: string | null }> {
  // Latest email row anchors the reply. Email conversations always have
  // at least one email_messages row (otherwise they wouldn't be kind='email'),
  // so the "no parent" case is a programmer error, not a user-facing path.
  const parent = await findLatestReplyParent(pool, args.companyId, args.conversationId)
  const p = parent
  if (!p) {
    throw new Error(`replyInEmailConversation: conversation ${args.conversationId} has no email_messages parent`)
  }

  const sender = await ensureParticipantAddress(args.authorId, args.companyId)
  if (!sender) {
    throw new Error(`replyInEmailConversation: no LingxiLoop address for participant ${args.authorId} in ${args.companyId}`)
  }
  // For human authors, ALSO consider their auth email as "self" — the
  // original may have me listed under either my LingxiLoop address or my
  // real Gmail. Agents don't have an auth email, query is a no-op.
  const selfAddrs = [sender.email.toLowerCase()]
  const authEmail = await findCompanyUserEmail(pool, args.companyId, args.authorId)
  if (authEmail) selfAddrs.push(authEmail.toLowerCase())

  // Two cases for the parent row:
  //   (a) Parent is from someone ELSE — reply-all semantics: TO = original
  //       From, CC = original To+Cc minus self.
  //   (b) Parent is from US (we sent the last message; nobody has replied
  //       yet) — splitReplyAddresses would put US in TO and then strip
  //       us out, leaving TO empty. The intent here isn't "reply-all" —
  //       it's "continue the thread to the same people I just addressed".
  //       Use the parent's to_addrs / cc_addrs verbatim (minus self).
  const parentFromParsed = parseAddress(p.from)
  const parentFromIsSelf = parentFromParsed
    ? selfAddrs.includes(parentFromParsed.addr.toLowerCase())
    : false
  let replyTo: string[]
  let replyCc: string[]
  if (parentFromIsSelf) {
    const filterSelf = (addrs: string[]) => addrs.filter((raw) => {
      const p2 = parseAddress(raw)
      return p2 ? !selfAddrs.includes(p2.addr.toLowerCase()) : true
    })
    replyTo = filterSelf(p.to ?? [])
    replyCc = filterSelf(p.cc ?? [])
  } else {
    const split = splitReplyAddresses({
      originalFrom: p.from,
      originalTo: p.to ?? [],
      originalCc: p.cc ?? [],
      selfAddresses: selfAddrs,
    })
    replyTo = split.to
    replyCc = split.cc
  }
  if (replyTo.length === 0) {
    throw new Error(`replyInEmailConversation: no remaining recipients after self-removal for ${args.conversationId}`)
  }

  const subject = /^(re|fwd|fw)\s*:/i.test(p.subject) ? sanitizeSubject(p.subject) : sanitizeSubject(`Re: ${p.subject}`)
  const newReferences = [...(p.references ?? []), ...(p.smtpMessageId ? [p.smtpMessageId] : [])]
    .filter((x): x is string => Boolean(x))
  const inReplyTo = p.smtpMessageId ? normalizeMessageId(p.smtpMessageId) : null
  const messageId = mintMessageId()
  const fromLine = formatAddress(sender.email, sender.displayName)

  // WRITE-FIRST, then SEND. Previously we sent via Resend FIRST and
  // persisted second — if persist failed after a successful send,
  // the email was delivered to the recipient but no DB row existed,
  // so the next wake would treat the convo as "still un-replied" and
  // send AGAIN. Users got duplicate emails.
  //
  // Now: persist the row as 'sending' BEFORE the network hop. The
  // Message-ID is committed first; if persist fails, no send happens.
  // If send fails after persist, the row stays 'sending' / 'failed'
  // and the email-retry worker picks it up (the existing retry path
  // already handles status='failed' + future next_retry_at). If send
  // succeeds but the post-send UPDATE fails, the retry worker will
  // see status='sending', retry-send with the SAME Message-ID, and
  // Resend dedupes server-side via that header — no duplicate hits
  // the user's inbox.
  const persisted = await persistEmailMessage({
    conversationId: args.conversationId,
    companyId: args.companyId,
    authorId: args.authorId,
    direction: 'out',
    transportStatus: 'sending',
    transportError: null,
    smtpMessageId: messageId,
    inReplyTo,
    references: newReferences,
    subject,
    fromAddr: fromLine,
    toAddrs: replyTo,
    ccAddrs: replyCc,
    body: args.body,
    autoSubmitted: Boolean(args.autoSubmitted),
  })

  const sendRes = await sendViaProvider({
    from: fromLine,
    to: replyTo,
    cc: replyCc.length ? replyCc : undefined,
    subject,
    text: args.body,
    inReplyTo: inReplyTo ?? undefined,
    references: newReferences,
    messageId,
    autoSubmitted: args.autoSubmitted ? 'auto-replied' : undefined,
  })

  // Update the row to its final state. We do NOT throw if this UPDATE
  // fails — the retry worker will fix it on the next tick by reading
  // status='sending' or 'failed' and re-attempting (Resend dedupes by
  // Message-ID). The caller still gets the correct transportStatus
  // returned below.
  const finalStatus = sendRes.ok ? 'sent' : 'failed'
  if (sendRes.ok && !normalizeMessageId(sendRes.smtpMessageId)) {
    throw new Error('email provider returned success without a valid Message-ID')
  }
  const finalSmtpId = sendRes.smtpMessageId ?? messageId
  await updateReplyDelivery(pool, {
    companyId: args.companyId,
    messageId: persisted.messageId,
    status: finalStatus,
    error: sendRes.error,
    smtpMessageId: finalSmtpId,
    nextRetryAt: finalStatus === 'failed' ? new Date(Date.now() + 60_000) : null,
  }).catch((err) => {
    // Row is now in a half-finished state. retry worker will reconcile.
    console.warn(`[email] post-send UPDATE failed for ${persisted.messageId} — leaving for retry worker:`,
      err instanceof Error ? err.message : err)
  })

  return {
    messageId: persisted.messageId,
    sequence: persisted.sequence,
    transportStatus: finalStatus,
    error: sendRes.error,
  }
}
