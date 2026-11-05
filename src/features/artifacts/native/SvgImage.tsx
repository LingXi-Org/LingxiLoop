import { useEffect, useState } from 'react'
import { cachedSvgImage, observeSvgImage, rememberSvgImage } from './svg-image-cache'
import { runArtifactRealm } from './artifact-realm'

export function SvgImage({source,alt,fontFamily,thumbnail}:{source:string;alt:string;fontFamily?:string;thumbnail?:{width:number;height:number}}) {
  const key=`${fontFamily??''}\0${source}`,needsFonts=/<text(?:\s|>)/.test(source)
  const [attempt,setAttempt]=useState(0),[isolated,setIsolated]=useState(false)
  const [result,setResult]=useState<{key:string;attempt:number;url?:string;failed?:boolean;moduleFailed?:boolean}>()
  const current=result?.key===key&&result.attempt===attempt?result:undefined
  useEffect(()=>{
    if(!needsFonts)return
    const cached=cachedSvgImage(key);if(cached){setResult({key,attempt,url:cached});return}
    const controller=new AbortController(),stop=observeSvgImage(key,url=>{if(!controller.signal.aborted)setResult({key,attempt,url})})
    let moduleLoaded=isolated
    const pending=isolated?runArtifactRealm({type:'svg-font-image',source,fontFamily},{signal:controller.signal}):import('./svg-font-image').then(module=>{moduleLoaded=true;return module.svgFontImage(source,fontFamily,controller.signal)})
    void pending.then(url=>{
      if(!controller.signal.aborted){if(isolated)rememberSvgImage(key,url);setResult({key,attempt,url})}
    }).catch(()=>{if(!controller.signal.aborted&&!cachedSvgImage(key))setResult(previous=>previous?.key===key&&previous.attempt===attempt&&previous.url?previous:{key,attempt,failed:true,moduleFailed:!moduleLoaded})})
    return()=>{stop();controller.abort()}
  },[key,source,fontFamily,attempt,needsFonts,isolated])
  const url=needsFonts?current?.url:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`
  const failed=()=>setResult({key,attempt,failed:true})
  if(thumbnail)return current?.failed?<text x={4} y={18} fontSize={12}>图形加载失败</text>:url?<image href={url} width={thumbnail.width} height={thumbnail.height} onError={failed} />:<g aria-busy="true"><rect width={thumbnail.width} height={thumbnail.height} fill="#e8eaee" /><text x={4} y={18} fontSize={12}>正在加载图形…</text></g>
  if(current?.failed)return <button type="button" onClick={()=>{if(current.moduleFailed)setIsolated(true);setAttempt(value=>value+1)}}>重试图形</button>
  return url?<img src={url} alt={alt} draggable={false} className="native-svg-image" onError={failed} />:<span aria-busy="true" style={{fontSize:14}}>正在加载图形…</span>
}
