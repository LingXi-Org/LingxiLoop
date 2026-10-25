import type { KnowledgeSourceSearch } from '../knowledge/contracts'

export type MaterialEvidence = KnowledgeSourceSearch['matches'][number]
export interface EvidenceLineRange { start: number; end: number }

/** Only the returned extracted-text snapshot supplies positions. These are never file pages. */
export function evidenceLineRange(text: string, match: Pick<MaterialEvidence, 'excerpt' | 'anchor'>): EvidenceLineRange | null {
  const anchor = match.anchor
  if (!anchor || !Number.isSafeInteger(anchor.start) || !Number.isSafeInteger(anchor.end)
    || anchor.start < 0 || anchor.end <= anchor.start || anchor.end > text.length
    || text.slice(anchor.start, anchor.end) !== match.excerpt) return null
  const lineCount = (value: string) => (value.match(/\r\n|[\r\n\u2028\u2029]/g) ?? []).length
  const end = Math.max(anchor.start, anchor.end - (match.excerpt.match(/(?:\r\n|[\r\n\u2028\u2029])$/)?.[0].length ?? 0))
  return { start: lineCount(text.slice(0, anchor.start)) + 1, end: lineCount(text.slice(0, end)) + 1 }
}
