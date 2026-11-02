import splitAtDelimiters from 'katex/contrib/auto-render/splitAtDelimiters.ts'

const explicit = [
  {left:'$$',right:'$$',display:true},
  {left:'\\(',right:'\\)',display:false},
  {left:'\\[',right:'\\]',display:true},
  ...['equation','align','alignat','gather','CD'].map(name=>({left:`\\begin{${name}}`,right:`\\end{${name}}`,display:true})),
]
const dollars = [{left:'$',right:'$',display:false}]

/** Select inline-dollar source ranges; pinned KaTeX owns delimiter/brace matching. */
export function inlineDollarRanges(text: string) {
  const ranges: {start:number;end:number;source:string}[] = []
  let masked = text.replace(/(`+)[\s\S]*?\1|\\\\|\\\$/g, match=>' '.repeat(match.length))
  // Explicit/AMS math is owned by the existing auto-render pass, including its
  // readable fallback. Never reinterpret dollars inside those source regions.
  masked = splitAtDelimiters(masked,explicit).map(part=>part.type==='math'
    ? ' '.repeat(part.rawData!.length) : part.data).join('')
  let offset = 0
  while (offset < text.length) {
    const parts = splitAtDelimiters(masked.slice(offset),dollars)
    const next = parts.findIndex(part=>part.type==='math')
    if(next===-1) break
    const start = offset + parts.slice(0,next).reduce((n,part)=>n+part.data.length,0)
    const end = start + parts[next].rawData!.length
    const source = text.slice(start+1,end-1)
    const notation = /[\\^_={}+*<>]/.test(source)
    const literal = /^\s|\s$|\n|^[;,:.!?]/.test(source)
      || /^-?\d/.test(source) && !notation
      || /\s/.test(source) && !notation
    if(source && source.length<=16000 && !literal) {
      ranges.push({start,end,source})
      offset=end
    } else {
      // A literal price's dollar must not consume a later formula's opening $.
      offset=start+1
    }
  }
  return ranges
}
