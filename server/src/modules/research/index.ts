import { decodeSourceText, extractDocumentText } from '@lyyzka/lingxios'
export { researchTools } from './agent-tools.js'
import { createHash } from 'node:crypto'
import { researchUrl } from './address.js'
import { fetchResearch } from './fetch.js'

const MAX_TEXT_CHARS = 60_000

export interface ResearchSearchResult {
  title: string
  url: string
  doi?: string
  publicationYear?: number
  authors: string[]
  abstract?: string
  citedByCount?: number
  source: 'OpenAlex'
}

function abstractFromIndex(index: unknown): string | undefined {
  if (!index || typeof index !== 'object' || Array.isArray(index)) return undefined
  const words: Array<[number, string]> = []
  for (const [word, positions] of Object.entries(index as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue
    for (const position of positions) if (Number.isInteger(position)) words.push([Number(position), word])
  }
  words.sort((a, b) => a[0] - b[0])
  const text = words.map((entry) => entry[1]).join(' ').trim()
  return text ? text.slice(0, 4_000) : undefined
}

export async function searchResearch(query: string, limit = 8, signal?: AbortSignal): Promise<{ provider: 'OpenAlex'; query: string; results: ResearchSearchResult[] }> {
  if (typeof query !== 'string' || !query.trim() || query.length > 2000) throw new Error('research query must contain 1..2000 characters')
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('research limit must be an integer from 1 to 20')
  const count = limit
  const endpoint = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${count}&select=display_name,doi,publication_year,authorships,abstract_inverted_index,cited_by_count,primary_location,id`
  const { body } = await fetchResearch(endpoint, signal)
  const results = parseOpenAlex(JSON.parse(decodeSourceText(body)), count)
  return { provider: 'OpenAlex', query, results }
}

export function parseOpenAlex(value: unknown, count: number): ResearchSearchResult[] {
  if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error('invalid result limit')
  if (!value || typeof value !== 'object') throw new Error('research provider returned invalid results')
  const decoded = value as { results?: unknown[] }
  if (!Array.isArray(decoded.results)) throw new Error('research provider returned invalid results')
  const results = decoded.results.slice(0, count).map((raw): ResearchSearchResult | null => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const location = row['primary_location'] && typeof row['primary_location'] === 'object' ? row['primary_location'] as Record<string, unknown> : {}
    const title = typeof row['display_name'] === 'string' ? row['display_name'].trim() : ''
    const doi = typeof row['doi'] === 'string' ? row['doi'] : undefined
    const landing = typeof location['landing_page_url'] === 'string' ? location['landing_page_url'] : undefined
    const id = typeof row['id'] === 'string' ? row['id'] : undefined
    if (!title || !(doi || landing || id)) return null
    let url: string
    try { url = researchUrl(doi ?? landing ?? id!).href } catch { return null }
    const authors = Array.isArray(row['authorships']) ? row['authorships'].flatMap((authorship) => {
      const author = authorship && typeof authorship === 'object' ? (authorship as Record<string, unknown>)['author'] : null
      const name = author && typeof author === 'object' ? (author as Record<string, unknown>)['display_name'] : null
      return typeof name === 'string' ? [name] : []
    }).slice(0, 12) : []
    const abstract = abstractFromIndex(row['abstract_inverted_index'])
    return {
      title,
      url,
      ...(doi ? { doi: url } : {}),
      ...(Number.isInteger(row['publication_year']) ? { publicationYear: Number(row['publication_year']) } : {}),
      authors,
      ...(abstract ? { abstract } : {}),
      ...(Number.isInteger(row['cited_by_count']) ? { citedByCount: Number(row['cited_by_count']) } : {}),
      source: 'OpenAlex',
    }
  }).filter((row): row is ResearchSearchResult => Boolean(row))
  return results
}

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
