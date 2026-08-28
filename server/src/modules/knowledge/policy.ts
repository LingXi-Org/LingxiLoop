import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024

function blockedIp(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^::ffff:/, '')
  if (ip === '::' || ip === '::1' || ip === '0.0.0.0') return true
  if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true
  return ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')
}

async function assertPublicUrl(raw: string): Promise<URL> {
  if (raw.length > 2_048) throw new Error('URL is too long')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('invalid URL') }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('URL must use http or https')
  if (url.username || url.password) throw new Error('URL credentials are not allowed')
  const host = url.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    throw new Error('URL host is blocked')
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((entry) => blockedIp(entry.address))) {
    throw new Error('URL resolves to a private or blocked address')
  }
  return url
}

export async function validateKnowledgeUrl(raw: string): Promise<string> {
  return (await assertPublicUrl(raw)).toString()
}

export function openNotebookEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.OPEN_NOTEBOOK_ENABLED ?? '')
}

export const KNOWLEDGE_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json',
  'image/png', 'image/jpeg', 'image/webp',
  'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm',
  'video/mp4', 'video/webm',
])

export function isKnowledgeAttachmentMime(mime: string, size = 0): boolean {
  return openNotebookEnabled() && KNOWLEDGE_ATTACHMENT_MIMES.has(mime.toLowerCase())
    && size > 0 && size <= MAX_SOURCE_BYTES
}
