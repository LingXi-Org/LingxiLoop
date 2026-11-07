import {useMemo,useState} from 'react'
import {Scan} from 'lucide-react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {nodeCodeEntries} from './inspector-code-edit'
import {boxSides,elementLayoutPatch,elementLayoutLength,layoutLabels,type ElementLayoutProperty,type ElementLayoutChanges} from './element-layout'
import ElementLengthInput from './ElementLengthInput'
import {IconButton} from './EditorPrimitives'

interface Props{
 node:ArtifactNode;page:ArtifactPage;writable:boolean
 getBase():ArtifactDocument|null
 commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
 retain(operations:ArtifactOperation[]):void
 onHistory(direction:'undo'|'redo'):void
 onNotice(message:string):void
}
export default function ElementLayoutProperties({node,page,writable,getBase,commit,retain,onHistory,onNotice}:Props){
 const [expanded,setExpanded]=useState({padding:false,margin:false})
 const declarations=useMemo(()=>nodeCodeEntries(node,page).filter(entry=>/^(padding|margin)(-|$)/.test(entry.name)),[node,page])
 const values=useMemo(()=>{
  const style=document.createElement('div').style
  for(const {name,value}of declarations)style.setProperty(name,value.replace(/\s*!important\s*$/i,''),/!important\s*$/i.test(value)?'important':'')
  return Object.fromEntries((['padding','margin'] as const).map(property=>{const sides=boxSides.map(side=>style.getPropertyValue(`${property}-${side}`)||'0px');return[property,{sides,value:sides.every(value=>value===sides[0])?sides[0]:''}]})) as Record<'padding'|'margin',{sides:string[];value:string}>
 },[declarations])
 const apply=(changes:ElementLayoutChanges,base=getBase())=>{
  const owner=base?.pages[page.id],original=owner?.nodes[node.id];if(!base||!owner||!original)return
  if(!writable||getBase()?.pages[page.id]?.nodes[node.id]?.locked){retainChanges(changes,base);return}
  for(const [property,raw]of Object.entries(changes))if(raw?.trim()){
   const value=elementLayoutLength(property,raw)!.replace(/\s*!important\s*$/i,'')
   if(!CSS.supports(property,value))throw new Error('边距格式无效，请输入有效的样式长度。')
  }
  const {patch,unset}=elementLayoutPatch(original,owner,changes);if(!Object.keys(patch).length&&!unset.length)return
  commit([{type:'node.patch',pageId:page.id,nodeId:node.id,patch,...(unset.length?{unset}:{})}],base,['css','locked','style.padding','style.paddingX','style.paddingY'].map(field=>artifactVersionKey.node(page.id,node.id,`field/${field}`)))
 }
 const retainChanges=(changes:ElementLayoutChanges,base:ArtifactDocument)=>{
  const original=base.pages[page.id]?.nodes[node.id];if(!original)return
  retain([{type:'node.patch',pageId:page.id,nodeId:node.id,patch:{css:{...original.css,...Object.fromEntries(Object.entries(changes).map(([name,value])=>[name,value??'']))}}}])
 }
 const input=(property:ElementLayoutProperty,value:string)=> <ElementLengthInput key={property} property={property} label={layoutLabels[property]} value={value.replace(/px$/,'')} placeholder={value?'':'混合'} numeric showUnit={property==='padding'||property==='margin'} writable={writable&&!node.locked} getBase={getBase} apply={apply} retain={retainChanges} onHistory={onHistory}/>
 return <section className="native-property-section native-element-link native-element-sizing native-element-layout"><header><h3>布局</h3></header>{(['padding','margin'] as const).map(property=> <div key={property} className="native-layout-box">
  <div className="native-sizing-row"><span className="native-sizing-label">{layoutLabels[property]}{declarations.some(entry=>entry.name===property||entry.name.startsWith(property+'-'))&&<IconButton icon="undo" label={`还原${layoutLabels[property]}`} disabled={!writable||node.locked} onClick={()=>{try{apply({[property]:null})}catch{onNotice('边距修改未能应用，请重试。')}}}/>}</span>{input(property,values[property].value)}<button className="native-layout-expand" type="button" aria-label={`${expanded[property]?'收起':'分别设置'}${layoutLabels[property]}`} aria-expanded={expanded[property]} title={`${expanded[property]?'收起':'分别设置'}${layoutLabels[property]}`} onClick={()=>setExpanded(current=>({...current,[property]:!current[property]}))}><Scan size={16} strokeWidth={1.5} aria-hidden="true"/></button></div>
  {expanded[property]&&<div className="native-layout-sides">{boxSides.map((side,index)=><label key={side}><span aria-hidden="true">{['上','右','下','左'][index]}</span>{input(`${property}-${side}`,values[property].sides[index])}</label>)}</div>}
 </div>)}</section>
}
