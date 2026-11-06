import type {ArtifactDocument,ArtifactNode} from '../../../../shared/artifact-document'
import {artifactVersionKey} from '../../../../shared/artifact-operations'
import {inverseVector} from '../../../../shared/artifact-geometry'
import {mapEditableVector,normalizeEditableVector,type EditableVector} from '../../../../shared/artifact-vector-edit'
import type {RenderedNodeFrame} from './rendered-geometry'

export type VectorNodePatch=Pick<ArtifactNode,'x'|'y'|'width'|'height'|'path'>
/** Point coordinates also read transforms that their patch does not write. */
export function vectorReadKeys(document:ArtifactDocument,pageId:string,nodeId:string):string[]{
  const page=document.pages[pageId],node=page?.nodes[nodeId]
  if(!node)return []
  const keys=new Set(['rotation','flipX','flipY','parentId'].map(field=>artifactVersionKey.node(pageId,nodeId,`field/${field}`)))
  let parent=node.parentId?page.nodes[node.parentId]:undefined
  while(parent){
    keys.add(artifactVersionKey.node(pageId,parent.id,'exists'))
    for(const field of ['x','y','width','height','rotation','flipX','flipY','parentId','layout'])keys.add(artifactVersionKey.node(pageId,parent.id,`field/${field}`))
    if(parent.layout?.mode==='flex'||parent.layout?.mode==='grid')keys.add(artifactVersionKey.page(pageId))
    parent=parent.parentId?page.nodes[parent.parentId]:undefined
  }
  return [...keys]
}
/** Normalize in the node's unrotated parent coordinates, preserving its own
 * rotation/mirroring and its ancestors' transforms. No style fields change. */
export function vectorNodePatch(path:EditableVector,node:ArtifactNode,frame:RenderedNodeFrame):VectorNodePatch|null {
  const local=mapEditableVector(path,p=>{const v=inverseVector(frame.matrix,p.x-frame.matrix[4],p.y-frame.matrix[5]);return{x:node.x+v.x,y:node.y+v.y}})
  const geometry=normalizeEditableVector(local)
  if(!geometry)return null
  const angle=node.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),fx=node.flipX?-1:1,fy=node.flipY?-1:1
  const dx=geometry.x+geometry.w/2-node.x-frame.width/2,dy=geometry.y+geometry.h/2-node.y-frame.height/2
  const stable=(value:number)=>Number(value.toFixed(9))
  return{x:stable(node.x+frame.width/2+c*fx*dx-s*fy*dy-geometry.w/2),y:stable(node.y+frame.height/2+s*fx*dx+c*fy*dy-geometry.h/2),width:geometry.w,height:geometry.h,path:{d:geometry.d,width:geometry.w,height:geometry.h}}
}
