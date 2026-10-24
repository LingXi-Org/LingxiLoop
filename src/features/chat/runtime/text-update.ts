import type { ThreadMessage } from '@assistant-ui/react'
import { answerSegment } from '@/lib/answerSegment'
import { activityAnnotation } from '@/lib/runActivity'

/** JSON-shaped, already validated internal values only. No schema validation is skipped. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key)
    && sameValue(Reflect.get(left, key), Reflect.get(right, key)))
}

/** Share unchanged parts only; a same-length replacement or any structural change is not an append. */
export function appendedContent(before: ThreadMessage['content'], after: ThreadMessage['content']): ThreadMessage['content'] | undefined {
  if (before.length !== after.length) return
  let changed = false
  const content = []
  for (let index = 0; index < before.length; index++) {
    const old = before[index], next = after[index]
    if (sameValue(old, next)) { content.push(old); continue }
    let comparable = next
    // Projection watermarks advance even on unchanged tool parts. Preserve the
    // new watermark, but it alone need not force a separate UI publication.
    const oldActivity = activityAnnotation(old), nextActivity = activityAnnotation(next)
    if (oldActivity?.revision !== undefined && nextActivity?.revision !== undefined
      && nextActivity.revision >= oldActivity.revision && sameValue({ ...oldActivity, revision: nextActivity.revision }, nextActivity)
      && 'providerMetadata' in next) comparable = { ...next, providerMetadata: { ...next.providerMetadata, lingxiloop: {
        ...next.providerMetadata?.lingxiloop, activity: oldActivity,
      } } }
    if (old.type === 'text' && next.type === 'text' && comparable.type === 'text') {
      if (!next.text.startsWith(old.text)) return
      const oldSource = answerSegment(old), nextSource = answerSegment(next)
      comparable = oldSource && nextSource && sameValue({ ...oldSource, end: nextSource.end }, nextSource)
        ? { ...comparable, text: old.text, providerMetadata: { ...comparable.providerMetadata, lingxiloop: {
          ...comparable.providerMetadata?.lingxiloop, answerSegment: oldSource,
        } } } as typeof next : { ...comparable, text: old.text } as typeof next
    }
    if (!sameValue(old, comparable)) return
    content.push(next); changed = true
  }
  return changed ? content as ThreadMessage['content'] : before
}
