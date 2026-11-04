import { fromMarkdown } from 'mdast-util-from-markdown'
import { visit } from 'unist-util-visit'

/** Protect compact multiplication/exponent tokens in legacy learning prose.
 * Stored source is untouched. Native/code nodes and ordinary emphasis stay owned
 * by their existing parsers; never turn every asterisk into literal text. */
export function preserveLearningOperators(source: string): string {
  const protectedRanges: [number, number][] = []
  visit(fromMarkdown(source), node => {
    if ((node.type === 'code' || node.type === 'inlineCode') && node.position?.start.offset !== undefined && node.position.end.offset !== undefined) {
      protectedRanges.push([node.position.start.offset, node.position.end.offset])
    }
  })
  return source.replace(/(?<=[A-Za-z0-9_)])\*{1,2}(?=-?[A-Za-z0-9_(])/g, (operator, offset: number) =>
    protectedRanges.some(([start, end]) => offset >= start && offset < end) ? operator : operator.replaceAll('*', '\\*'))
}

/** Detect recoverable display disagreement without rewriting native authoring.
 * A historical recovery copy alone cannot prove what the learner last saved. */
export function nativeOperatorMismatch(document: { blocks: unknown[] }, source: string): boolean {
  const tokens=source.match(/[A-Za-z0-9_)]+\*{1,2}-?[A-Za-z0-9_(]+/g)??[]
  if(!tokens.length)return false
  const text=(value:unknown):string=>{
    if(Array.isArray(value))return value.map(text).join('')
    if(!value||typeof value!=='object')return ''
    const item=value as Record<string,unknown>
    if(typeof item.text==='string')return item.text
    return text(item.content)+text(item.rows)+text(item.cells)+text(item.children)
  }
  const native=text(document.blocks)
  return tokens.some(token=>!native.includes(token))
}
