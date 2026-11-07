import type {ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

export const textAlignmentLabels={left:'文本左对齐',center:'文本居中',right:'文本右对齐',justify:'文本两端对齐'} as const
export type TextAlignment=keyof typeof textAlignmentLabels
export function elementTextAlignmentValue(node:ArtifactNode,page:ArtifactPage):TextAlignment|null{
 let cursor:ArtifactNode|undefined=node
 while(cursor){
  const value=(cursor.css?.['text-align']??cursor.style.textAlign)?.replace(/\s*!important\s*$/i,'').trim()
  if(value&&value!=='inherit'&&value!=='unset')return Object.hasOwn(textAlignmentLabels,value)?value as TextAlignment:null
  cursor=cursor.parentId?page.nodes[cursor.parentId]:undefined
 }
 return 'left'
}
export function elementTextAlignmentPatch(node:ArtifactNode,page:ArtifactPage,value:TextAlignment|null){
 const before=nodeCodeEntries(node,page),values=new Map(before.map(entry=>[entry.name,entry.value]));if(value===null)values.delete('text-align');else values.set('text-align',value)
 return nodeCodePatch(node,before,[...values].map(([name,value])=>({name,value})))
}
