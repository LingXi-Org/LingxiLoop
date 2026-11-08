import {AlignHorizontalJustifyStart,AlignHorizontalJustifyCenter,AlignHorizontalJustifyEnd,AlignVerticalJustifyStart,AlignVerticalJustifyCenter,AlignVerticalJustifyEnd} from 'lucide-react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {elementAlignmentLabels,elementAlignmentPatch,elementAlignmentVertical,type ElementAlignment} from './element-alignment'

const icons={left:AlignHorizontalJustifyStart,center:AlignHorizontalJustifyCenter,right:AlignHorizontalJustifyEnd,top:AlignVerticalJustifyStart,middle:AlignVerticalJustifyCenter,bottom:AlignVerticalJustifyEnd}
interface Props{
  node:ArtifactNode;page:ArtifactPage;writable:boolean
  getBase():ArtifactDocument|null
  commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
  onNotice(message:string):void
}
export default function ElementAlignmentControls({node,page,writable,getBase,commit,onNotice}:Props){
  const align=(direction:ElementAlignment)=>{
    const base=getBase(),owner=base?.pages[page.id],original=owner?.nodes[node.id];if(!base||!owner||!original||!writable||original.locked)return
    try{
      const {patch,unset}=elementAlignmentPatch(original,owner,direction)
      if(!Object.keys(patch).length&&!unset.length)return
      commit([{type:'node.patch',pageId:page.id,nodeId:node.id,patch,...(unset.length?{unset}:{})}],base,['css','x','y'].map(field=>artifactVersionKey.node(page.id,node.id,`field/${field}`)))
    }catch{onNotice('对齐修改未能应用，请重试。')}
  }
  return <div className="native-element-alignment" role="group" aria-label="元素对齐">{(Object.keys(icons) as ElementAlignment[]).map(direction=>{
    const Icon=icons[direction],vertical=['top','middle','bottom'].includes(direction)
    return <button key={direction} type="button" aria-label={elementAlignmentLabels[direction]} title={elementAlignmentLabels[direction]} disabled={!writable||node.locked||vertical&&!elementAlignmentVertical(node,page)} onClick={()=>align(direction)}><Icon size={16} strokeWidth={1.5} aria-hidden="true"/></button>
  })}</div>
}
