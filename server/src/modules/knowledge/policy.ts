import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

export const MAX_SOURCE_BYTES = 200 * 1024 * 1024

/** Original-file storage is independent of the optional indexing engine. */
export const SOURCE_FILE_EXTENSIONS = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/zip': 'zip',
} as const

export function sourceFileSignatureMatches(mime: string, bytes: Buffer): boolean {
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mime === 'image/jpeg') return bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
  const extension = SOURCE_FILE_EXTENSIONS[mime as keyof typeof SOURCE_FILE_EXTENSIONS]
  if (extension === 'zip' || extension === 'pptx' || extension === 'xlsx') {
    const zip = bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
      || bytes.subarray(0, 4).equals(Buffer.from([80, 75, 5, 6]))
    if (!zip) return false
    if (extension === 'zip') return true
    return bytes.includes(Buffer.from('[Content_Types].xml'))
      && bytes.includes(Buffer.from(extension === 'pptx' ? 'ppt/' : 'xl/'))
  }
  return true
}

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
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
])

export function isKnowledgeAttachmentMime(mime: string, size = 0): boolean {
  return openNotebookEnabled() && KNOWLEDGE_ATTACHMENT_MIMES.has(mime.toLowerCase())
    && size > 0 && size <= MAX_SOURCE_BYTES
}
