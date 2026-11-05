import { createNode, type ArtifactDocument, type ArtifactNode, type ArtifactPage } from './artifact-document.js'
import type { ArtifactOperation } from './artifact-operations.js'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export function selectionBounds(nodes: ArtifactNode[]) {
  const x = Math.min(...nodes.map(n => n.x)), y = Math.min(...nodes.map(n => n.y))
  return { x, y, width: Math.max(...nodes.map(n => n.x + n.width)) - x, height: Math.max(...nodes.map(n => n.y + n.height)) - y }
}
export function resizeSelection(nodes: ArtifactNode[], handle: ResizeHandle, dx: number, dy: number): ArtifactNode[] {
  if (!nodes.length) return []
  const b = selectionBounds(nodes)
  const width = Math.max(8, b.width + (handle.includes('w') ? -dx : handle.includes('e') ? dx : 0))
  const height = Math.max(8, b.height + (handle.includes('n') ? -dy : handle.includes('s') ? dy : 0))
  const x = handle.includes('w') ? b.x + b.width - width : b.x, y = handle.includes('n') ? b.y + b.height - height : b.y
  const sx = width / Math.max(1, b.width), sy = height / Math.max(1, b.height)
  return nodes.map(n => ({ ...n, x: x + (n.x - b.x) * sx, y: y + (n.y - b.y) * sy, width: Math.max(1, n.width * sx), height: Math.max(1, n.height * sy) }))
}
export function distributeNodes(nodes: ArtifactNode[], axis: 'horizontal' | 'vertical'): ArtifactNode[] {
  if (nodes.length < 3) return nodes
  const key = axis === 'horizontal' ? 'x' : 'y', size = axis === 'horizontal' ? 'width' : 'height'
  const ordered = [...nodes].sort((a, b) => a[key] - b[key]), first = ordered[0]!, last = ordered.at(-1)!
  const gap = (last[key] + last[size] - first[key] - ordered.reduce((sum, n) => sum + n[size], 0)) / (ordered.length - 1)
  let at = first[key]
  const result = new Map(ordered.map(node => { const n = { ...node, [key]: at }; at += node[size] + gap; return [node.id, n] }))
  return nodes.map(node => result.get(node.id)!)
}
export function duplicatePages(document: ArtifactDocument, selected: string[], nextId: () => string): ArtifactOperation[] {
  const ops: ArtifactOperation[] = []
  let inserted = 0
  for (const sourceId of document.pageOrder.filter(id => selected.includes(id))) {
    const source = document.pages[sourceId]!, page = structuredClone(source)
    page.id = nextId(); page.title = `${source.title} 副本`; page.x += 40; page.y += 40
    const mapping = new Map(page.nodeOrder.map(id => [id, nextId()]))
    page.nodes = Object.fromEntries(page.nodeOrder.map(id => { const n = page.nodes[id]!; return [mapping.get(id)!, { ...n, id: mapping.get(id)!, parentId: n.parentId ? mapping.get(n.parentId) ?? null : null }] }))
    page.nodeOrder = page.nodeOrder.map(id => mapping.get(id)!)
    ops.push({ type: 'page.insert', page, index: document.pageOrder.indexOf(sourceId) + ++inserted })
  }
  return ops
}
export function drawingNode(id: string, points: Array<{ x: number; y: number }>, tool: 'pencil' | 'pen' | 'arrow'): ArtifactNode {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y))
  return { ...createNode(tool === 'arrow' ? 'line' : 'drawing', id), x, y,
    width: Math.max(1, Math.max(...points.map(p => p.x)) - x), height: Math.max(1, Math.max(...points.map(p => p.y)) - y),
    points: points.map(p => ({ x: p.x - x, y: p.y - y })), lineEnd: tool === 'arrow' ? 'arrow' : 'none',
    style: { stroke: '#141413', strokeWidth: tool === 'pencil' ? 2 : 3 },
  }
}
export const SLIDE_LAYOUTS = [
  { id: 'blank', title: '空白' }, { id: 'title', title: '标题' }, { id: 'title-body', title: '标题与正文' },
  { id: 'two-columns', title: '两栏' }, { id: 'quote', title: '引言' },
] as const
export function layoutSlide(layout: string, page: ArtifactPage, nextId: () => string): ArtifactNode[] {
  const text = (value: string, x: number, y: number, width: number, height: number, size: number): ArtifactNode => ({ ...createNode('text', nextId()), text: value, x, y, width, height, style: { themeColor: 'text', themeFont: 'font.sans', fontSize: size } })
  const { width: w, height: h } = page
  if (layout === 'blank') return []
  if (layout === 'title') return [text('添加标题', w * .08, h * .35, w * .84, h * .3, 72)]
  if (layout === 'quote') return [text('“在这里写下引言。”', w * .12, h * .3, w * .76, h * .4, 48)]
  const nodes = [text('添加标题', w * .08, h * .1, w * .84, h * .16, 56)]
  if (layout === 'two-columns') nodes.push(text('添加正文', w * .08, h * .35, w * .38, h * .5, 28), text('添加正文', w * .54, h * .35, w * .38, h * .5, 28))
  else nodes.push(text('添加正文', w * .08, h * .35, w * .84, h * .5, 32))
  return nodes
}
