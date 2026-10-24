import { parseCoverFrame, type CoverSvgNode } from './protocol'

const escapeAttribute = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
/** A closed, inert SVG image document; never generated HTML or application DOM. */
export function coverFrameSvg(json: string, theme: 'light' | 'dark' = 'light', preserveClasses = false): string {
  const frame = parseCoverFrame(json)
  const p = theme === 'dark' ? { plate: '#08090a', hi: '#d0d6e0', edge: '#5b5d64', mid: '#3e3e44', lo: '#29292d' } : { plate: '#ffffff', hi: '#232327', edge: '#a4a4ac', mid: '#c3c3c9', lo: '#e0e0e4' }
  const geometry = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
  let geometryCount = 0
  function render(node: CoverSvgNode, definition = false, ghost = false): string {
    const attrs = { ...node.attrs }, classes = new Set((attrs.class ?? '').split(/\s+/))
    if (!preserveClasses) delete attrs.class
    definition ||= node.tag === 'defs' || node.tag === 'mask'
    ghost ||= classes.has('ghost')
    if (geometry.has(node.tag) && !definition) {
      geometryCount++
      Object.assign(attrs, { fill: classes.has('nf') || ghost ? 'none' : p.plate, stroke: classes.has('fo') ? 'none' : classes.has('lo') ? p.lo : classes.has('hi') ? p.hi : classes.has('sil') ? p.edge : p.mid, 'stroke-width': '0.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
      if (classes.has('dot')) { attrs.fill = classes.has('off') ? p.lo : classes.has('m') ? p.edge : p.hi; attrs.stroke = 'none' }
      if (classes.has('dash')) attrs['stroke-dasharray'] = '1 3'
    }
    for (const key of Object.keys(attrs)) attrs[key] = attrs[key].replace(/^var\(--hl-(plate|hi|edge|mid|lo)\)$/, (_, token: keyof typeof p) => p[token])
    if (node.tag === 'svg') Object.assign(attrs, { xmlns: 'http://www.w3.org/2000/svg', width: '400', height: '320' })
    const background = node.tag === 'svg' ? `<rect width="400" height="320" fill="${p.plate}"/>` : ''
    return `<${node.tag}${Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeAttribute(value)}"`).join('')}>${background}${node.children.map(child => render(child, definition, ghost)).join('')}</${node.tag}>`
  }
  const svg = render(frame.root)
  if (!geometryCount) throw Error('empty_cover_geometry')
  return svg
}
