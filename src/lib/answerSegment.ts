import { z } from 'zod'
import { activityAnnotation } from './runActivity.js'

/** Presentation coordinates from the native ordered source set. This is not a
 * message reducer: authorization, append/replace and acceptance stay upstream. */
const schema = z.object({ version: z.literal(3),messageId: z.string().min(1).max(2000),
  segmentId: z.string().min(1).max(2000),partId: z.string().min(1).max(2000),
  start: z.number().int().nonnegative().safe(),end: z.number().int().nonnegative().safe(),
}).strict()
export type AnswerSegment = z.infer<typeof schema>
export function answerSegment(part: unknown): AnswerSegment | undefined {
  if (!part || typeof part !== 'object' || Reflect.get(part,'type') !== 'text' || typeof Reflect.get(part,'text') !== 'string') return
  const metadata = Reflect.get(part,'providerMetadata')
  const product = metadata && typeof metadata === 'object' ? Reflect.get(metadata,'lingxiloop') : undefined
  const value = product && typeof product === 'object' ? Reflect.get(product,'answerSegment') : undefined
  if (value === undefined) return undefined
  const parsed = schema.safeParse(value)
  return parsed.success && parsed.data.end - parsed.data.start === Reflect.get(part,'text').length ? parsed.data : undefined
}
export function answerTextOffset(parts: readonly unknown[], index: number): number {
  const source = answerSegment(parts[index])
  if (source) return source.start
  return parts.slice(0,index).reduce<number>((offset,part) => {
    const annotation = activityAnnotation(part)
    return offset + (part && typeof part === 'object' && Reflect.get(part,'type') === 'text'
      && typeof Reflect.get(part,'text') === 'string' && annotation?.kind !== 'commentary' && annotation?.purpose !== 'process'
      ? Reflect.get(part,'text').length + 1 : 0)
  },0)
}
