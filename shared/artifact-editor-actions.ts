import type {PenGeometry} from './artifact-pen.js'
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
  const minimum=nodes.every(node=>!!node.path)?2:8
  const width = Math.max(minimum, b.width + (handle.includes('w') ? -dx : handle.includes('e') ? dx : 0))
  const height = Math.max(minimum, b.height + (handle.includes('n') ? -dy : handle.includes('s') ? dy : 0))
  const x = handle.includes('w') ? b.x + b.width - width : b.x, y = handle.includes('n') ? b.y + b.height - height : b.y
  const sx = width / Math.max(1, b.width), sy = height / Math.max(1, b.height)
  return nodes.map(n => ({ ...n, x: x + (n.x - b.x) * sx, y: y + (n.y - b.y) * sy, width: Math.max(1, n.width * sx), height: Math.max(1, n.height * sy), ...(n.points ? {points:n.points.map(p=>({x:p.x*sx,y:p.y*sy}))} : {}) }))
}
export function ungroupNodes(group: ArtifactNode, children: ArtifactNode[]): ArtifactNode[] {
  const angle=group.rotation*Math.PI/180, mirrored=!!group.flipX!==!!group.flipY
  return children.map(node=>{
    const x=(node.x+node.width/2-group.width/2)*(group.flipX?-1:1),y=(node.y+node.height/2-group.height/2)*(group.flipY?-1:1)
    return {...node,parentId:group.parentId,x:group.x+group.width/2+Math.cos(angle)*x-Math.sin(angle)*y-node.width/2,y:group.y+group.height/2+Math.sin(angle)*x+Math.cos(angle)*y-node.height/2,rotation:group.rotation+(mirrored?-node.rotation:node.rotation),flipX:!!group.flipX!==!!node.flipX,flipY:!!group.flipY!==!!node.flipY,...(group.scope==='canvas'?{scope:'canvas' as const}:{})}
  })
}
export function appendDrawingPoint(points: Array<{x:number;y:number}>, point: {x:number;y:number}) {
  return [...(points.length>=1999?points.filter((_,index)=>index%2===0):points),point]
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
    page.nodes = Object.fromEntries(page.nodeOrder.map(id => { const n = page.nodes[id]!; return [mapping.get(id)!, { ...n, id: mapping.get(id)!, ...(document.kind==='slides'?{motionId:n.motionId??n.id}:{}), parentId: n.parentId ? mapping.get(n.parentId) ?? null : null }] }))
    page.nodeOrder = page.nodeOrder.map(id => mapping.get(id)!)
    ops.push({ type: 'page.insert', page, index: document.pageOrder.indexOf(sourceId) + ++inserted })
  }
  return ops
}
/** Object copies have new identities; only whole-slide duplication pairs motion. */
export function duplicateNodes(nodes: ArtifactNode[], nextId: () => string): ArtifactNode[] {
  const mapping = new Map(nodes.map(node => [node.id, nextId()]))
  return nodes.map(node => {
    const copy = structuredClone(node)
    delete copy.motionId
    const nested = !!node.parentId && mapping.has(node.parentId)
    return {...copy,id:mapping.get(node.id)!,x:node.x+(nested?0:24),y:node.y+(nested?0:24),parentId:node.parentId?mapping.get(node.parentId)??null:null}
  })
}
/** Source Design rectangles and ellipses use world-space drag bounds, or a default size on click. */
export function canvasShapeNode(id:string,shape:'rect'|'ellipse',start:{x:number;y:number},end?:{x:number;y:number}):ArtifactNode {
  const size=shape==='ellipse'?96:120
  const x=Math.round(end?Math.min(start.x,end.x):start.x),y=Math.round(end?Math.min(start.y,end.y):start.y)
  return {...createNode('shape',id),shape,x,y,width:end?Math.max(2,Math.round(Math.abs(end.x-start.x))):size,height:end?Math.max(2,Math.round(Math.abs(end.y-start.y))):size,style:{fill:'#b6b0a7',borderRadius:shape==='rect'?8:0}}
}
export function drawingNode(id: string, points: Array<{ x: number; y: number }>, tool: 'pencil' | 'pen' | 'arrow' | 'line'): ArtifactNode {
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y))
  return { ...createNode(tool === 'arrow' || tool === 'line' ? 'line' : 'drawing', id), x, y,
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

/** Free canvas sampling stays in screen pixels and retains at most 3000 points. */
export function appendCanvasPenPoint(points:Array<{x:number;y:number}>,point:{x:number;y:number},scale:number){
  const last=points.at(-1)
  if(last&&((point.x-last.x)*scale)**2+((point.y-last.y)*scale)**2<4)return points
  const next=[...points,point]
  return next.length>3000?next.filter((_,index)=>index%2===0):next
}
export function canvasPenNode(id:string,geometry:PenGeometry|null):ArtifactNode|null {
  return geometry?{...createNode('drawing',id),x:geometry.x,y:geometry.y,width:geometry.w,height:geometry.h,path:{d:geometry.d,width:geometry.w,height:geometry.h},style:{stroke:'#8a8378',strokeWidth:2}}:null
}
