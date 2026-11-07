import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

export const sizingLabels={width:'宽度',height:'高度',position:'位置',left:'水平偏移',top:'垂直偏移','min-width':'最小宽度','max-width':'最大宽度','min-height':'最小高度','max-height':'最大高度',right:'右侧',bottom:'底部'} as const
export type SizingProperty=keyof typeof sizingLabels
export function elementSizingValue(node:ArtifactNode,page:ArtifactPage,property:SizingProperty):string {
  return nodeCodeEntries(node,page).find(entry=>entry.name===property)?.value??''
}
export function elementSizingPatch(node:ArtifactNode,page:ArtifactPage,changes:Partial<Record<SizingProperty,string|null>>) {
  const before=nodeCodeEntries(node,page),values=new Map(before.map(entry=>[entry.name,entry.value]))
  for(const [property,raw]of Object.entries(changes)){
    if(raw&&raw.trim()==='')continue
    let value=raw?.trim()??''
    if(!value&&['width','height','left','top'].includes(property))value='auto'
    if(property!=='position'&&/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value))value=Number(value)+'px'
    if(value)values.set(property,value);else values.delete(property)
    if(property==='position'&&value==='static'){
      values.set('left','auto');values.set('top','auto')
      for(const side of ['right','bottom'])values.delete(side)
    }
  }
  const result=nodeCodePatch(node,before,[...values].map(([name,value])=>({name,value})))
  for(const [axis,flag]of [['width','implicitWidth'],['height','implicitHeight']] as const){
    if(!Object.hasOwn(changes,axis))continue
    const value=changes[axis];if(value&&value.trim()==='')continue
    if(!value){result.patch[flag]=true;result.unset=result.unset.filter(field=>field!==flag)}
  }
  for(const key of Object.keys(result.patch) as Array<keyof ArtifactNode>)if(JSON.stringify(result.patch[key])===JSON.stringify(node[key]))delete result.patch[key]
  result.unset=result.unset.filter(key=>!Object.hasOwn(result.patch,key)&&Object.hasOwn(node,key))
  return result
}
