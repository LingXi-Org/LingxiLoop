import { answerSegment } from './answerSegment.js'
import { extractAssistantDirectives, findMarkdownCodeRanges } from '../features/chat/visualize/zcode/lib/assistantDirectiveParser.js'
import { parseMarkdownIntoBlocks } from 'streamdown'

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
  // Use the renderer's official block parser rather than another Markdown
  // grammar. Coordinates are safe only when it preserves every source unit.
  const blocks = parseMarkdownIntoBlocks(body)
  if (blocks.join('') !== body) return
  let blockOffset=0
  const blockRanges=blocks.map(block=>{const start=blockOffset;blockOffset+=block.length;return {start,end:blockOffset}})
  const code = findMarkdownCodeRanges(body)
  const ranges = [...blockRanges,...code.map(([start,end])=>({start,end})), ...citations.filter(range => Number.isSafeInteger(range.start) && Number.isSafeInteger(range.end)
    && range.start >= 0 && range.end > range.start && range.end <= body.length),
    ...extractAssistantDirectives(body,'visualize').filter(({start})=>!code.some(([from,to])=>start >= from && start < to)).map(({start,end})=>({start,end}))]
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

/** A block owned by a sealed source may include a later source still streaming. */
export function answerDisplayRunning(parts: readonly unknown[], index:number, range:{offset:number;text:string}):boolean {
  const source=answerSegment(parts[index])
  return !!source && parts.some(part=>{
    const other=answerSegment(part)
    const status=part && typeof part==='object' ? Reflect.get(part,'status') : undefined
    return other?.messageId===source.messageId && other.start<range.offset+range.text.length && other.end>range.offset
      && !!status && typeof status==='object' && Reflect.get(status,'type')==='running'
  })
}
