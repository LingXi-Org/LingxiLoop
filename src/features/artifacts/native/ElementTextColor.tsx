import {useLayoutEffect,useRef,useState} from 'react'
import {CaseSensitive} from 'lucide-react'
import type {ArtifactDocument} from '../../../../shared/artifact-document'
import {ColorField} from './ColorField'
import {renderedTextContrast,type RenderedTextContrast} from './rendered-text-contrast'
import {formatTextContrast} from './text-contrast'
import './element-text-color.css'

export default function ElementTextColor({document,pageId,nodeId,value,disabled,onChange}:{document:ArtifactDocument;pageId:string;nodeId:string;value:string;disabled:boolean;onChange(value:string):void}){
 const root=useRef<HTMLDivElement>(null),[contrast,setContrast]=useState<RenderedTextContrast|null>(null)
 useLayoutEffect(()=>{
  const scope=root.current?.closest<HTMLElement>('[data-native-artifact-editor]'),element=scope?.querySelector<HTMLElement>(`[data-page-id="${CSS.escape(pageId)}"] [data-node-id="${CSS.escape(nodeId)}"]`)
  if(disabled||!scope||!element){setContrast(null);return}
  const update=()=>setContrast(renderedTextContrast(element,scope)),observer=new ResizeObserver(update)
  update();observer.observe(element)
  scope.addEventListener('scroll',update,true)
  return()=>{observer.disconnect();scope.removeEventListener('scroll',update,true)}
 },[document,pageId,nodeId,disabled])
 const verdict=contrast?.passed?'对比度良好':'对比度不足',ratio=contrast?formatTextContrast(contrast.ratio):'',description=contrast?`文字与背景颜色的对比度为 ${ratio}:1，${verdict}。`:undefined
 return <div ref={root} className="native-element-text-color"><ColorField label="颜色" value={value} onChange={onChange} description={description}/>{contrast&&<div className="native-text-contrast-row"><span/><span className="native-text-contrast" data-verdict={contrast.passed?'pass':'fail'} aria-hidden="true" title={`与背景颜色的对比度为 ${ratio}:1`}><span className="native-text-contrast-swatch" style={{color:contrast.foreground,backgroundColor:contrast.background}}><CaseSensitive size={12} strokeWidth={1.5}/></span><span>{verdict}</span></span></div>}</div>
}
