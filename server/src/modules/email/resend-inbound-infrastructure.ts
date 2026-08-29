import { load } from 'cheerio'
import { Webhook } from 'svix'
import {
  inboundEmailPayloadSchema,
  resendEmailReceivedEventSchema,
  type InboundEmailPayload,
  type ResendEmailReceivedEvent,
} from './contracts.js'
import type { ResendWebhookHeaders } from './resend-inbound-application.js'

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_FORWARDED_ATTACHMENT_BYTES = 18 * 1024 * 1024

interface ReceivedAttachmentReference {
  id: string
  filename: string
  content_type: string
}

interface ReceivedEmail {
  id: string
  from: string
  to: string[]
  cc: string[]
  subject: string
  text: string | null
  html: string | null
  message_id: string
  headers: Record<string, string>
  attachments: ReceivedAttachmentReference[]
}

interface ReceivedAttachment extends ReceivedAttachmentReference {
  size: number
  download_url: string
}

type Fetcher = typeof fetch

export function verifyResendWebhook(
  rawBody: Buffer,
  headers: ResendWebhookHeaders,
  webhookSecret: string,
): ResendEmailReceivedEvent | { type: string } {
  if (!webhookSecret) throw new Error('RESEND_WEBHOOK_SECRET is required')
  const value = new Webhook(webhookSecret).verify(rawBody, {
    'svix-id': headers.id,
    'svix-timestamp': headers.timestamp,
    'svix-signature': headers.signature,
  })
  if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string') {
    throw new Error('Resend webhook payload has no event type')
  }
  if (value.type !== 'email.received') return { type: value.type }
  const parsed = resendEmailReceivedEventSchema.safeParse(value)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'invalid email.received event')
  return parsed.data
}

export async function retrieveResendInboundEmail(
  emailId: string,
  apiKey: string,
  fetcher: Fetcher = fetch,
): Promise<InboundEmailPayload> {
  if (!apiKey) throw new Error('RESEND_API_KEY is required')
  const email = await resendJson<ReceivedEmail>(`https://api.resend.com/emails/receiving/${emailId}`, apiKey, fetcher)
  const attachments = []
  let forwardedBytes = 0
  for (const reference of email.attachments ?? []) {
    const metadata = await resendJson<ReceivedAttachment>(
      `https://api.resend.com/emails/receiving/${emailId}/attachments/${reference.id}`,
      apiKey,
      fetcher,
    )
    const sizeBytes = Number(metadata.size)
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) throw new Error('Resend attachment has invalid size')
    const truncated = sizeBytes > MAX_ATTACHMENT_BYTES
      || forwardedBytes + sizeBytes > MAX_FORWARDED_ATTACHMENT_BYTES
    let contentBase64 = ''
    if (!truncated) {
      const downloadUrl = new URL(metadata.download_url)
      if (downloadUrl.protocol !== 'https:' || !downloadUrl.hostname.endsWith('.resend.com')) {
        throw new Error('Resend attachment download URL is not trusted')
      }
      const response = await fetcher(downloadUrl)
      if (!response.ok) throw new Error(`Resend attachment download ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length !== sizeBytes) throw new Error('Resend attachment size mismatch')
      contentBase64 = bytes.toString('base64')
      forwardedBytes += sizeBytes
    }
    attachments.push({
      filename: metadata.filename || reference.filename,
      mimeType: metadata.content_type || reference.content_type || 'application/octet-stream',
      sizeBytes,
      contentBase64,
      truncated,
    })
  }

  const html = email.html || null
  const text = email.text?.trim() || htmlToText(html)
  const headers = lowerCaseHeaders(email.headers)
  const approximateRawSize = Buffer.byteLength(text) + Buffer.byteLength(html ?? '')
    + attachments.reduce((total, attachment) => total + attachment.sizeBytes, 0)
  return inboundEmailPayloadSchema.parse({
    messageId: email.message_id || `resend-${email.id}@inbound.resend`,
    inReplyTo: headerValue(headers, 'in-reply-to'),
    references: parseReferences(headerValue(headers, 'references')),
    from: headerValue(headers, 'from') || email.from,
    to: email.to ?? [],
    cc: email.cc ?? [],
    subject: email.subject ?? '',
    text,
    html,
    rawSizeBytes: approximateRawSize,
    autoSubmitted: headerValue(headers, 'auto-submitted'),
    attachments,
  })
}

async function resendJson<T>(url: string, apiKey: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url, {
    headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`Resend Receiving API ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return await response.json() as T
}

function lowerCaseHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), String(value)]))
}

function headerValue(headers: Record<string, string>, name: string): string | null {
  const value = headers[name]?.trim()
  return value || null
}

function parseReferences(value: string | null): string[] {
  if (!value) return []
  const bracketed = [...value.matchAll(/<([^<>]+)>/g)].map((match) => match[1]!.trim()).filter(Boolean)
  return bracketed.length > 0 ? bracketed : value.split(/\s+/).map((part) => part.trim()).filter(Boolean)
}

function htmlToText(html: string | null): string {
  if (!html) return ''
  return load(html).text().replace(/\s+/g, ' ').trim()
}
