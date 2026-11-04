// Test-only dependency of the byte-frozen historical display fixture.
// #670 keeps historical text inert; no legacy renderer or product runtime exists.
import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
export function assertVisualizeCitationSpans(_body: string, _citations: readonly {start:number;end:number}[]) {
  // Historical fixture citations are checked by the native response reader.
  // Inert references no longer remove bytes or change citation coordinates.
}
export function projectVisualizeText(body: string, _preview: boolean): ThreadAssistantMessagePart[] {
  return body ? [{type:'text',text:body}] : []
}
