import { inc } from '../../metrics.js'
import { mintMessageId } from './addressing.js'

export interface ProviderSendResult {
  ok: boolean
  smtpMessageId: string | null
  error: string | null
}

export interface SendArgs {
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text: string
  html?: string
  inReplyTo?: string | null
  references?: string[]
  messageId?: string | null
  idempotencyKey?: string
  autoSubmitted?: 'auto-replied' | 'auto-generated'
  replyTo?: string
  attachments?: Array<{
    filename: string
    mimeType?: string
    base64?: string
    path?: string
  }>
}

export type EmailProvider = (args: SendArgs) => Promise<ProviderSendResult>

let providerOverride: EmailProvider | null = null

export function __setEmailProviderOverrideForTesting(override: EmailProvider | null): void {
  providerOverride = override
}

export function assertEmailProviderConfigured(): void {
  if (!providerOverride && !(process.env.RESEND_API_KEY ?? '').trim()) {
    throw new Error('RESEND_API_KEY is required')
  }
}

export async function sendViaProvider(args: SendArgs): Promise<ProviderSendResult> {
  if (providerOverride) return providerOverride(args)
  const apiKey = process.env.RESEND_API_KEY ?? ''
  if (!apiKey) throw new Error('RESEND_API_KEY is required')

  const headers: Record<string, string> = {}
  if (args.messageId) {
    headers['Message-ID'] = `<${args.messageId}>`
    headers['X-LingxiLoop-Message-ID'] = args.messageId
  }
  if (args.inReplyTo) headers['In-Reply-To'] = `<${args.inReplyTo}>`
  if (args.references?.length) headers.References = args.references.map((reference) => `<${reference}>`).join(' ')
  if (args.autoSubmitted) headers['Auto-Submitted'] = args.autoSubmitted

  const body: Record<string, unknown> = {
    from: args.from,
    to: args.to,
    subject: args.subject,
    text: args.text,
  }
  if (args.html) body.html = args.html
  if (args.cc?.length) body.cc = args.cc
  if (args.bcc?.length) body.bcc = args.bcc
  if (args.replyTo) body.reply_to = args.replyTo
  if (Object.keys(headers).length) body.headers = headers
  if (args.attachments?.length) {
    const attachments: Array<{ filename: string; content?: string; path?: string }> = []
    for (const attachment of args.attachments) {
      if (attachment.base64) attachments.push({ filename: attachment.filename, content: attachment.base64 })
      else if (attachment.path) attachments.push({ filename: attachment.filename, path: attachment.path })
    }
    if (attachments.length) body.attachments = attachments
  }

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...(args.idempotencyKey ? { 'idempotency-key': args.idempotencyKey.slice(0, 256) } : {}),
      },
      body: JSON.stringify(body),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(JSON.stringify({
      evt: 'email.send.network_error',
      error: message,
      to_count: args.to.length,
      cc_count: args.cc?.length ?? 0,
    }))
    inc('email.send.fail')
    return { ok: false, smtpMessageId: null, error: `network: ${message}` }
  }

  const latencyMs = Date.now() - startedAt
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.warn(JSON.stringify({
      evt: 'email.send.provider_reject',
      status: response.status,
      detail: detail.slice(0, 200),
      latency_ms: latencyMs,
      to_count: args.to.length,
      cc_count: args.cc?.length ?? 0,
    }))
    inc('email.send.fail')
    return {
      ok: false,
      smtpMessageId: null,
      error: `resend ${response.status}: ${detail.slice(0, 400)}`,
    }
  }

  let payload: { id?: string } = {}
  try {
    payload = await response.json() as { id?: string }
  } catch {
    payload = {}
  }
  console.log(JSON.stringify({
    evt: 'email.send.ok',
    provider_id: payload.id ?? null,
    latency_ms: latencyMs,
    to_count: args.to.length,
    cc_count: args.cc?.length ?? 0,
    attachment_count: args.attachments?.length ?? 0,
    auto_submitted: args.autoSubmitted ?? null,
  }))
  inc('email.send.ok')
  return { ok: true, smtpMessageId: args.messageId ?? mintMessageId(), error: null }
}
