// Product integration; TeX parsing and delimiter matching stay in pinned KaTeX.
import katex from 'katex'
import splitAtDelimiters from 'katex/contrib/auto-render/splitAtDelimiters.ts'

const delimiters = [
  { left: '$$', right: '$$', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '\\[', right: '\\]', display: true },
]
const inlineDollar = [{ left: '$', right: '$', display: false }]
const isCurrency = source => /^\s|\s$|\n/.test(source) || /^\d/.test(source) && !/[\\^_={}+*<>]/.test(source)

// Raw text remains the document format and the editing surface. Only read-only
// views use these derived runs; never write KaTeX DOM back into the model.
export function slideMathRuns(runs) {
  const text = runs.map(run => run.text).join('')
  if (!/[\\$]/.test(text)) return runs
  const output = []
  const sources = []
  let offset = 0
  for (const run of runs) {
    sources.push({ run, start: offset, end: offset + run.text.length })
    offset += run.text.length
  }
  const append = (start, end, formula) => {
    for (const source of sources) {
      const left = Math.max(start, source.start), right = Math.min(end, source.end)
      if (left >= right) continue
      if (formula) {
        output.push({ ...source.run, text: text.slice(start, end), ...formula })
        return
      }
      output.push({ ...source.run, text: text.slice(left, right) })
    }
  }
  // Backtick code and escaped opening delimiters stay literal. This is delimiter
  // selection, not TeX parsing; KaTeX owns braces, environments and commands.
  const protectedPattern = /(`+)[\s\S]*?\1/g
  let start = 0
  const parse = (chunk, base) => {
    let at = base
    const masked = chunk.replace(/\\\\|\\\$/g, match => ' '.repeat(match.length))
    // Explicit delimiters take precedence over ambiguous currency dollars.
    const parts = splitAtDelimiters(masked, delimiters).flatMap(part => {
      if (part.type !== 'text') return [part]
      const dollars = part.data.replace(/\$(?=\d)/g, (dollar, index) => {
        const end = part.data.indexOf('$', index + 1)
        return end === -1 || isCurrency(part.data.slice(index + 1, end)) ? ' ' : dollar
      })
      return splitAtDelimiters(dollars, inlineDollar)
    })
    for (const part of parts) {
      const raw = text.slice(at, at + (part.rawData ?? part.data).length)
      const width = raw.startsWith('$$') || raw.startsWith('\\') ? 2 : 1
      const source = raw.slice(width, -width)
      let formula
      const singleDollar = raw.startsWith('$') && !raw.startsWith('$$')
      const currency = singleDollar && isCurrency(source)
      if (part.type === 'math' && !currency && source.trim() !== '' && source.length <= 16000) {
        try {
          formula = { mathHtml: katex.renderToString(source, {
            displayMode: part.display, output: 'htmlAndMathml', trust: false,
            strict: 'error', throwOnError: true, maxExpand: 1000, maxSize: 20,
          }), mathDisplay: part.display }
        } catch {
          // Unsupported/invalid input remains readable, escaped by React.
        }
      }
      append(at, at + raw.length, formula)
      at += raw.length
    }
  }
  for (const match of text.matchAll(protectedPattern)) {
    parse(text.slice(start, match.index), start)
    append(match.index, match.index + match[0].length)
    start = match.index + match[0].length
  }
  parse(text.slice(start), start)
  return output.some(run => run.mathHtml) ? output : runs
}

export function slideHasMath(slide) {
  const visit = node => {
    if (node.kind === 'text') return !isCodeText(node) && slideMathRuns([{ text: node.text }]).some(run => run.mathHtml)
    if (node.kind === 'table') return !isCodeText(node) && node.rows.some(row => row.some(text => slideMathRuns([{ text }]).some(run => run.mathHtml)))
    if (node.kind === 'stack' || node.kind === 'grid') return node.children.some(visit)
    if (node.kind === 'overlay') return visit(node.base) || node.layers.some(layer => visit(layer.node))
    return false
  }
  return slide.frames.some(frame => visit(frame.node))
}

export function isCodeText(node) {
  const family = node.style?.fontFamily
  return family === 'mono' || family?.fallback === 'mono' ||
    /monospace/i.test(typeof family === 'string' ? family : family?.family ?? '')
}
