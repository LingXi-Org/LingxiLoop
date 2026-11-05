import type { ArtifactNode, ArtifactPage } from '../../../../shared/artifact-document'
import type { NativeCommentAnchor } from '../../../../shared/artifact-comment-anchor'
import { inverseVector, nodeMatrix, type ArtifactMatrix } from '../../../../shared/artifact-geometry'
export interface RenderedNodeFrame { matrix: ArtifactMatrix; width: number; height: number }
/** CSS flex/grid owns child offsets. Infer translation from the painted box,
 * retaining the authored linear transform for rotation and mirroring. */
export function readNodeFrame(root: HTMLElement | null, page: ArtifactPage, node: ArtifactNode, scale: number): RenderedNodeFrame {
  const matrix=nodeMatrix(page,node),surface=root?.querySelector<HTMLElement>(`[data-artboard-id="${page.id}"]`)
  const element=surface?.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`)
  if(!element || !surface || !scale) return {matrix,width:node.width,height:node.height}
  const rect=element.getBoundingClientRect(),origin=surface.getBoundingClientRect(),width=element.offsetWidth,height=element.offsetHeight
  const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>({x:matrix[0]*x+matrix[2]*y,y:matrix[1]*x+matrix[3]*y}))
  matrix[4]=(rect.left-origin.left)/scale-Math.min(...corners.map(p=>p.x))
  matrix[5]=(rect.top-origin.top)/scale-Math.min(...corners.map(p=>p.y))
  return {matrix,width,height}
}
export function anchorInFrame(pageId:string,nodeId:string,frame:RenderedNodeFrame,point:{x:number;y:number}):NativeCommentAnchor {
  const local=inverseVector(frame.matrix,point.x-frame.matrix[4],point.y-frame.matrix[5])
  return {pageId,nodeId,x:Math.max(0,Math.min(1,local.x/Math.max(1,frame.width))),y:Math.max(0,Math.min(1,local.y/Math.max(1,frame.height)))}
}
export function pointInFrame(anchor:NativeCommentAnchor,frame:RenderedNodeFrame) {
  const [a,b,c,d,e,f]=frame.matrix,x=anchor.x*frame.width,y=anchor.y*frame.height
  return {x:a*x+c*y+e,y:b*x+d*y+f}
}
