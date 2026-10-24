export { canonicalizeMentions, maskNonMentionText, parseMentions, scanMentions, type MentionTarget, type MentionRange, type ParsedMentions } from '../../src/lib/mentions.js'
import { z } from 'zod'
import { scanMentions, type MentionTarget } from '../../src/lib/mentions.js'
import { nativeMessageSchema, nativeText, type NativeMessage } from './im/message-types.js'
import { activityAnnotation } from '../../src/lib/runActivity.js'
import { answerSegment } from '../../src/lib/answerSegment.js'

/** Resolve once at send admission so a retry or rename cannot change the addressed members. */
export function canonicalMessageMentions(message: NativeMessage, targets: readonly MentionTarget[]): NativeMessage {
  const body = nativeText(message)
  const mentions = scanMentions(body, targets, { allowInlineCodeMentions: message.role === 'assistant' })
  if (!mentions.length) return message
  let canonical = body
  for (const mention of [...mentions].reverse()) canonical = canonical.slice(0, mention.start) + '@' + mention.id + canonical.slice(mention.end)
  // A mention split across native source slices belongs to its first slice.
  // Mapping every boundary through the same edits keeps the slices contiguous.
  const shift = (offset: number) => {
    let delta = 0
    for (const mention of mentions) {
      if (offset <= mention.start) break
      if (offset < mention.end) return mention.start + delta + mention.id.length + 1
      delta += mention.id.length + 1 - (mention.end - mention.start)
    }
    return offset + delta
  }
  let offset = 0, count = 0, previous: ReturnType<typeof answerSegment>
  const sourceDeltas = new Map<string, number>()
  return nativeMessageSchema.parse({ ...message, content: message.content.map(part => {
    if (part.type === 'text') {
      const activity = activityAnnotation(part)
      if (activity?.kind === 'commentary' || activity?.purpose === 'process') return part
      const source = answerSegment(part)
      const contiguous = source && previous && source.messageId === previous.messageId && source.start === previous.end
      // Exactly nativeText's inclusion and separator rules, before any edits.
      if (count && !contiguous) offset++
      const start = offset
      offset += part.text.length
      previous = source; count++
      const text = canonical.slice(shift(start), shift(offset))
      if (!source) return { ...part, text }
      const delta = sourceDeltas.get(source.messageId) ?? 0
      sourceDeltas.set(source.messageId, delta + text.length - part.text.length)
      return { ...part, text, providerMetadata: { ...part.providerMetadata, lingxiloop: {
        ...part.providerMetadata?.lingxiloop,
        answerSegment: { ...source, start: source.start + delta, end: source.start + delta + text.length },
      } } }
    }
    if (part.type === 'data' && part.name === 'citation-claims') {
      const data = z.object({ claims: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).passthrough()) }).passthrough().parse(part.data)
      return { ...part, data: { ...data, claims: data.claims.map(claim => ({ ...claim, start: shift(claim.start), end: shift(claim.end) })) } }
    }
    return part
  }) })
}
