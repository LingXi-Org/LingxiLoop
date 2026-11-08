import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

export const layoutLabels={padding:'内边距','padding-top':'上内边距','padding-right':'右内边距','padding-bottom':'下内边距','padding-left':'左内边距',margin:'外边距','margin-top':'上外边距','margin-right':'右外边距','margin-bottom':'下外边距','margin-left':'左外边距'} as const
export type ElementLayoutProperty=keyof typeof layoutLabels
export type ElementLayoutChanges=Partial<Record<ElementLayoutProperty,string|null>>
export const boxSides=['top','right','bottom','left'] as const
export function elementLayoutLength(property:string,raw:string|null|undefined){
 const text=raw?.trim();return text&&/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(text)?(property.startsWith('padding')?Math.max(0,Number(text)):Number(text))+'px':text
}
export function elementLayoutPatch(node:ArtifactNode,page:ArtifactPage,changes:ElementLayoutChanges){
  const before=nodeCodeEntries(node,page),values=new Map(before.map(entry=>[entry.name,entry.value]))
  for(const [property,raw]of Object.entries(changes)){
    if(property==='padding'||property==='margin')for(const side of boxSides)values.delete(`${property}-${side}`)
    const value=elementLayoutLength(property,raw)
    if(value)values.set(property,value);else values.delete(property)
  }
  if(Object.entries(changes).some(([property,value])=>property.startsWith('padding')&&value?.trim())&&!values.has('box-sizing'))values.set('box-sizing','content-box')
  const result=nodeCodePatch(node,page,before,[...values].map(([name,value])=>({name,value})))
  if(Object.hasOwn(changes,'padding'))for(const field of ['paddingX','paddingY'] as const)if(node.style[field]!==undefined)result.unset.push(`style.${field}`)
  return{patch:result.patch,unset:[...new Set(result.unset)]}
}
