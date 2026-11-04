// Product integration; the installed KaTeX is loaded only for a formula/export.
import katex from 'katex'
import { slideMathRunsWith, isCodeText } from './math-source.js'
export { isCodeText } from './math-source.js'

export function slideMathRuns(runs) {
  return slideMathRunsWith(runs, (source, displayMode) => katex.renderToString(source, {
    displayMode, output: 'htmlAndMathml', trust: false,
    strict: 'error', throwOnError: true, maxExpand: 1000, maxSize: 20,
  }))
}

// The browser build embeds only the stylesheet here, beside the lazy renderer.
// Node compilation has no DOM and never installs styles.
export function installMathStyles() {
  if (typeof document === 'undefined' || typeof __LINGXI_SLIDES_MATH_CSS__ === 'undefined'
    || document.querySelector('style[data-slides-math-style]')) return
  const style = document.createElement('style')
  style.dataset.slidesMathStyle = ''
  style.textContent = __LINGXI_SLIDES_MATH_CSS__
  document.head.append(style)
}

installMathStyles()

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
