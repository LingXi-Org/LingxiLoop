// Shared browser assertion input, used only by the focused scrollbar checks.
export default function mathScrollbarMetrics(root = document) {
  return [...root.querySelectorAll('.katex')].map(math => {
    const scroll = math.closest('.bn-preview-container') ?? math.closest('.katex-display') ?? math
    const css = getComputedStyle(scroll)
    const source = math.querySelector('annotation')?.textContent ?? ''
    const short = ['x_1','x_2','\\sqrt{x}','\\sqrt{x_2}','h_t=f(h_{t-1},x_t)','\\frac{1}{2}'].includes(source)
    return {source,short,width:scroll.getBoundingClientRect().width,client:scroll.clientWidth,content:scroll.scrollWidth,
      range:scroll.scrollWidth-scroll.clientWidth,overflow:css.overflowX,tab:scroll.tabIndex,
      height:scroll.offsetHeight,clientHeight:scroll.clientHeight,scrollHeight:scroll.scrollHeight,
      font:getComputedStyle(math).fontSize,frac:math.querySelectorAll('.mfrac').length,
      matrix:math.querySelectorAll('.mtable').length,root:math.querySelectorAll('.sqrt').length}
  })
}
