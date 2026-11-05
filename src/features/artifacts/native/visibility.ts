import type { ArtifactNode, ArtifactPage } from '../../../../shared/artifact-document'
import type { Bounds } from './compute-protocol'

type Matrix = [number, number, number, number, number, number]
const identity: Matrix = [1, 0, 0, 1, 0, 0]
function multiply(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
}
/** Compact page-local rectangles; document payloads never enter the spatial worker. */
export function elementBounds(page: ArtifactPage): Bounds[] {
  const matrices = new Map<string, Matrix>()
  const matrix = (node: ArtifactNode): Matrix => {
    const cached = matrices.get(node.id); if (cached) return cached
    const angle = node.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
    const fx=node.flipX?-1:1,fy=node.flipY?-1:1
    const local: Matrix = [c*fx, s*fx, -s*fy, c*fy, node.x + node.width/2 - c*fx*node.width/2 + s*fy*node.height/2, node.y + node.height/2 - s*fx*node.width/2 - c*fy*node.height/2]
    const parent = node.parentId ? page.nodes[node.parentId] : undefined
    const result = multiply(parent ? matrix(parent) : identity, local)
    matrices.set(node.id, result); return result
  }
  return page.nodeOrder.flatMap(id => {
    const node = page.nodes[id]; if (!node || node.hidden) return []
    const m = matrix(node)
    const points = [[0,0], [node.width,0], [node.width,node.height], [0,node.height]].map(([x,y]) => ({ x: m[0]*x+m[2]*y+m[4], y: m[1]*x+m[3]*y+m[5] }))
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y)), padding = Math.max(2, node.style.strokeWidth ?? 0, node.style.shadow ? node.style.shadow.blur + Math.abs(node.style.shadow.spread) + Math.max(Math.abs(node.style.shadow.x), Math.abs(node.style.shadow.y)) : 0)
    return [{ id, x: x-padding, y: y-padding, width: Math.max(...points.map(p => p.x))-x+2*padding, height: Math.max(...points.map(p => p.y))-y+2*padding }]
  })
}

/** A visible child needs its group chain. Flex/grid siblings remain mounted together
 * because removing a sibling changes layout; flow groups also remain measurable. */
export function expandVisibleNodes(page: ArtifactPage, visible: readonly string[], retained: readonly string[] = []): Set<string> {
  const result = new Set([...visible, ...retained])
  if (page.sizing === 'flow') for (const id of page.nodeOrder) {
    const node = page.nodes[id]
    if (node.type === 'group' && node.layout && node.layout.mode !== 'absolute') result.add(id)
  }
  for (const id of result) {
    let parentId = page.nodes[id]?.parentId
    while (parentId && !result.has(parentId)) { result.add(parentId); parentId = page.nodes[parentId]?.parentId }
  }
  const complete = new Set<string>(retained.filter(id => page.nodes[id]?.type === 'group'))
  for (const id of result) { const node = page.nodes[id]; if (node?.type === 'group' && node.layout && node.layout.mode !== 'absolute') complete.add(id) }
  for (let changed = true; changed;) {
    changed = false
    for (const id of page.nodeOrder) { const node = page.nodes[id]; if (node.parentId && complete.has(node.parentId) && !complete.has(id)) { result.add(id); complete.add(id); changed = true } }
  }
  return result
}
