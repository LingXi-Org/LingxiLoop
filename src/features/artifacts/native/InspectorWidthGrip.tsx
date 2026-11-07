import {useLayoutEffect,useRef,useState,type RefObject} from 'react'

const preference='lingxi-native/design-panel-width'
const minimum=285
const maximum=(width:number)=>Math.max(minimum,Math.min(560,width-120))
const clamp=(value:number,max:number)=>Math.max(minimum,Math.min(max,Math.round(value)))

/** A workspace preference; resizing never creates a document operation. */
export function useDesignInspectorWidth(aside:RefObject<HTMLElement|null>,enabled:boolean,width:number,setWidth:(value:number)=>void){
  const latest=useRef({width,setWidth});latest.current={width,setWidth}
  const [max,setMax]=useState(560)
  const defaultWidth=useRef(matchMedia('(pointer: coarse)').matches?376:336)
  useLayoutEffect(()=>{
    if(!enabled)return
    const root=aside.current?.closest<HTMLElement>('[data-native-artifact-editor]');if(!root)return
    let initial=latest.current.width,hasPreference=false
    try{const value=JSON.parse(localStorage.getItem(preference)??'null');if(typeof value==='number'&&Number.isFinite(value)){initial=value;hasPreference=true}}catch{}
    const initialMax=maximum(root.clientWidth);setMax(initialMax);latest.current.setWidth(clamp(!hasPreference&&initial===336?defaultWidth.current:initial,initialMax))
    const observer=new ResizeObserver(()=>{const nextMax=maximum(root.clientWidth);setMax(nextMax);const next=clamp(latest.current.width,nextMax);if(next!==latest.current.width)latest.current.setWidth(next)})
    observer.observe(root);return()=>observer.disconnect()
  },[aside,enabled])
  return{max,defaultWidth:defaultWidth.current}
}

export default function InspectorWidthGrip({width,max,defaultWidth,setWidth}:{width:number;max:number;defaultWidth:number;setWidth(value:number):void}){
  const drag=useRef<{x:number;width:number}|null>(null),latest=useRef(width);latest.current=width
  const update=(value:number,persist=false)=>{const next=clamp(value,max);latest.current=next;setWidth(next);if(persist)try{localStorage.setItem(preference,JSON.stringify(next))}catch{}}
  const finish=()=>{if(!drag.current)return;drag.current=null;try{localStorage.setItem(preference,JSON.stringify(latest.current))}catch{}}
  return <div className="native-inspector-width-grip" role="separator" aria-label="调整属性面板宽度" aria-orientation="vertical" aria-valuemin={minimum} aria-valuemax={max} aria-valuenow={width} tabIndex={0}
    onPointerDown={event=>{if(!event.isPrimary||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={x:event.clientX,width}}}
    onPointerMove={event=>{if(drag.current)update(drag.current.width+drag.current.x-event.clientX)}}
    onPointerUp={event=>{finish();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}} onPointerCancel={finish} onLostPointerCapture={finish}
    onDoubleClick={()=>update(defaultWidth,true)}
    onKeyDown={event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(event.key))return;event.stopPropagation();if(event.ctrlKey||event.metaKey||event.altKey)return;event.preventDefault();if(event.key==='ArrowLeft'||event.key==='ArrowRight')update(width+(event.key==='ArrowLeft'?1:-1)*(event.shiftKey?32:8),true);else if(!event.shiftKey&&event.key==='Home')update(minimum,true);else if(!event.shiftKey&&event.key==='End')update(max,true)}}><span aria-hidden="true"/></div>
}
