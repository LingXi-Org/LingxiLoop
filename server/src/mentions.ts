export { canonicalizeMentions, maskNonMentionText, parseMentions, scanMentions, type MentionTarget, type MentionRange, type ParsedMentions } from '../../src/lib/mentions.js'
import { z } from 'zod'
import { scanMentions, type MentionTarget } from '../../src/lib/mentions.js'
import { nativeMessageSchema, nativeText, type NativeMessage } from './im/message-types.js'

/** Resolve once at send admission so a retry or rename cannot change the addressed members. */
export function canonicalMessageMentions(message: NativeMessage, targets: readonly MentionTarget[]): NativeMessage {
  const mentions = scanMentions(nativeText(message), targets, { allowInlineCodeMentions: message.role === 'assistant' })
  if (!mentions.length) return message
  const shift = (offset: number) => offset + mentions.filter(mention => mention.end <= offset)
    .reduce((delta, mention) => delta + mention.id.length + 1 - (mention.end - mention.start), 0)
  let offset = 0
  return nativeMessageSchema.parse({ ...message, content: message.content.map(part => {
    if (part.type === 'text') {
      const start = offset
      offset += part.text.length + 1
      let text = part.text
      for (const mention of mentions.filter(mention => mention.start >= start && mention.end < offset).reverse()) {
        text = text.slice(0, mention.start - start) + '@' + mention.id + text.slice(mention.end - start)
      }
      return { ...part, text }
    }
    if (part.type === 'data' && part.name === 'citation-claims') {
      const data = z.object({ claims: z.array(z.object({ start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).passthrough()) }).passthrough().parse(part.data)
      return { ...part, data: { ...data, claims: data.claims.map(claim => ({ ...claim, start: shift(claim.start), end: shift(claim.end) })) } }
    }
    return part
  }) })
}
