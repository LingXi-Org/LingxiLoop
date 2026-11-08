import {useEffect,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react'
import type {ArtifactDocument,ArtifactNode,ArtifactPage} from '../../../../shared/artifact-document'
import {authoredTypographySize,documentTypographyUsage,summarizeTypographyUsage,type TypographyCensus} from '../../../../shared/artifact-typography'
import {artifactVersionKey,type ArtifactOperation} from '../../../../shared/artifact-operations'
import {editorFontChoice,editorFontFamily,editorFontKey} from './editor-fonts'
import {EditorIcon,FloatingPopover} from './EditorPrimitives'
import {textPropertyPatch} from './element-text-properties'

interface RenderedTypography{size:number;weight:number;italic:boolean}
interface Props{
 doc:ArtifactDocument;node:ArtifactNode;nodeIds:readonly string[];page:ArtifactPage;loadedPageIds:readonly string[];census?:TypographyCensus;writable:boolean
 getBase():ArtifactDocument|null
 commit(operations:ArtifactOperation[],base:ArtifactDocument,readKeys?:readonly string[]):boolean
 onNotice(message:string):void
}
export default function ElementTextStyle({doc,node,nodeIds,page,loadedPageIds,census,writable,getBase,commit,onNotice}:Props){
 const trigger=useRef<HTMLButtonElement>(null),search=useRef<HTMLInputElement>(null),base=useRef<ArtifactDocument|null>(null),restore=useRef(false),openingKey=useRef<'ArrowDown'|'ArrowUp'|null>(null)
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[rendered,setRendered]=useState<Map<string,RenderedTypography>>(()=>new Map()),targets=nodeIds.map(id=>page.nodes[id]).filter((node):node is ArtifactNode=>!!node),disabled=!writable||targets.some(node=>node.locked),sizes=targets.map(target=>rendered.get(target.id)?.size??authoredTypographySize(target)),mixed=targets.length>1&&(sizes.some(size=>size===undefined)||new Set(sizes).size>1)
 const rows=useMemo(()=>summarizeTypographyUsage(documentTypographyUsage(doc,census,loadedPageIds)),[doc,census,loadedPageIds])
 useLayoutEffect(()=>{
  const scope=trigger.current?.closest('[data-native-artifact-editor]'),wanted=new Set(nodeIds),next=new Map<string,RenderedTypography>()
  for(const element of scope?.querySelectorAll<HTMLElement>(`[data-page-id="${CSS.escape(page.id)}"] .native-node[data-node-id]`)??[]){
   const id=element.dataset.nodeId;if(!id||!wanted.has(id)||next.has(id))continue
   const style=getComputedStyle(element),size=parseFloat(style.fontSize);if(Number.isFinite(size))next.set(id,{size,weight:Number(style.fontWeight)||400,italic:style.fontStyle==='italic'})
  }
  setRendered(previous=>previous.size===next.size&&[...next].every(([id,value])=>{const old=previous.get(id);return old?.size===value.size&&old.weight===value.weight&&old.italic===value.italic})?previous:next)
 },[doc,nodeIds,page.id])
 const primaryMetrics=rendered.get(node.id),size=primaryMetrics?.size??authoredTypographySize(node)??node.style.fontSize??32,family=node.css?.['font-family']??node.style.fontFamily
 const selected=mixed?undefined:rows.find(row=>row.size===size&&(!family||!row.family||editorFontKey(family.split(',')[0]??'')===editorFontKey(row.family)))
 const custom=!mixed&&!selected,choices=[...(custom?[{size,value:'custom' as const,name:'自定义',family:undefined,checked:true,current:true}]:[]),...rows.map(row=>({...row,value:row.size,checked:selected?.size===row.size,current:false}))]
 const label=mixed?'混合':custom?'自定义':selected?.name||editorFontChoice(family)?.label||'自定义'
 const filtered=choices.filter(row=>!query.trim()||!row.current&&`${row.name||editorFontChoice(row.family)?.label||'自定义'}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
 const close=(focus=false)=>{restore.current=focus;setOpen(false);setQuery('')}
 useEffect(()=>{if(disabled)close()},[disabled])
 useEffect(()=>{if(!open&&restore.current){restore.current=false;if(!disabled)trigger.current?.focus()}},[open,disabled])
 const reveal=(key:'ArrowDown'|'ArrowUp'|null=null)=>{openingKey.current=key;base.current=getBase();setQuery('');setOpen(true)}
 const change=(value:number|'custom')=>{
  if(value==='custom'){close(true);return}
  const initial=base.current,currentPage=initial?.pages[page.id],latestPage=getBase()?.pages[page.id]
  if(!initial||!currentPage||!latestPage||disabled||nodeIds.some(id=>!latestPage.nodes[id]||latestPage.nodes[id].locked||!currentPage.nodes[id]))return
  try{
   const operations:ArtifactOperation[]=nodeIds.flatMap(id=>{const result=textPropertyPatch(currentPage.nodes[id],currentPage,{'font-size':`${value}px`});return Object.keys(result.patch).length||result.unset.length?[{type:'node.patch' as const,pageId:page.id,nodeId:id,...result}]:[]})
   if(operations.length)commit(operations,initial,nodeIds.flatMap(id=>['css','style.fontSize','locked'].map(field=>artifactVersionKey.node(page.id,id,`field/${field}`))))
   close(true)
  }catch{onNotice('文本样式未能修改，请重试。')}
 }
 const keyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.nativeEvent.isComposing)return
  if(event.key==='Tab'){event.preventDefault();event.stopPropagation();if(event.shiftKey)close(true);else{const controls=Array.from(trigger.current?.closest('.native-inspector')?.querySelectorAll<HTMLElement>('button,input,select,textarea,summary,[tabindex]')??[]).filter(element=>element.tabIndex>=0&&!element.matches(':disabled')&&element.checkVisibility()&&!element.closest('[popover]'));const index=controls.indexOf(trigger.current!);close();(controls[index+1]??trigger.current)?.focus()}return}
  const input=event.target===search.current,items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]:not(:disabled)')]
  if(input){
   if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();event.stopPropagation();(event.key==='ArrowUp'?items.at(-1):items.find(item=>item.getAttribute('aria-checked')==='true')??items[0])?.focus()}
   else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();if(query.trim()&&filtered[0])change(filtered[0].value)}
   else if(!['Escape','Tab'].includes(event.key))event.stopPropagation()
  }else if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();event.stopPropagation();const index=items.indexOf(document.activeElement as HTMLButtonElement);items[event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowUp'?-1:1)+items.length)%items.length]?.focus()
  }else if(event.key.length===1&&event.key!==' '&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopPropagation();setQuery(value=>value+event.key);search.current?.focus()}
 }
 if(!rows.length)return null
 const focusSearch=typeof window==='undefined'||!window.matchMedia('(pointer:coarse)').matches
 return <div className="native-field native-font-field native-text-style-field" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))close()}}>
  <span>文本样式</span><button ref={trigger} type="button" aria-label={`文本样式：${label}`} disabled={disabled} aria-haspopup="menu" aria-expanded={open} onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();reveal(event.key)}}} onClick={event=>{if(open)close();else reveal(event.detail===0?'ArrowDown':null)}}><span>{label}</span><EditorIcon name="chevron" size={12}/></button>
  {open&&!disabled&&<FloatingPopover anchor={trigger} label="文本样式选项" role="menu" align="start" matchAnchorWidth stableWhileOpen gap={6} initialFocusSelector={openingKey.current?(selected||custom?'[role=menuitemradio][aria-checked=true]':openingKey.current==='ArrowUp'?'.native-font-list>div:last-child [role=menuitemradio]':'[role=menuitemradio]'):focusSearch?'input':undefined} onClose={close} className="native-font-popup native-element-font-popup native-text-style-popup">
   <div onKeyDown={keyDown}>
    <div className="native-font-search"><div className="native-font-search-box"><EditorIcon name="search" size={14}/><input ref={search} aria-label="搜索文本样式" placeholder="搜索文本样式" value={query} autoComplete="off" spellCheck={false} onChange={event=>setQuery(event.target.value)}/>{query&&<button type="button" className="native-font-clear" aria-label="清空文本样式搜索" tabIndex={-1} onMouseDown={event=>event.preventDefault()} onClick={()=>{setQuery('');search.current?.focus()}}><EditorIcon name="close" size={12}/></button>}</div></div>
    <div className="native-font-list" role="group">{filtered.map((row,index)=><div key={row.value}>{index===1&&filtered[0].current&&<div role="separator" className="native-text-style-separator"/>}<button type="button" className="native-font-option" role="menuitemradio" tabIndex={-1} aria-checked={row.checked} onClick={()=>change(row.value)}><span className="native-text-style-option"><span style={{fontFamily:editorFontFamily(row.family),fontSize:Math.min(20,Math.max(13,row.size/2.4)),...(row.current?{fontWeight:primaryMetrics?.weight??node.style.fontWeight,fontStyle:primaryMetrics?.italic?'italic':undefined}:{})}}>{row.name||editorFontChoice(row.family)?.label||'自定义'}</span><span className="native-text-style-hint">{row.current?Math.round(row.size):row.size}像素</span></span>{row.checked&&<EditorIcon name="check" size={16}/>}</button></div>)}{!filtered.length&&<button type="button" className="native-text-style-empty" role="menuitem" disabled>未找到匹配样式</button>}</div>
   </div>
  </FloatingPopover>}
 </div>
}
