import { randomUUID } from 'node:crypto'
import { env } from '../../env.js'

export interface ParsedEmailAddress {
  addr: string
  name: string | null
}

function safeSlugPart(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '').slice(0, 63)
}

function safeLocalPart(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/^[-_]+|[-_]+$/g, '').slice(0, 64)
}

export function computeAgentAddress(agentId: string, companySlug: string): string | null {
  if (!env.EMAIL_DOMAIN) return null
  const local = safeLocalPart(agentId)
  const slug = safeSlugPart(companySlug)
  return local && slug ? `${local}.${slug}@${env.EMAIL_DOMAIN}` : null
}

export function parseAddress(raw: string): ParsedEmailAddress | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(trimmed)
  if (match) {
    const addr = match[2].trim().toLowerCase()
    const name = (match[1] ?? '').trim() || null
    return /^[^@\s]+@[^@\s]+$/.test(addr) ? { addr, name } : null
  }
  const addr = trimmed.toLowerCase()
  return /^[^@\s]+@[^@\s]+$/.test(addr) ? { addr, name: null } : null
}

export function formatAddress(addr: string, name: string | null): string {
  if (!name) return addr
  const safeName = name.replace(/"/g, '\\"')
  return /["<>,;:@()[\]\\]/.test(name) ? `"${safeName}" <${addr}>` : `${safeName} <${addr}>`
}

export function sanitizeSubject(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060\ufeff]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

export function sanitizeEmailHtml(raw: string): string {
  if (!raw) return ''
  let output = raw
  for (const tag of ['script', 'style', 'iframe', 'object', 'embed', 'frame', 'frameset', 'applet', 'svg', 'math']) {
    output = output.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    output = output.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }
  output = output.replace(/<(?:link|meta|base)\b[^>]*\/?>/gi, '')
  output = output.replace(/<!--[\s\S]*?-->/g, '')
  output = output.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
  output = output.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
  output = output.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
  const unsafeUrl = /\b(href|src|action|formaction|background|poster|xlink:href|data)\s*=\s*("|'|)\s*(javascript:|vbscript:|data:(?!image\/(?:png|jpeg|gif|webp|svg\+xml);)|file:)/gi
  output = output.replace(unsafeUrl, (_match, attribute, quote) => `${attribute}=${quote || '"'}#${quote || '"'}`)
  return output.replace(/\bsrcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
}

export function splitReplyAddresses(args: {
  originalFrom: string
  originalTo: string[]
  originalCc: string[]
  selfAddresses: string[]
}): { to: string[]; cc: string[] } {
  const seen = new Set(args.selfAddresses.map((address) => address.toLowerCase()))
  const originalSender = parseAddress(args.originalFrom)
  const to: string[] = []
  if (originalSender && !seen.has(originalSender.addr)) {
    seen.add(originalSender.addr)
    to.push(formatAddress(originalSender.addr, originalSender.name))
  }
  const cc: string[] = []
  for (const raw of [...args.originalTo, ...args.originalCc]) {
    const address = parseAddress(raw)
    if (!address || seen.has(address.addr)) continue
    seen.add(address.addr)
    cc.push(formatAddress(address.addr, address.name))
  }
  return { to, cc }
}

export function mintMessageId(): string {
  const local = `${Date.now().toString(36)}-${randomUUID().replace(/-/g, '').slice(0, 22)}`
  return `${local}@${env.EMAIL_DOMAIN || 'lingxiloop.local'}`
}

export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const normalized = String(raw).trim().replace(/^<+|>+$/g, '').trim().toLowerCase()
  return normalized || null
}
