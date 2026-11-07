import {useLayoutEffect,useState,type RefObject} from 'react'
import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {readNodeFrame,layoutPosition} from './rendered-geometry'

/** CSS may position an authored box differently; editing starts at its painted frame. */
export function useCodeSelection(page:ArtifactPage|undefined,ids:string[],root:RefObject<HTMLElement|null>,scale:number):ArtifactNode[]{
  const [frames,setFrames]=useState<Record<string,{source:ArtifactNode;x:number;y:number;width:number;height:number}>>({})
  useLayoutEffect(()=>{
    const measured:typeof frames={}
    for(const id of ids){
      const node=page?.nodes[id]
      if(!page||!node?.css)continue
      const frame=readNodeFrame(root.current,page,node,scale),parent=node.parentId?page.nodes[node.parentId]:undefined
      const parentFrame=parent?readNodeFrame(root.current,page,parent,scale):{matrix:[1,0,0,1,0,0] as [number,number,number,number,number,number],width:page.width,height:page.height}
      const position=layoutPosition(node,frame,parentFrame)
      const clean=(value:number)=>Math.abs(value-Math.round(value))<.0001?Math.round(value):value
      measured[id]={source:node,x:clean(position.x),y:clean(position.y),width:clean(frame.width),height:clean(frame.height)}
    }
    setFrames(previous=>Object.keys(previous).length===Object.keys(measured).length&&Object.entries(measured).every(([id,value])=>{const old=previous[id];return old?.source===value.source&&(['x','y','width','height'] as const).every(key=>Math.abs(old[key]-value[key])<.00001)})?previous:measured)
  },[page,ids,root,scale])
  return page?ids.flatMap(id=>{const node=page.nodes[id],frame=frames[id];return node?[frame?.source===node?{...node,x:frame.x,y:frame.y,width:frame.width,height:frame.height}:node]:[]}):[]
}
