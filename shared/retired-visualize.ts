import { extractAssistantDirectives, findMarkdownCodeRanges } from './assistant-directive-parser.js'

/** Read-only compatibility for durable pre-retirement message references. No
 * renderer, bridge, runtime protocol or tool is retained by this parser. */
export interface LegacyVisualizeReference {
  path: string
  title?: string
  mode?: 'wide'
  start: number
  end: number
  raw: string
}

function parseReference(value: unknown): Pick<LegacyVisualizeReference, 'path' | 'title' | 'mode'> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !['path', 'title', 'mode'].includes(key))) return
  const { path, title, mode } = record
  if (typeof path !== 'string' || !path || path.length > 4096 || /[\0\r\n]/u.test(path)) return
  const segments = path.split(/[\\/]/u)
  if (!/^(?:\/|[A-Za-z]:[\\/]|\\\\)/u.test(path) || segments.includes('..')
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/u.test(segments.at(-1) ?? '')) return
  if (title !== undefined && (typeof title !== 'string' || title.length > 250)) return
  if (mode !== undefined && mode !== 'wide') return
  return { path, ...(typeof title === 'string' ? { title } : {}), ...(mode === 'wide' ? { mode } : {}) }
}

export function legacyVisualizeReferences(text: string): LegacyVisualizeReference[] {
  const protectedRanges = findMarkdownCodeRanges(text)
  const candidates = extractAssistantDirectives(text, 'visualize').map(directive => ({
    start: directive.start, end: directive.end, raw: directive.raw,
    decode: () => directive.parameters ?? JSON.parse(directive.raw.slice(directive.raw.indexOf('{'))),
  }))
  for (const match of text.matchAll(/visualize/gu)) {
    const start = match.index, end = text.indexOf('', start + match[0].length)
    if (end >= 0) candidates.push({ start, end: end + 1, raw: text.slice(start, end + 1),
      decode: () => JSON.parse(text.slice(start + match[0].length, end)) })
  }
  const references: LegacyVisualizeReference[] = []
  let cursor = 0
  for (const candidate of candidates.sort((a, b) => a.start - b.start)) {
    if (candidate.start < cursor || protectedRanges.some(([from, to]) => candidate.start >= from && candidate.start < to)) continue
    cursor = candidate.end
    try {
      const reference = parseReference(candidate.decode())
      if (reference) references.push({ ...reference, start: candidate.start, end: candidate.end, raw: candidate.raw })
    } catch { /* Preserve malformed historic input as ordinary message text. */ }
  }
  return references
}
