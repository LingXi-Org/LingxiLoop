import type {ArtifactNode,ArtifactPage,ArtifactRichText} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

export const textCaseLabels={none:'无',uppercase:'大写',lowercase:'小写',capitalize:'首字母大写'} as const
export type TextListKind='none'|'bullet'|'number'
export function textPropertyPatch(node:ArtifactNode,page:ArtifactPage,changes:Record<string,string|null>){
 const before=nodeCodeEntries(node,page),values=new Map(before.map(entry=>[entry.name,entry.value]))
 for(const [name,value]of Object.entries(changes))if(value===null)values.delete(name);else values.set(name,value)
 return nodeCodePatch(node,before,[...values].map(([name,value])=>({name,value})))
}
export function textListKind(node:ArtifactNode):TextListKind{
 const blocks=node.richText?.content
 return blocks?.length===1?blocks[0].type==='bulletList'?'bullet':blocks[0].type==='orderedList'?'number':'none':'none'
}
export function textListPatch(node:ArtifactNode,kind:TextListKind):Partial<ArtifactNode>{
 if(kind===textListKind(node))return {}
 let blocks:ArtifactRichText[]=node.richText?.content??(node.text??'').split('\n').map(text=>({type:'paragraph' as const,content:text?[{type:'text' as const,text}]:[]}))
 if(textListKind(node)!=='none')blocks=blocks[0].content?.flatMap(item=>item.content??[])??[]
 const richText:ArtifactRichText={type:'doc',content:kind==='none'?blocks:[{type:kind==='bullet'?'bulletList':'orderedList',content:blocks.map(block=>({type:'listItem',content:[block]}))}]}
 return {richText}
}
