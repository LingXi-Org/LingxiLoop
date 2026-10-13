import { createHash } from 'node:crypto'
import type { ThreadAssistantMessagePart } from '@assistant-ui/react'
import type { VerificationRecord } from '@lyyzka/lingxios'
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

/** Let the published runtime repair invalid candidates within its existing retry budget. */
export function verifyLessonCandidate(body: string): VerificationRecord[] {
  return extractLessonBlocks(body).slice(0, 5).map((block, index) => {
    const checker = `product:interactive-ui:${index + 1}`
    try {
      if (index >= 4) throw new Error('interactive-ui:lesson-budget')
      if (block.unfenced) throw new Error('interactive-ui:fence')
      if (!block.closed) throw new Error('interactive-ui:unclosed')
      parseLessonSource(block.source)
      return { checker, status: 'passed', evidence: { sourceHash: createHash('sha256').update(block.source).digest('hex') } }
    } catch (error) {
      const reason = error instanceof Error && /^interactive-ui:[a-z-]+$/.test(error.message) ? error.message : 'interactive-ui:invalid'
      return { checker, status: 'failed', evidence: { reason,
        hint: reason === 'interactive-ui:fence'
          ? `Wrap the complete lesson source and all $state defaults in one top-level fenced code block with language ${OPENUI_LANGUAGE}. Do not repeat source as prose.`
          : reason === 'interactive-ui:choice'
          ? 'Choice default must exactly match one of its options strings. Empty defaults are invalid. Use Prediction for free text.'
          : 'Every $state reference needs a literal default and exactly one matching control. Use registered component signatures, closed source and at most four lessons.' } }
    }
  })
}

export function projectLessonText(body: string, runId: string, preview: boolean): ThreadAssistantMessagePart[] {
  const parts: ThreadAssistantMessagePart[] = []
  const text = (value: string) => { if (value) parts.push({ type: 'text', text: value }) }
  let offset = 0, index = 0
  for (const block of extractLessonBlocks(body, { preview })) {
    text(body.slice(offset, block.start))
    offset = block.end
    try {
      if (++index > 4 || block.unfenced || !preview && !block.closed) throw new Error('invalid lesson boundary')
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
    language && OPENUI_LANGUAGE.startsWith(language) ? '' : raw)
  text(tail)
  return parts
}
