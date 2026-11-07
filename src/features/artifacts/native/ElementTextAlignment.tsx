import {RadioGroup} from '@base-ui/react/radio-group'
import {Radio} from '@base-ui/react/radio'
import {AlignLeft,AlignCenter,AlignRight,AlignJustify} from 'lucide-react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {elementTextAlignmentPatch,elementTextAlignmentValue,textAlignmentLabels,type TextAlignment} from './element-text-alignment'
import {IconButton} from './EditorPrimitives'
import './element-text-alignment.css'

const icons={left:AlignLeft,center:AlignCenter,right:AlignRight,justify:AlignJustify}
interface Props{
 node:ArtifactNode;page:ArtifactPage;writable:boolean
 getBase():ArtifactDocument|null
 commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
 onNotice(message:string):void
}
export default function ElementTextAlignment({node,page,writable,getBase,commit,onNotice}:Props){
 const selected=elementTextAlignmentValue(node,page),values=Object.keys(icons)as TextAlignment[]
 const change=(value:unknown)=>{
  if(value!==null&&(typeof value!=='string'||!Object.hasOwn(textAlignmentLabels,value)))return
  const base=getBase(),owner=base?.pages[page.id],current=owner?.nodes[node.id]
  if(!base||!owner||!current||!writable||current.locked)return
  try{
   const {patch,unset}=elementTextAlignmentPatch(current,owner,value as TextAlignment|null)
   if(!Object.keys(patch).length&&!unset.length)return
   commit([{type:'node.patch',pageId:page.id,nodeId:node.id,patch,...(unset.length?{unset}:{})}],base,['css','style.textAlign'].map(field=>artifactVersionKey.node(page.id,node.id,`field/${field}`)))
  }catch{onNotice('文本对齐未能修改，请重试。')}
 }
 return <div className="native-element-text-alignment"><span>对齐{(node.style.textAlign!==undefined||node.css?.['text-align']!==undefined)&&<IconButton icon="undo" label="还原文本对齐" disabled={!writable||node.locked} onClick={()=>change(null)}/>}</span><RadioGroup aria-label="文本对齐" value={selected} disabled={!writable||node.locked} onValueChange={change}>{selected&&<span data-native-alignment-thumb aria-hidden="true" style={{left:`calc(1px + ${values.indexOf(selected)*25}% - ${values.indexOf(selected)/2}px)`}}/>}{values.map(value=>{
  const Icon=icons[value]
  return <Radio.Root key={value} render={<span/>} value={value} aria-label={textAlignmentLabels[value]} title={textAlignmentLabels[value]} onClick={()=>change(value)}><Icon size={16} strokeWidth={1.5} aria-hidden="true"/></Radio.Root>
 })}</RadioGroup></div>
}
