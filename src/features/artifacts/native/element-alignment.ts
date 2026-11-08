import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

export type ElementAlignment='left'|'center'|'right'|'top'|'middle'|'bottom'
export const elementAlignmentLabels={left:'左对齐',center:'水平居中',right:'右对齐',top:'顶部对齐',middle:'垂直居中',bottom:'底部对齐'} satisfies Record<ElementAlignment,string>
export function elementAlignmentVertical(node:ArtifactNode,page:ArtifactPage){
  const position=nodeCodeEntries(node,page).find(entry=>entry.name==='position')?.value
  return position==='absolute'||position==='fixed'
}

/** Keep the source's CSS anchors: centering must survive later size edits. */
export function elementAlignmentPatch(node:ArtifactNode,page:ArtifactPage,direction:ElementAlignment){
  const before=nodeCodeEntries(node,page),values=new Map(before.map(entry=>[entry.name,entry.value])),horizontal=['left','center','right'].includes(direction),pinned=elementAlignmentVertical(node,page)
  if(!horizontal&&!pinned)return{patch:{},unset:[]}
  const start=horizontal?'left':'top',end=horizontal?'right':'bottom',center=direction==='center'||direction==='middle',atStart=direction==='left'||direction==='top'
  const margin=(side:string,value:string)=>{
    const name=`margin-${side}`
    if(value!=='0px'||values.has(name)||values.has('margin'))values.set(name,value)
  }
  if(pinned){
    values.set(start,center||atStart?'0px':'auto');values.set(end,center||!atStart?'0px':'auto')
    margin(start,center?'auto':'0px');margin(end,center?'auto':'0px')
  }else{
    if(values.get('position')==='relative'){values.set('left','0px');values.set('right','auto')}
    margin(start,center||!atStart?'auto':'0px');margin(end,center||atStart?'auto':'0px')
  }
  return nodeCodePatch(node,page,before,[...values].map(([name,value])=>({name,value})))
}
