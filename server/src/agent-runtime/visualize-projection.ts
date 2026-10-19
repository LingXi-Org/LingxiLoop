import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import { extractAssistantDirectives } from '../../../src/features/chat/visualize/zcode/lib/assistantDirectiveParser.js'
import { projectGenUiReferences } from '../../../src/features/chat/visualize/zcode/gen-ui/domain/references.js'

export function visualizeReferences(body: string) {
  if (!body.includes(':') && !body.includes('')) return []
  return projectGenUiReferences(body, true).flatMap(part => part.kind === 'ui' ? [part] : [])
}
export function assertVisualizeCitationSpans(body: string, citations: readonly { start: number; end: number }[]) {
  for (const part of visualizeReferences(body)) {
    const directive = extractAssistantDirectives(body, 'visualize').find(item => item.start === part.offset)
    const end = directive?.end ?? body.indexOf('', part.offset) + 1
    if (citations.some(citation => citation.start < end && citation.end > part.offset)) throw new Error('citation cannot intersect a visualize reference')
  }
}
export function projectVisualizeText(body: string, preview: boolean): ThreadAssistantMessagePart[] {
  // Both complete directives and pending prefixes need one of these markers.
  // Ordinary streaming prose avoids repeatedly scanning all Markdown ranges.
  const text = preview && (body.includes(':') || body.includes(''))
    ? projectGenUiReferences(body, false).flatMap(part => part.kind === 'text' ? [part.text] : []).join('') : body
  return text ? [{ type: 'text', text }] : []
}
