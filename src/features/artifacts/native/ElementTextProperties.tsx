import {useState,type ReactNode} from 'react'
import {RadioGroup} from '@base-ui/react/radio-group'
import {Radio} from '@base-ui/react/radio'
import {List,ListOrdered,Ban,Underline,Strikethrough} from 'lucide-react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {IconButton,Menu,MenuItem} from './EditorPrimitives'
import {textCaseLabels,textPropertyPatch,textDecorationLine,textListKind,textListPatch,type TextListKind} from './element-text-properties'
import './element-text-properties.css'

type Extra='emphasis'|'list'|'case'
const labels={emphasis:'强调',list:'列表',case:'大小写'} as const
const listLabels={none:'无列表',bullet:'项目符号列表',number:'编号列表'} as const
const listIcons={none:Ban,bullet:List,number:ListOrdered}
interface Props{
 node:ArtifactNode;page?:ArtifactPage;enabled:boolean;writable:boolean;children:ReactNode;alignment:ReactNode
 getBase():ArtifactDocument|null
 commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
 onNotice(message:string):void
}
export default function ElementTextProperties({node,page,enabled,writable,children,alignment,getBase,commit,onNotice}:Props){
 const [shown,setShown]=useState<Extra[]>([]),disabled=!writable||!!node.locked
 const decoration=textDecorationLine(node),list=textListKind(node)
 const caseValue=(node.css?.['text-transform']??'none').replace(/\s*!important\s*$/i,'').trim()
 const caseLabel=Object.hasOwn(textCaseLabels,caseValue)?textCaseLabels[caseValue as keyof typeof textCaseLabels]:'自定义'
 const visible=(key:Extra)=>shown.includes(key)||(key==='emphasis'?node.css?.['font-style']!==undefined||node.style.fontStyle!==undefined||node.css?.['text-decoration']!==undefined||node.css?.['text-decoration-line']!==undefined||node.style.textDecoration!==undefined:key==='list'?list!=='none':node.css?.['text-transform']!==undefined)
 const change=(changes:Record<string,string|null>|TextListKind)=>{
  const base=getBase(),owner=page&&base?.pages[page.id],current=owner?.nodes[node.id]
  if(!page||!base||!owner||!current||!writable||current.locked)return false
  try{
   const result=typeof changes==='string'?{patch:textListPatch(current,changes),unset:[]}:textPropertyPatch(current,owner,changes)
   if(!Object.keys(result.patch).length&&!result.unset.length)return true
   return commit([{type:'node.patch',pageId:page.id,nodeId:node.id,...result}],base,['css','style.fontStyle','style.textDecoration','richText'].map(field=>artifactVersionKey.node(page.id,node.id,`field/${field}`)))
  }catch{onNotice('文本属性未能修改，请重试。');return false}
 }
 const remove=(key:Extra)=>{
  const applied=key==='list'?change('none'):change(key==='case'?{'text-transform':null}:{'font-style':null,'text-decoration-line':null,'text-decoration':null})
  if(applied)setShown(items=>items.filter(item=>item!==key))
 }
 const label=(key:Extra)=><span>{labels[key]}<IconButton icon="line" label={`移除${labels[key]}属性`} disabled={disabled} onClick={()=>remove(key)}/></span>
 const toggleDecoration=(value:'underline'|'line-through')=>{
  const values=new Set(decoration.replace(/\s*!important\s*$/i,'').split(/\s+/).filter(token=>token!=='none'))
  if(values.has(value))values.delete(value);else values.add(value)
  change({'text-decoration-line':[...values].join(' ')||'none'})
 }
 if(!enabled)return <section className="native-property-section"><h3>文本</h3>{children}{alignment}</section>
 return <section className="native-property-section native-element-text-properties">
  <header><h3>文本</h3><Menu triggerRole="button" label="添加文本属性" icon="plus" disabled={disabled} popupRole="menu" minimumWidth={184}>{(Object.keys(labels) as Extra[]).filter(key=>!visible(key)).map(key=><MenuItem role="menuitem" key={key} onClick={()=>setShown(items=>[...items,key])}>{labels[key]}</MenuItem>)}</Menu></header>
  <div className="native-element-text-body">{children}
   {visible('emphasis')&&<div className="native-text-extra-row">{label('emphasis')}<div className="native-text-emphasis">{([{value:'underline',label:'下划线',Icon:Underline},{value:'line-through',label:'删除线',Icon:Strikethrough}]as const).map(({value,label,Icon})=><button type="button" key={value} aria-label={label} title={label} disabled={disabled} aria-pressed={decoration.includes(value)} onClick={()=>toggleDecoration(value)}><Icon size={16} strokeWidth={1.5} aria-hidden="true"/></button>)}</div></div>}
   {alignment}
   {visible('list')&&<div className="native-text-extra-row">{label('list')}<RadioGroup aria-label="列表" value={list} disabled={disabled} onValueChange={value=>change(value as TextListKind)}>{(Object.keys(listLabels) as TextListKind[]).map(value=>{const Icon=listIcons[value];return <Radio.Root key={value} render={<span/>} value={value} aria-label={listLabels[value]} title={listLabels[value]}><Icon size={16} strokeWidth={1.5} aria-hidden="true"/></Radio.Root>})}</RadioGroup></div>}
   {visible('case')&&<div className="native-text-extra-row">{label('case')}<Menu triggerRole="button" label={`大小写：${caseLabel}`} text={caseLabel} disabled={disabled} popupRole="menu" minimumWidth={184}>{Object.entries(textCaseLabels).map(([value,label])=><MenuItem role="menuitemradio" key={value} selected={caseValue===value} aria-checked={caseValue===value} onClick={()=>change({'text-transform':value})}>{label}</MenuItem>)}</Menu></div>}
  </div>
 </section>
}
