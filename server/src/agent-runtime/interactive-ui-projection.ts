import { createHash } from 'node:crypto'
import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import type { NativeMessage } from '../../../src/lib/nativeMessage.js'
import { OPENUI_CATALOG_VERSION, OPENUI_COMPONENT, OPENUI_LANGUAGE, OPENUI_RENDERER_VERSION } from '../../../src/lib/interactive-ui/catalog.js'
import { openUiEnvelopeSchema, type OpenUiEnvelope } from '../../../src/lib/interactive-ui/protocol.js'
import { extractLessonBlocks, parseLessonSource } from '../../../src/lib/interactive-ui/source.js'

export function messageLessons(message: Pick<NativeMessage, 'content'>): OpenUiEnvelope[] {
  return message.content.flatMap(part => {
    if (part.type !== 'generative-ui' || Array.isArray(part.spec.root) || typeof part.spec.root !== 'object'
      || part.spec.root.component !== OPENUI_COMPONENT) return []
    const parsed = openUiEnvelopeSchema.safeParse(part.spec.root.props)
    return parsed.success ? [parsed.data] : []
  })
}

export function assertLessonCitationSpans(body: string, citations: readonly { start: number; end: number }[]) {
  const blocks = extractLessonBlocks(body)
  if (citations.some(citation => blocks.some(block => citation.start < block.end && citation.end > block.start))) {
    throw new Error('citation cannot intersect an interactive UI fence')
  }
}

export function projectLessonText(body: string, runId: string, preview: boolean): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = []
  const text = (value: string) => { if (value) parts.push({ type: 'text', text: value }) }
  let offset = 0, index = 0
  for (const block of extractLessonBlocks(body)) {
    text(body.slice(offset, block.start))
    offset = block.end
    try {
      if (++index > 4 || !preview && !block.closed) throw new Error('invalid lesson boundary')
      const lesson = parseLessonSource(block.source, { preview })
      if (Boolean(lesson.revisionOf) !== Boolean(lesson.baseRevision)) throw new Error('invalid revision reference')
      const uiId = lesson.revisionOf ?? `ui-${createHash('sha256').update(`${runId}:${index}`).digest('hex').slice(0, 40)}`
      const envelope = openUiEnvelopeSchema.parse({ schemaVersion: 1, catalogVersion: OPENUI_CATALOG_VERSION, rendererVersion: OPENUI_RENDERER_VERSION,
        uiId, messageId: `run-${runId}`, runId, revision: (lesson.baseRevision ?? 0) + 1, baseRevision: lesson.baseRevision ?? 0,
        source: block.source, sourceHash: createHash('sha256').update(block.source).digest('hex'), fallback: lesson.fallback,
        phase: preview ? 'preview' : 'ready', fields: lesson.fields, actions: lesson.actions })
      parts.push({ type: 'generative-ui', id: `${uiId}:${envelope.revision}`, spec: { root: { component: OPENUI_COMPONENT, props: envelope } } })
    } catch {
      text(preview ? '正在生成交互讲解…' : '交互讲解暂不可用，请参考这条消息中的文字说明，或请助手用文字重新解释。')
    }
  }
  let tail = body.slice(offset)
  // A token may stop midway through the fence language; do not flash its transport syntax.
  if (preview) tail = tail.replace(/(^|\n) {0,3}(`{3,}|~{3,})([\w-]*)$/, (raw, _newline, _fence, language: string) =>
    OPENUI_LANGUAGE.startsWith(language) ? '' : raw)
  text(tail)
  return parts
}
