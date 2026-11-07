import type {ArtifactNode,ArtifactRichText} from './artifact-document.js'
import {isSafeArtifactLink} from './artifact-links.js'
import {isNativeCodeAttribute} from './artifact-node-code.js'

/** A null value represents text containing more than one link destination. */
export function elementLink(node:ArtifactNode):string|null {
  if(node.attributes?.href)return node.attributes.href
  const values=new Set<string>()
  const visit=(value:ArtifactRichText)=>{
    if(value.type==='text')values.add(value.marks?.find(mark=>mark.type==='link')?.attrs?.href??'')
    value.content?.forEach(visit)
  }
  if(node.richText)visit(node.richText)
  return values.size>1?null:[...values][0]??''
}

/** Keep inline formatting, paragraph structure and authored link targets. */
export function elementLinkPatch(node:ArtifactNode,href:string):{patch:Partial<ArtifactNode>;unset:string[]} {
  if(href&&!isSafeArtifactLink(href))throw new Error('链接格式无效，请使用网址、邮件、电话或文档内地址。')
  const patch:Partial<ArtifactNode>={},unset:string[]=[]
  if(node.attributes?.href!==undefined||!['text','note'].includes(node.type)){
    if(href&&!isNativeCodeAttribute('href',href))throw new Error('链接格式无效，请使用网址、邮件、电话或文档内地址。')
    const attributes={...node.attributes}
    if(href)attributes.href=href;else delete attributes.href
    if(JSON.stringify(attributes)!==JSON.stringify(node.attributes??{})){
      if(Object.keys(attributes).length)patch.attributes=attributes;else unset.push('attributes')
    }
  }else{
    const before=node.richText??{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:node.text??''}]}]} as ArtifactRichText
    const visit=(value:ArtifactRichText):ArtifactRichText=>{
      if(value.type!=='text')return{...value,...(value.content?{content:value.content.map(visit)}:{})}
      const old=value.marks?.find(mark=>mark.type==='link'),marks=(value.marks??[]).filter(mark=>mark.type!=='link')
      if(href)marks.push({type:'link',attrs:{href,...(old?.attrs?.target?{target:old.attrs.target}:{})}})
      const result={...value}
      if(marks.length)result.marks=marks;else delete result.marks
      return result
    }
    const next=visit(before)
    if(JSON.stringify(next)!==JSON.stringify(before))patch.richText=next
  }
  return{patch,unset}
}
