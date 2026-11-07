import type { ArtifactNode, ArtifactPage } from '../../../../shared/artifact-document'
import type { NativeCommentAnchor } from '../../../../shared/artifact-comment-anchor'
import { inverseVector, nodeMatrix, type ArtifactMatrix } from '../../../../shared/artifact-geometry'
export interface RenderedNodeFrame { matrix: ArtifactMatrix; width: number; height: number }
/** CSS flex/grid owns child offsets. Infer translation from the painted box,
 * retaining the authored linear transform for rotation and mirroring. */
export function readNodeFrame(root: HTMLElement | null, page: ArtifactPage, node: ArtifactNode, scale: number): RenderedNodeFrame {
  const matrix=nodeMatrix(page,node),surface=root?.querySelector<HTMLElement>(`[data-page-id="${page.id}"]`)
  const element=surface?.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`)
  if(!element || !surface || !scale) return {matrix,width:node.width,height:node.height}
  return readElementFrame(surface,element,page,node,scale)
}
/** Preserve fractional CSS boxes when the canvas is magnified. */
export function readElementFrame(surface:HTMLElement,element:HTMLElement,page:ArtifactPage,node:ArtifactNode,scale:number):RenderedNodeFrame {
  const style=getComputedStyle(element),width=Number.parseFloat(style.width)||element.offsetWidth,height=Number.parseFloat(style.height)||element.offsetHeight
  const matrix=nodeMatrix(page,node),rect=element.getBoundingClientRect(),origin=surface.getBoundingClientRect()
  const corners=[[0,0],[width,0],[0,height],[width,height]].map(([x,y])=>({x:matrix[0]*x+matrix[2]*y,y:matrix[1]*x+matrix[3]*y}))
  matrix[4]=(rect.left-origin.left)/scale-Math.min(...corners.map(p=>p.x))
  matrix[5]=(rect.top-origin.top)/scale-Math.min(...corners.map(p=>p.y))
  return{matrix,width,height}
}
/** Flow owns left/top; project its real local position without writing the model. */
export function layoutPosition(node:ArtifactNode,frame:RenderedNodeFrame,parent:RenderedNodeFrame){
  const local=inverseVector(parent.matrix,frame.matrix[4]-parent.matrix[4],frame.matrix[5]-parent.matrix[5]),angle=node.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),fx=node.flipX?-1:1,fy=node.flipY?-1:1
  return{x:local.x-frame.width/2+c*fx*frame.width/2-s*fy*frame.height/2,y:local.y-frame.height/2+s*fx*frame.width/2+c*fy*frame.height/2}
}

export function anchorInFrame(pageId:string,nodeId:string,frame:RenderedNodeFrame,point:{x:number;y:number}):NativeCommentAnchor {
  const local=inverseVector(frame.matrix,point.x-frame.matrix[4],point.y-frame.matrix[5])
  return {pageId,nodeId,x:Math.max(0,Math.min(1,local.x/Math.max(1,frame.width))),y:Math.max(0,Math.min(1,local.y/Math.max(1,frame.height)))}
}
export function pointInFrame(anchor:NativeCommentAnchor,frame:RenderedNodeFrame) {
  const [a,b,c,d,e,f]=frame.matrix,x=anchor.x*frame.width,y=anchor.y*frame.height
  return {x:a*x+c*y+e,y:b*x+d*y+f}
}
