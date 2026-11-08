import {expandTextDecoration} from '../../../../shared/artifact-text-decoration'
import type {ArtifactNode,ArtifactPage,ArtifactRichText} from '../../../../shared/artifact-document'
import {nodeCodeEntries,nodeCodePatch} from './inspector-code-edit'

export const textCaseLabels={none:'无',uppercase:'大写',lowercase:'小写',capitalize:'首字母大写'} as const
export type TextListKind='none'|'bullet'|'number'
export function textPropertyPatch(node:ArtifactNode,page:ArtifactPage,changes:Record<string,string|null>){
 const before=nodeCodeEntries(node,page)
 let values=new Map(before.map(entry=>[entry.name,entry.value]))
 if(Object.hasOwn(changes,'text-decoration-line')&&values.has('text-decoration')){
  const expanded=new Map<string,string>()
  for(const [name,value]of values)for(const [key,part]of Object.entries(name==='text-decoration'?expandTextDecoration(value):{[name]:value}))expanded.set(key,part)
  values=expanded
 }
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
 if(textListKind(node)!=='none'&&kind!=='none')return{richText:{...node.richText!,content:[{...blocks[0],type:kind==='bullet'?'bulletList':'orderedList'}]}}
 if(textListKind(node)!=='none')blocks=blocks[0].content?.flatMap(item=>item.content??[])??[]
 const richText:ArtifactRichText={...node.richText,type:'doc',content:kind==='none'?blocks:[{type:kind==='bullet'?'bulletList':'orderedList',content:blocks.map(block=>({type:'listItem',content:[block]}))}]}
 return {richText}
}

export function textDecorationLine(node:ArtifactNode):string{return(node.css?.['text-decoration-line']??(node.css?.['text-decoration']?expandTextDecoration(node.css['text-decoration'])['text-decoration-line']:node.style.textDecoration)??'none').replace(/\s*!important\s*$/i,'')}
