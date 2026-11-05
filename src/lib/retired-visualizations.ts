import { fromMarkdown } from 'mdast-util-from-markdown'
import { visit } from 'unist-util-visit'

/** Read-only handling of archived references; never loads or executes their contents. */
export function retiredVisualizationRanges(text: string): { start: number; end: number }[] {
  if (!text.includes('visualize')) return []
  const code: { start: number; end: number }[] = []
  visit(fromMarkdown(text), node => {
    if ((node.type === 'code' || node.type === 'inlineCode') && node.position) {
      code.push({ start: node.position.start.offset!, end: node.position.end.offset! })
    }
  })
  const ranges: { start: number; end: number }[] = []
  for (const match of text.matchAll(/::visualize\s*\{|visualize/gu)) {
    const start = match.index
    if (code.some(range => start >= range.start && start < range.end) || ranges.some(range => start < range.end)) continue
    let end = text.length
    if (match[0].startsWith('')) {
      const close = text.indexOf('', start + match[0].length)
      if (close >= 0) end = close + 1
    } else {
      let quote = '', escaped = false
      for (let index = start + match[0].length; index < text.length; index++) {
        const character = text[index]!
        if (quote) {
          if (escaped) escaped = false
          else if (character === '\\') escaped = true
          else if (character === quote) quote = ''
        } else if (character === '"' || character === "'") quote = character
        else if (character === '}') { end = index + 1; break }
      }
    }
    ranges.push({ start, end })
  }
  return ranges
}
