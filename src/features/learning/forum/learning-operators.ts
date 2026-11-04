import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { visit } from 'unist-util-visit'
import { remarkCurrencySafeMath } from './memos/remark-currency-safe-math'

// Match the learning renderer's math boundaries and GFM autolinks. Parsing with
// plain CommonMark would mistake operators inside those nodes for prose.
const parser = unified().use(remarkParse).use(remarkCurrencySafeMath).use(remarkGfm)

/** Protect compact multiplication/exponent tokens in legacy learning prose.
 * Stored source is untouched. Native/code nodes and ordinary emphasis stay owned
 * by their existing parsers; never turn every asterisk into literal text. */
export function preserveLearningOperators(source: string): string {
  const protectedRanges: [number, number][] = []
  const arithmetic=(offset:number,length:number)=>{
    const left=source.slice(0,offset).match(/[A-Za-z0-9_]+$/)?.[0]??''
    const right=source.slice(offset+length).match(/^-?[A-Za-z0-9_]+/)?.[0]??''
    return Boolean(left&&right&&/\d/.test(left+right))
  }
  visit(parser.parse(source), node => {
    const start=node.position?.start.offset,end=node.position?.end.offset
    if(start===undefined||end===undefined)return
    if(node.type==='code'||node.type==='inlineCode'||node.type==='math'||node.type==='inlineMath'||node.type==='definition'
      ||node.type==='link'&&source[start]!=='[')protectedRanges.push([start,end])
    if(node.type==='emphasis'||node.type==='strong') {
      const size=node.type==='strong'?2:1
      // Respect real Markdown delimiters. Only paired delimiters embedded in
      // compact numeric expressions (e.g. 2*3*4) can be arithmetic instead.
      if(!arithmetic(start,size)||!arithmetic(end-size,size))protectedRanges.push([start,end])
    }
  })
  return source.replace(/(?<=[A-Za-z0-9_])\*{1,2}(?=-?[A-Za-z0-9_])/g, (operator, offset: number) =>
    !arithmetic(offset,operator.length)||protectedRanges.some(([start, end]) => offset >= start && offset < end) ? operator : operator.replaceAll('*', '\\*'))
}

/** Detect recoverable display disagreement without rewriting native authoring.
 * A historical recovery copy alone cannot prove what the learner last saved. */
export function nativeOperatorMismatch(document: { blocks: unknown[] }, source: string): boolean {
  const visible:string[]=[]
  visit(parser.parse(preserveLearningOperators(source)),node=>{
    if(node.type==='text'||node.type==='code'||node.type==='inlineCode')visible.push(node.value)
  })
  const tokens=visible.join('\n').match(/[A-Za-z0-9_)]+\*{1,2}-?[A-Za-z0-9_(]+/g)??[]
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
