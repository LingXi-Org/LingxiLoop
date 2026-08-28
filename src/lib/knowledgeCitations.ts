import type { KnowledgeCitation } from '@/features/knowledge/contracts'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Citation markers are a model-facing grounding contract, not message prose.
 * The validated citations remain attached to the message and render below the
 * bubble, while their inline [S1] tokens are removed from the readable body.
 */
export function withoutInlineKnowledgeCitations(
  body: string,
  citations?: Array<Pick<KnowledgeCitation, 'marker'>>,
): string {
  const markers = [...new Set(citations?.map((citation) => citation.marker.trim()).filter(Boolean) ?? [])]
  if (markers.length === 0) return body
  const markerPattern = markers.map(escapeRegExp).join('|')
  return body
    .replace(new RegExp(`(?:[ \\t]*\\[(?:${markerPattern})\\])+`, 'g'), '')
    .replace(/[ \t]+([，。；：！？,.!?;:])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
}
