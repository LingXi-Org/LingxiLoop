import {useLayoutEffect,useRef,useState} from 'react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {FontField} from './FontField'
import ElementFontVariantField from './ElementFontVariantField'
import {elementFontFamilyPatch} from './element-font-properties'
import {elementFontWeightText,parseElementFontWeight} from './element-font-variant'
import {elementFontSelectionFamilyChoice,elementFontSelectionVariantPatch,elementFontSelectionVariantValue,mergeElementFontStates} from './element-font-selection'
import {textPropertyPatch} from './element-text-properties'

interface Props{
 doc:ArtifactDocument;page:ArtifactPage;nodeIds:readonly string[];families:readonly string[];writable:boolean
 getBase():ArtifactDocument|null
 commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
 retain(operations:ArtifactOperation[]):void
 onNotice(message:string):void
 onHistory(direction:'undo'|'redo'):void
}
export default function ElementFontSelection({doc,page,nodeIds,families,writable,getBase,commit,retain,onNotice,onHistory}:Props){
 const root=useRef<HTMLSpanElement>(null),base=useRef<ArtifactDocument|null>(null)
 const [rendered,setRendered]=useState<Map<string,{family:string;weight:string;style:string}>>(()=>new Map())
 const targets=nodeIds.map(id=>page.nodes[id]).filter((node):node is ArtifactNode=>!!node),disabled=!writable||targets.length!==nodeIds.length||targets.some(node=>node.locked)
 useLayoutEffect(()=>{
  const scope=root.current?.closest('[data-native-artifact-editor]'),next=new Map<string,{family:string;weight:string;style:string}>()
  for(const id of nodeIds){const element=scope?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(page.id)}"] [data-node-id="${CSS.escape(id)}"]`);if(element){const css=getComputedStyle(element);next.set(id,{family:css.fontFamily,weight:css.fontWeight,style:css.fontStyle})}}
  setRendered(previous=>previous.size===next.size&&[...next].every(([id,value])=>previous.get(id)?.family===value.family&&previous.get(id)?.weight===value.weight&&previous.get(id)?.style===value.style)?previous:next)
 },[doc,page.id,nodeIds])
 const family=mergeElementFontStates(targets.map(node=>({value:node.css?.['font-family']??node.style.fontFamily??node.style.themeFontFallback,fallback:rendered.get(node.id)?.family})))
 const weight=mergeElementFontStates(targets.map(node=>({value:elementFontWeightText(node),fallback:rendered.get(node.id)?.weight,companionValue:node.css?.['font-style']??node.style.fontStyle,companionFallback:rendered.get(node.id)?.style})))
 // 固定来源先选标题再扩选正文时，空声明仍显示首选标题的字形，菜单不勾选；不将该占位写回文档。
 const variant=elementFontSelectionVariantValue({...weight,fallback:weight.fallback??(!weight.mixed?rendered.get(targets[0]?.id??'')?.weight:undefined)})
 const displayedFamily=nodeIds.length===1?rendered.get(nodeIds[0])?.family??family.value??family.fallback:family.value??family.fallback
 const begin=()=>{base.current=getBase()}
 const apply=(patch:(node:ArtifactNode,page:ArtifactPage)=>ReturnType<typeof textPropertyPatch>,fields:readonly string[],captured=base.current)=>{
  const latest=getBase()?.pages[page.id];if(!captured||!latest)return
  const operations:ArtifactOperation[]=nodeIds.flatMap(id=>{const node=latest.nodes[id];if(!node)return[];const result=patch(node,latest);return Object.keys(result.patch).length||result.unset.length?[{type:'node.patch' as const,pageId:page.id,nodeId:id,...result}]:[]})
  if(!writable||nodeIds.some(id=>!latest.nodes[id]||latest.nodes[id].locked)){retain(operations);return}
  if(operations.length)commit(operations,captured,nodeIds.flatMap(id=>[...fields,'locked'].map(field=>artifactVersionKey.node(page.id,id,`field/${field}`))))
 }
 const safely=(action:()=>void)=>{try{action()}catch{onNotice('字体未能修改，请检查样式值后重试。')}}
 const raw=!!weight.value&&parseElementFontWeight(weight.value)===undefined
 return <><span ref={root} hidden/>
  <FontField element mixed={family.mixed} value={displayedFamily} families={families} disabled={disabled} onBegin={begin} onReset={targets.some(node=>node.css?.['font-family']!==undefined||node.style.fontFamily!==undefined||node.style.themeFont!==undefined)?()=>safely(()=>apply((node,page)=>elementFontFamilyPatch(node,page,null),['css','style.fontFamily','style.themeFont','style.themeFontFallback'])):undefined} onChange={font=>safely(()=>apply((node,page)=>elementFontFamilyPatch(node,page,family.mixed?elementFontSelectionFamilyChoice(font):font,family.mixed),['css','style.fontFamily','style.themeFont','style.themeFontFallback']))}/>
  <ElementFontVariantField family={displayedFamily} weight={variant.weight} italic={variant.italic} mixed={weight.mixed||weight.companionMixed} explicit={targets.some(node=>!!elementFontWeightText(node)||node.css?.['font-style']!==undefined||node.style.fontStyle!==undefined)} disabled={disabled} onBegin={begin} onReset={()=>safely(()=>apply((node,page)=>elementFontSelectionVariantPatch(node,page,null,weight),['css','style.fontWeight','style.fontStyle']))} onChange={choice=>safely(()=>apply((node,page)=>elementFontSelectionVariantPatch(node,page,choice,weight),['css','style.fontWeight','style.fontStyle']))} raw={raw?{value:weight.value!,getBase,onHistory,apply:(value,captured)=>apply((node,page)=>textPropertyPatch(node,page,{'font-weight':value}),['css','style.fontWeight'],captured),retain:(value,captured)=>{const oldPage=captured.pages[page.id];if(oldPage)retain(nodeIds.flatMap(id=>{const node=oldPage.nodes[id];return node?[{type:'node.patch' as const,pageId:page.id,nodeId:id,patch:{css:{...node.css,'font-weight':value}}}]:[]}))}}:undefined}/>
 </>
}
