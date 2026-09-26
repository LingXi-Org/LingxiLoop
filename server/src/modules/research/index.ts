import { decodeSourceText, extractDocumentText } from '@lyyzka/lingxios'
export { researchTools } from './agent-tools.js'
import { createHash } from 'node:crypto'
export { searchResearch, type ResearchSearchResult } from './search.js'
import { fetchResearch } from './fetch.js'

const MAX_TEXT_CHARS = 60_000

export function decodeHtml(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => Number(code) <= 0x10ffff ? String.fromCodePoint(Number(code)) : '\uFFFD')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function readResearch(rawUrl: string, signal?: AbortSignal): Promise<{
  url: string; finalUrl: string; contentType: string; text: string; bytes: number; sha256: string; truncated: boolean
}> {
  const { url: finalUrl, contentType, body } = await fetchResearch(rawUrl, signal)
  if (contentType !== 'application/pdf' && !contentType.startsWith('text/') && contentType !== 'application/json' && contentType !== 'application/xhtml+xml') {
    throw new Error(`unsupported research content type: ${contentType}`)
  }
  const raw = contentType === 'application/pdf' ? await extractDocumentText(body, 'pdf', signal) : decodeSourceText(body)
  const text = contentType.includes('html') || contentType.includes('xhtml') ? decodeHtml(raw) : raw.trim()
  return {
    url: rawUrl,
    finalUrl,
    contentType,
    text: text.slice(0, MAX_TEXT_CHARS),
    bytes: body.byteLength,
    sha256: createHash('sha256').update(body).digest('hex'),
    truncated: text.length > MAX_TEXT_CHARS,
  }
}
