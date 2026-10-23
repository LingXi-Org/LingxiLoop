import { answerSegment } from './answerSegment.js'
import { extractAssistantDirectives, findMarkdownCodeRanges } from '../features/chat/visualize/zcode/lib/assistantDirectiveParser.js'

/** Display complete atomic references at the source in which they start. The
 * canonical parts and copied text stay unchanged. No append/replace decisions
 * happen here; the native reader already chose this ordered source collection. */
export function answerDisplaySlice(parts: readonly unknown[], index: number, citations: readonly {start:number;end:number}[]) {
  const source = answerSegment(parts[index])
  if (!source) return
  let body = '',offset = 0
  for (const part of parts) {
    const item = answerSegment(part)
    if (!item || item.messageId !== source.messageId) continue
    if (item.start !== offset) return
    body += Reflect.get(part as object,'text'); offset = item.end
  }
  if (offset < source.end) return
  const ranges = [...citations.filter(range => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.start >= 0 && range.end > range.start && range.end <= body.length),
    ...extractAssistantDirectives(body,'visualize').map(({start,end})=>({start,end}))]
  const code = findMarkdownCodeRanges(body)
  for (const match of body.matchAll(/visualize/gu)) {
    const start = match.index,end = body.indexOf('',start + match[0].length)
    if (end >= 0 && !code.some(([from,to])=>start >= from && start < to)) ranges.push({start,end:end+1})
  }
  let start = source.start,end = source.end
  for (const range of ranges.sort((a,b)=>a.start-b.start)) {
    if (range.start < start && range.end > start) start = range.end
    if (range.start >= source.start && range.start < end && range.end > end) end = range.end
  }
  end = Math.max(start,end)
  return {text:body.slice(start,end),offset:start}
}
