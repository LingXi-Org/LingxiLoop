import { createHash } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const MAX_READ_BYTES = 2 * 1024 * 1024
const MAX_TEXT_CHARS = 60_000
const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 5

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

function blockedIp(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^::ffff:/, '')
  if (ip === '::' || ip === '::1' || ip === '0.0.0.0') return true
  if (ip.startsWith('10.') || ip.startsWith('127.') || ip.startsWith('169.254.') || ip.startsWith('192.168.')) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true
  return ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')
}

async function assertPublicUrl(raw: string): Promise<URL> {
  if (raw.length > 2_048) throw new Error('research URL is too long')
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('research URL is invalid') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('research URL must use http or https')
  if (url.username || url.password) throw new Error('research URL credentials are not allowed')
  const host = url.hostname.toLowerCase()
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) throw new Error('research URL host is blocked')
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true })
  if (addresses.length === 0 || addresses.some((entry) => blockedIp(entry.address))) throw new Error('research URL resolves to a blocked address')
  return url
}

async function boundedBody(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_READ_BYTES) throw new Error('research source exceeds 2 MiB')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('research source returned no body')
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > MAX_READ_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new Error('research source exceeds 2 MiB')
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}

async function safeFetch(raw: string): Promise<{ response: Response; body: Uint8Array }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    let url = await assertPublicUrl(raw)
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          accept: 'text/html,application/xhtml+xml,application/json,text/plain,application/pdf;q=0.8',
          'user-agent': 'LingxiLoop-Research/1.0 (+https://github.com/LingXi-Org/LingxiLoop)',
        },
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error(`research redirect ${response.status} has no location`)
        if (redirects === MAX_REDIRECTS) throw new Error('research source redirected too many times')
        url = await assertPublicUrl(new URL(location, url).toString())
        continue
      }
      if (!response.ok) throw new Error(`research source returned HTTP ${response.status}`)
      return { response, body: await boundedBody(response) }
    }
    throw new Error('research source redirected too many times')
  } finally { clearTimeout(timer) }
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

export async function searchResearch(query: string, limit = 8): Promise<{ provider: 'OpenAlex'; query: string; results: ResearchSearchResult[] }> {
  const count = Math.max(1, Math.min(20, Math.floor(limit)))
  const endpoint = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${count}&select=display_name,doi,publication_year,authorships,abstract_inverted_index,cited_by_count,primary_location,id`
  const { body } = await safeFetch(endpoint)
  const decoded = JSON.parse(new TextDecoder().decode(body)) as { results?: unknown[] }
  const results = (decoded.results ?? []).map((raw): ResearchSearchResult | null => {
    const row = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
    const location = row.primary_location && typeof row.primary_location === 'object' ? row.primary_location as Record<string, unknown> : {}
    const title = typeof row.display_name === 'string' ? row.display_name.trim() : ''
    const doi = typeof row.doi === 'string' ? row.doi : undefined
    const landing = typeof location.landing_page_url === 'string' ? location.landing_page_url : undefined
    const id = typeof row.id === 'string' ? row.id : undefined
    if (!title || !(doi || landing || id)) return null
    const authors = Array.isArray(row.authorships) ? row.authorships.flatMap((authorship) => {
      const author = authorship && typeof authorship === 'object' ? (authorship as Record<string, unknown>).author : null
      const name = author && typeof author === 'object' ? (author as Record<string, unknown>).display_name : null
      return typeof name === 'string' ? [name] : []
    }).slice(0, 12) : []
    return {
      title,
      url: doi ?? landing ?? id!,
      ...(doi ? { doi } : {}),
      ...(Number.isInteger(row.publication_year) ? { publicationYear: Number(row.publication_year) } : {}),
      authors,
      ...(abstractFromIndex(row.abstract_inverted_index) ? { abstract: abstractFromIndex(row.abstract_inverted_index) } : {}),
      ...(Number.isInteger(row.cited_by_count) ? { citedByCount: Number(row.cited_by_count) } : {}),
      source: 'OpenAlex',
    }
  }).filter((row): row is ResearchSearchResult => Boolean(row))
  return { provider: 'OpenAlex', query, results }
}

function decodeHtml(value: string): string {
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
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim()
}

export async function readResearch(rawUrl: string): Promise<{
  url: string; finalUrl: string; contentType: string; text: string; bytes: number; sha256: string; truncated: boolean
}> {
  const { response, body } = await safeFetch(rawUrl)
  const contentType = (response.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].toLowerCase()
  if (contentType === 'application/pdf') {
    throw new Error('direct PDF text extraction is unavailable; use research.search to retrieve its indexed abstract or read the paper landing page')
  }
  if (!contentType.startsWith('text/') && contentType !== 'application/json' && contentType !== 'application/xhtml+xml') {
    throw new Error(`unsupported research content type: ${contentType}`)
  }
  const raw = new TextDecoder().decode(body)
  const text = contentType.includes('html') || contentType.includes('xhtml') ? decodeHtml(raw) : raw.trim()
  return {
    url: rawUrl,
    finalUrl: response.url || rawUrl,
    contentType,
    text: text.slice(0, MAX_TEXT_CHARS),
    bytes: body.byteLength,
    sha256: createHash('sha256').update(body).digest('hex'),
    truncated: text.length > MAX_TEXT_CHARS,
  }
}
